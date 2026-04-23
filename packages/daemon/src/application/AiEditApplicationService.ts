import type { AiEditAction, AiEditConfig } from "@magenta/shared/ipc";
import type { AiCliGateway } from "../infrastructure/AiCliGateway";
import type { AiConfigRepository } from "../infrastructure/AiConfigRepository";
import { AppError } from "../errors/AppError";
import {
  renderAskPrompt,
  renderAskSpecPrompt,
  renderAskSpecSystemPrompt,
  renderEditSelectionPrompt,
  renderModifyDocumentPrompt,
  stripOuterFencing,
  type ChatTurn,
} from "../domain/aiActionTemplates";

export interface AskArgs {
  repoPath: string;
  userMessage: string;
  history: ChatTurn[];
  documentText: string;
  selection?: { start: number; end: number; text: string };
}

export interface EditSelectionArgs {
  repoPath: string;
  instruction: string;
  documentText: string;
  selection: { start: number; end: number; text: string };
}

export interface ModifyDocumentArgs {
  repoPath: string;
  instruction: string;
  documentText: string;
}

export interface AskSpecArgs {
  repoPath: string;
  specName: string;
  specRelPath: string;
  currentFileName?: string;
  userMessage: string;
  history: ChatTurn[];
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
    const prompt = renderAskPrompt({
      userMessage: args.userMessage,
      history: args.history,
      documentText: args.documentText,
      selection: args.selection,
    });
    return this.run(args.repoPath, prompt);
  }

  async editSelection(args: EditSelectionArgs): Promise<string> {
    const prompt = renderEditSelectionPrompt({
      instruction: args.instruction,
      documentText: args.documentText,
      selection: args.selection,
    });
    const raw = await this.run(args.repoPath, prompt);
    return stripOuterFencing(raw);
  }

  async modifyDocument(args: ModifyDocumentArgs): Promise<string> {
    const prompt = renderModifyDocumentPrompt({
      instruction: args.instruction,
      documentText: args.documentText,
    });
    const raw = await this.run(args.repoPath, prompt);
    return stripOuterFencing(raw);
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
    });
    return stripOuterFencing(raw);
  }

  private async run(repoPath: string, prompt: string): Promise<string> {
    const config = this.configRepo.loadConfig(repoPath);
    return this.cliGateway.run(config.provider, config.model, prompt, {
      timeoutMs: config.timeoutMs,
      extraArgs: config.extraArgs,
      cwd: repoPath,
    });
  }
}
