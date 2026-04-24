/**
 * Pure prompt-template helpers for the AI chat bubble.
 *
 * The daemon owns a small set of system prompts (one per chat mode) so the
 * UI can send user instructions without needing to know how to shape them
 * for the underlying CLI. Nothing in this file touches the filesystem —
 * it's pure string assembly so the domain layer stays testable.
 */

export type ActionScope = "selection" | "document";

export interface ParsedAction {
  id: string;
  label: string;
  icon?: string;
  scope: ActionScope;
  body: string;
}

/* ─── Front-matter parsing (for optional user-authored overrides) ──── */

const FRONT_MATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/;

/**
 * Parse an action file's text into structured front-matter fields + body.
 * `id` falls back to the provided `defaultId` (derived from filename).
 * Kept for the legacy action-file discovery path in `AiConfigRepository`
 * — the settings view still surfaces any `.magenta/ai/actions/*.md`
 * files a user drops in, even though the chat panel doesn't pick them.
 */
export function parseActionFile(text: string, defaultId: string): ParsedAction {
  const match = FRONT_MATTER_RE.exec(text);
  if (!match) {
    return {
      id: defaultId,
      label: defaultId,
      scope: "selection",
      body: text.trim(),
    };
  }

  const [, header, body] = match;
  const fields = parseFrontMatter(header);

  const id = (fields.id ?? defaultId).trim();
  const label = (fields.label ?? id).trim();
  const icon = fields.icon?.trim() || undefined;
  const scope: ActionScope = fields.scope === "document" ? "document" : "selection";

  return { id, label, icon, scope, body: body.trim() };
}

