import path from "node:path";
import type { AiEditAction, AiEditConfig } from "@magenta/shared/ipc";
import type { AIProvider } from "@magenta/shared/aiTerminal";
import type { AiCliGateway } from "../infra/AiCliGateway";
import type { AiConfigRepository } from "../infra/AiConfigRepository";
import type { ChatThreadService } from "../../chat/app/ChatThreadService";
import { AppError } from "../../../core/errors/AppError";
import {
  renderAskPrompt,
  renderAskRepoAwareSystemPrompt,
  renderAskSpecPrompt,
  renderAskSpecSystemPrompt,
  renderEditSelectionPrompt,
  renderModifyDocumentPrompt,
  stripOuterFencing,
  type ChatTurn,
} from "../core/aiActionTemplates";

export interface AskArgs {
  repoPath: string;
  /**
   * Absolute path to the file the user is asking about. When present and
   * the file lives inside `repoPath`, the service switches to repo-aware
   * ask mode (see `ask` below). Omitted for callers that don't know the
   * file path (e.g. legacy tests).
   */
  filePath?: string;
  userMessage: string;
  history: ChatTurn[];
  documentText: string;
  selection?: { start: number; end: number; text: string };
  /** Streaming + session-continuity optionals. Forwarded to the CLI gateway. */
  onChunk?: (delta: string, kind: "text" | "thinking") => void;
  onSessionId?: (sessionId: string) => void;
  resumeSessionId?: string;
  /** UI-selected provider override; falls back to disk config when absent. */
  provider?: AIProvider;
  /** Phase 8 — thread id (UUID) for persisting the resulting turn. */
  sessionId?: string;
  /** Phase 8 — absolute file path used for persistence (mirrors `filePath`). */
}

export interface EditSelectionArgs {
  repoPath: string;
  instruction: string;
  documentText: string;
  selection: { start: number; end: number; text: string };
  /** Phase 5 — caller-provided canonical sessionId; threaded as `--resume`. Phase 8 — also used as thread id for persistence. */
  sessionId?: string;
}

export interface ModifyDocumentArgs {
  repoPath: string;
  instruction: string;
  documentText: string;
  /** Phase 5 — caller-provided canonical sessionId; threaded as `--resume`. Phase 8 — also used as thread id for persistence. */
  sessionId?: string;
}

export interface AskSpecArgs {
  repoPath: string;
  specName: string;
  specRelPath: string;
  currentFileName?: string;
  userMessage: string;
  history: ChatTurn[];
  /** Streaming + session-continuity optionals. Forwarded to the CLI gateway. */
  onChunk?: (delta: string, kind: "text" | "thinking") => void;
  onSessionId?: (sessionId: string) => void;
  resumeSessionId?: string;
}

/**
 * Coordinates the AI chat bubble: loads config, renders the mode-specific
 * prompt template, invokes the CLI gateway. Handlers delegate here; this
 * is the only place the three collaborators (config repo, CLI gateway,
 * prompt templates) come together.
 *
 * The class name is kept as `AiEditApplicationService` so `DaemonContainer`
 * wiring does not need to change — the settings view still calls
 * `getConfig` / `listActions` on this service.
 */
export class AiEditApplicationService {
  constructor(
    private readonly configRepo: AiConfigRepository,
    private readonly cliGateway: AiCliGateway,
    private readonly chatThreadService?: ChatThreadService,
  ) {}

  /* ─── Settings view ───────────────────────────────────────────── */

  getConfig(repoPath: string): AiEditConfig {
    return this.configRepo.loadConfig(repoPath);
  }

  listActions(repoPath: string): AiEditAction[] {
    return this.configRepo.listActions(repoPath);
  }

  /* ─── Chat bubble ─────────────────────────────────────────────── */

  async ask(args: AskArgs): Promise<string> {
    const config = this.configRepo.loadConfig(args.repoPath);
    const provider: AIProvider = args.provider ?? config.provider;

    // Capture provider session id even if caller didn't subscribe — needed
    // so persistTurn can record it on the thread row.
    let capturedProviderSessionId: string | undefined;
    const onSessionId = (sid: string) => {
      capturedProviderSessionId = sid;
      args.onSessionId?.(sid);
    };

    // Repo-aware branch: Claude reads the file (and neighbors) itself via
    // its native Read/Glob/Grep tools instead of receiving the whole doc
    // packed into the prompt.
    const fileRelPath = resolveRelPathInside(args.repoPath, args.filePath);
    let text: string;
    if (fileRelPath && provider === "claude") {
      const systemPromptAppend = renderAskRepoAwareSystemPrompt({
        fileRelPath,
        selection: args.selection,
      });
      const prompt = renderAskSpecPrompt({
        userMessage: args.userMessage,
        history: args.history,
      });
      text = await this.cliGateway.run(provider, config.model, prompt, {
        timeoutMs: config.timeoutMs,
        extraArgs: config.extraArgs,
        cwd: args.repoPath,
        systemPromptAppend,
        permissionMode: "plan",
        allowedTools: ["Read", "Glob", "Grep"],
        disallowedTools: ["Bash", "Edit", "Write", "MultiEdit", "NotebookEdit"],
        onChunk: args.onChunk,
        onSessionId,
        resumeSessionId: args.resumeSessionId,
      });
    } else {
      // Legacy packed-prompt fallback.
      const prompt = renderAskPrompt({
        userMessage: args.userMessage,
        history: args.history,
        documentText: args.documentText,
        selection: args.selection,
      });
      text = await this.run(args.repoPath, prompt, {
        onChunk: args.onChunk,
        onSessionId,
        resumeSessionId: args.resumeSessionId,
        providerOverride: provider,
      });
    }

    if (args.sessionId && this.chatThreadService) {
      this.chatThreadService.persistTurn(args.sessionId, {
        userMessage: args.userMessage,
        assistantText: text,
        providerSessionId: capturedProviderSessionId,
      });
    }
    return text;
  }

  async editSelection(args: EditSelectionArgs): Promise<string> {
    const prompt = renderEditSelectionPrompt({
      instruction: args.instruction,
      documentText: args.documentText,
      selection: args.selection,
    });
    let capturedProviderSessionId: string | undefined;
    const raw = await this.run(args.repoPath, prompt, {
      resumeSessionId: args.sessionId,
      onSessionId: (sid) => { capturedProviderSessionId = sid; },
    });
    const newText = stripOuterFencing(raw);
    if (args.sessionId && this.chatThreadService) {
      this.chatThreadService.persistTurn(args.sessionId, {
        userMessage: args.instruction,
        assistantText: newText,
        providerSessionId: capturedProviderSessionId,
      });
    }
    return newText;
  }

  async modifyDocument(args: ModifyDocumentArgs): Promise<string> {
    const prompt = renderModifyDocumentPrompt({
      instruction: args.instruction,
      documentText: args.documentText,
    });
    let capturedProviderSessionId: string | undefined;
    const raw = await this.run(args.repoPath, prompt, {
      resumeSessionId: args.sessionId,
      onSessionId: (sid) => { capturedProviderSessionId = sid; },
    });
    const newDoc = stripOuterFencing(raw);
    if (args.sessionId && this.chatThreadService) {
      this.chatThreadService.persistTurn(args.sessionId, {
        userMessage: args.instruction,
        assistantText: newDoc,
        providerSessionId: capturedProviderSessionId,
      });
    }
    return newDoc;
  }

  /**
   * Spec-folder review chat. Instead of packaging every file into a prompt,
   * we let the Claude agent read files itself: cwd is set to the repo root
   * and an appended system prompt scopes its Read/Glob/Grep tool calls to
   * the spec folder. Permission mode is `"plan"` (read-only by convention
   * in Claude Code).
   *
   * Claude-only for v1. Copilot returns `AI_PROVIDER_NOT_AVAILABLE`.
   */
  async askSpec(args: AskSpecArgs): Promise<string> {
    const config = this.configRepo.loadConfig(args.repoPath);
    if (config.provider !== "claude") {
      throw new AppError(
        "AI_PROVIDER_NOT_AVAILABLE",
        "Spec chat requires the Claude provider. Set provider to \"claude\" in `.magenta/ai/config.json` to use it.",
      );
    }

    const systemPromptAppend = renderAskSpecSystemPrompt({
      specRelPath: args.specRelPath,
      specName: args.specName,
      currentFileName: args.currentFileName,
    });
    const prompt = renderAskSpecPrompt({
      userMessage: args.userMessage,
      history: args.history,
    });

    const raw = await this.cliGateway.run(config.provider, config.model, prompt, {
      timeoutMs: config.timeoutMs,
      extraArgs: config.extraArgs,
      cwd: args.repoPath,
      systemPromptAppend,
      permissionMode: "plan",
      // Pre-approve the three read-only tools the agent needs. Without this
      // the CLI hangs on every file read waiting for interactive approval.
      allowedTools: ["Read", "Glob", "Grep"],
      // Strip write / exec tools from the model's palette entirely. Belt-
      // and-braces on top of the system prompt's read-only instructions.
      disallowedTools: ["Bash", "Edit", "Write", "MultiEdit", "NotebookEdit"],
      // Streaming + session continuity for conversational turns.
      onChunk: args.onChunk,
      onSessionId: args.onSessionId,
      resumeSessionId: args.resumeSessionId,
    });
    return stripOuterFencing(raw);
  }

  /**
   * Used by the one-shot endpoints (edit-selection / modify-document) and
   * by `ask`'s legacy fallback. The optional streaming hooks are only wired
   * by `ask`.
   */
  private async run(
    repoPath: string,
    prompt: string,
    streamOpts?: {
      onChunk?: (delta: string, kind: "text" | "thinking") => void;
      onSessionId?: (sessionId: string) => void;
      resumeSessionId?: string;
      providerOverride?: AIProvider;
    },
  ): Promise<string> {
    const config = this.configRepo.loadConfig(repoPath);
    const provider = streamOpts?.providerOverride ?? config.provider;
    return this.cliGateway.run(provider, config.model, prompt, {
      timeoutMs: config.timeoutMs,
      extraArgs: config.extraArgs,
      cwd: repoPath,
      onChunk: streamOpts?.onChunk,
      onSessionId: streamOpts?.onSessionId,
      resumeSessionId: streamOpts?.resumeSessionId,
    });
  }
}

/**
 * If `filePath` is a markdown file inside `repoPath`, return its
 * repo-relative path. Otherwise return null. Used to decide whether to use
 * the repo-aware ask mode.
 *
 * "Markdown" here means `.md` or `.mdx`. Other file types fall back to the
 * legacy packed-prompt flow — we don't currently have prompt templates that
 * make sense for non-markdown content in the chat bubble.
 */
function resolveRelPathInside(repoPath: string, filePath: string | undefined): string | null {
  if (!filePath) return null;
  const absRepo = path.resolve(repoPath);
  const absFile = path.resolve(filePath);
  const rel = path.relative(absRepo, absFile);
  // Outside the repo, or the same path.
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const ext = path.extname(rel).toLowerCase();
  if (ext !== ".md" && ext !== ".mdx") return null;
  return rel;
}