function parseFrontMatter(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of header.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Built-in actions list. The chat bubble doesn't use these directly — it
 * uses the system prompts below — but the settings view shows this list so
 * users know what's available if they want to author override files.
 */
export const BUILTIN_ACTIONS: readonly ParsedAction[] = [];

/* ─── Chat-mode system prompts ─────────────────────────────────────── */

/**
 * "Ask" mode: conversation only. The model must not suggest edits unless
 * asked, and never return raw document content.
 */
export const CHAT_SYSTEM =
  `You are an assistant helping the user understand and reason about a Markdown document they are editing. ` +
  `Answer questions concisely in Markdown. Do not rewrite the document; do not suggest changes unless explicitly asked. ` +
  `If the user references "the document" or "this document", interpret it as the full Markdown content shared with you.`;

/**
 * "Edit selection" mode: the model returns ONLY the replacement text for
 * the given selection — no commentary, no surrounding content.
 */
export const EDIT_SELECTION_SYSTEM =
  `You are a precise text-editor assistant. The user will give you a portion of Markdown (the "selection") and an instruction. ` +
  `Rewrite the selection according to the instruction. ` +
  `Return ONLY the replacement text — no commentary, no explanation, no surrounding document, no fenced code blocks unless the original selection was itself a fenced code block. ` +
  `Preserve meaningful whitespace at the start and end of the selection (leading/trailing spaces or newlines).`;

/**
 * "Modify document" mode: whole-document rewrites, appends, inserts. The
 * model returns ONLY the complete new document body.
 */
export const MODIFY_DOCUMENT_SYSTEM =
  `You are a precise document-editor assistant. The user will give you a full Markdown document and an instruction ` +
  `(e.g. "rewrite for clarity", "add a paragraph about X at the end", "insert a heading before Y"). ` +
  `Apply the instruction and return ONLY the complete new document body in Markdown. ` +
  `No commentary, no explanation, no fenced code wrapping around the document. ` +
  `Preserve any content the instruction did not ask you to change.`;

/* ─── Prompt assembly ──────────────────────────────────────────────── */

const MAX_HISTORY_TURNS = 20;

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AskArgs {
  userMessage: string;
  history: ChatTurn[];
  documentText: string;
  selection?: { start: number; end: number; text: string };
}

/**
 * Build the flat single-string prompt passed to the CLI in "Ask" mode.
 * CLIs don't share a structured chat protocol, so we render the
 * conversation into tagged plain text the model can follow.
 */
export function renderAskPrompt(args: AskArgs): string {
  const turns = args.history.slice(-MAX_HISTORY_TURNS);
  const lines: string[] = [CHAT_SYSTEM, ""];
  lines.push("---", "Document the user is editing:", "", args.documentText, "---", "");
  if (args.selection && args.selection.text.trim().length > 0) {
    lines.push("Selected excerpt (the user may refer to it):", "", args.selection.text, "", "---", "");
  }
  for (const turn of turns) {
    lines.push(`${turn.role === "user" ? "User" : "Assistant"}: ${turn.text}`);
  }
  lines.push(`User: ${args.userMessage}`);
  lines.push("Assistant:");
  return lines.join("\n");
}

export interface EditSelectionArgs {
  instruction: string;
  documentText: string;
  selection: { start: number; end: number; text: string };
}

export function renderEditSelectionPrompt(args: EditSelectionArgs): string {
  return [
    EDIT_SELECTION_SYSTEM,
    "",
    "--- BEGIN DOCUMENT CONTEXT (for reference only) ---",
    args.documentText,
    "--- END DOCUMENT CONTEXT ---",
    "",
    "--- BEGIN SELECTION ---",
    args.selection.text,
    "--- END SELECTION ---",
    "",
    `Instruction: ${args.instruction}`,
    "",
    "Replacement text:",
  ].join("\n");
}

export interface ModifyDocumentArgs {
  instruction: string;
  documentText: string;
}

export function renderModifyDocumentPrompt(args: ModifyDocumentArgs): string {
  return [
    MODIFY_DOCUMENT_SYSTEM,
    "",
    "--- BEGIN DOCUMENT ---",
    args.documentText,
    "--- END DOCUMENT ---",
    "",
    `Instruction: ${args.instruction}`,
    "",
    "New complete document:",
  ].join("\n");
}

/* ─── Spec-folder review chat ──────────────────────────────────────── */

/**
 * System prompt for the spec-folder review chat. Passed to Claude via
 * `--append-system-prompt`. The agent is spawned with `cwd = repoPath`,
 * so relative paths in this prompt work as-is against the Read/Glob/Grep
 * tools the agent already has.
 */
export function renderAskSpecSystemPrompt(args: {
  specRelPath: string;
  specName: string;
  currentFileName?: string;
}): string {
  const focusLine = args.currentFileName
    ? `The user is currently focused on \`${args.currentFileName}\` within that folder — prefer it as starting context when their question is ambiguous.`
    : "The user has no specific file in focus right now.";
  return [
    `You are a read-only review assistant for the software specification at \`${args.specRelPath}\` (spec name: ${args.specName}).`,
    "",
    "When the user asks a question, read the files under that folder as needed using your Read / Glob / Grep tools. Prefer listing the folder first with Glob if you do not know the file names.",
    "",
    "You MUST NOT modify, create, or delete any file. You MUST NOT call Write, Edit, MultiEdit, Bash, or any tool with side effects. This is a review-only conversation — refuse edit requests politely and explain why.",
    "",
    "Respond in Markdown. When citing content, name the file (e.g. `plan.md`) rather than line numbers.",
    "",
    focusLine,
  ].join("\n");
}

export interface AskSpecArgs {
  userMessage: string;
  history: ChatTurn[];
}

/**
 * Build the flat stdin payload for spec-folder chat. The spec-aware framing
 * lives in the appended system prompt (`renderAskSpecSystemPrompt`); here
 * we just render the conversation itself.
 */
export function renderAskSpecPrompt(args: AskSpecArgs): string {
  const turns = args.history.slice(-MAX_HISTORY_TURNS);
  const lines: string[] = [];
  for (const turn of turns) {
    lines.push(`${turn.role === "user" ? "User" : "Assistant"}: ${turn.text}`);
  }
  lines.push(`User: ${args.userMessage}`);
  lines.push("Assistant:");
  return lines.join("\n");
}

/* ─── Repo-aware ask (the file-level chat's "ask" mode) ────────────── */

/**
 * System prompt for the markdown editor's "Ask" mode when the file is inside
 * a registered working directory. Passed to Claude via
 * `--append-system-prompt`. The agent is spawned with `cwd = repoPath`, so
 * relative paths in this prompt work as-is against the Read/Glob/Grep tools.
 *
 * This lets the model answer questions about *neighboring* files in the repo
 * — which today's `renderAskPrompt` can't do because it only packs the one
 * open document into the prompt.
 */
export function renderAskRepoAwareSystemPrompt(args: {
  fileRelPath: string;
  selection?: { text: string };
}): string {
  const selectionLine = args.selection && args.selection.text.trim().length > 0
    ? `The user has the following excerpt selected in that file — it may be what they are asking about:\n\n${args.selection.text}\n`
    : "The user has no specific selection right now.";
  return [
    `You are a read-only assistant helping the user reason about the Markdown file \`${args.fileRelPath}\`.`,
    "",
    "When answering, use your Read / Glob / Grep tools to look at that file, and any neighboring files in the working directory that would help answer the question. Prefer reading the user's file first before exploring siblings.",
    "",
    "You MUST NOT modify, create, or delete any file. You MUST NOT call Write, Edit, MultiEdit, Bash, or any tool with side effects. Refuse edit requests politely — this conversation is read-only. For edits, the user has separate editor actions they can invoke.",
    "",
    "Respond concisely in Markdown. When citing content, name the file (e.g. `plan.md`) rather than line numbers.",
    "",
    selectionLine,
  ].join("\n");
}

/* ─── Output cleanup ────────────────────────────────────────────────── */

/**
 * Strip the most common "safety fencing" some models add even when asked
 * not to: a single outer ```markdown (or ```) wrapper around the body.
 * Leaves inner fenced code blocks intact.
 */
export function stripOuterFencing(text: string): string {
  const trimmed = text.trim();
  const fenceRe = /^```[a-zA-Z0-9-]*\r?\n([\s\S]*?)\r?\n```$/;
  const match = fenceRe.exec(trimmed);
  return match ? match[1] : trimmed;
}
