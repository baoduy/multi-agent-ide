import { spawn } from "node:child_process";
import { createGit } from "../infrastructure/utils/createGit";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import type { IPCBridge } from "../ipc/IPCBridge";
import type { ConfigManager } from "../config/ConfigManager";
import { DEFAULT_SPECIFY_COMMAND } from "@magenta/shared/config";
import { AppError } from "../errors/AppError";
import { sanitizeName } from "../domain/sanitizeName";

/**
 * Supported AI agents for Specify onboarding.
 * Kept in sync with spec-kit's AGENT_CONFIG.
 */
export const SPECIFY_AI_AGENTS = [
  { id: "claude", label: "Claude Code" },
  { id: "copilot", label: "GitHub Copilot" },
] as const;

export type SpecifyAiAgent = (typeof SPECIFY_AI_AGENTS)[number];

/**
 * OnboardApplicationService handles both initial onboarding and upgrading
 * Specify for repos. Uses a configurable command template from settings.
 *
 * The command template uses {agent} as a placeholder, replaced with the selected AI agent id.
 * The same command is used for both onboard and upgrade.
 */
export class OnboardApplicationService {
  private readonly activeProcesses = new Map<string, ReturnType<typeof spawn>>();

  constructor(
    private bridge: IPCBridge,
    private configManager: ConfigManager,
  ) {}

  /**
   * Onboards a repo to Specify using the configured command template.
   * Both onboard and upgrade use the same {args} = "--here --force".
   * Optionally creates a new worktree first.
   */
  async onboard(repoPath: string, aiAgent: string, useWorktree?: boolean): Promise<void> {
    if (this.activeProcesses.has(repoPath)) {
      throw new AppError("VALIDATION_ERROR", `Onboarding already in progress for ${repoPath}`);
    }

    const validAgent = SPECIFY_AI_AGENTS.find((a) => a.id === aiAgent);
    if (!validAgent) {
      throw new AppError("VALIDATION_ERROR", `Unknown AI agent: ${aiAgent}`);
    }

    let targetPath = repoPath;

    if (useWorktree) {
      try {
        targetPath = await this.createOnboardWorktree(repoPath);
        this.bridge.emit({
          type: "repo:onboard:output",
          repoPath,
          data: `Created worktree at: ${targetPath}\n\n`,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[onboard-service] Failed to create worktree: ${errMsg}`);
        this.bridge.emit({
          type: "repo:onboard:complete",
          repoPath,
          success: false,
          error: `Failed to create worktree: ${errMsg}`,
        });
        return;
      }
    }

    console.log(`[onboard-service] Starting onboard for ${targetPath} with agent ${aiAgent} (worktree: ${useWorktree ?? false})`);
    this.bridge.emit({ type: "repo:onboard:started", repoPath });

    const fullCommand = this.buildCommand(aiAgent);

    this.bridge.emit({
      type: "repo:onboard:output",
      repoPath,
      data: `$ ${fullCommand}\n`,
    });

    await this.runCommand(
      repoPath,
      targetPath,
      fullCommand,
      "repo:onboard:output",
      "repo:onboard:complete",
    );
  }

  /**
   * Upgrades Specify for a repo that already has a .specify folder.
   * Uses the same configured command template as onboard.
   * Reads the existing AI agent from .specify/init-options.json.
   */
  async upgrade(repoPath: string): Promise<void> {
    if (this.activeProcesses.has(repoPath)) {
      throw new AppError("VALIDATION_ERROR", `Upgrade already in progress for ${repoPath}`);
    }

    const aiAgent = this.readInitOptionsAgent(repoPath) ?? "claude";

    console.log(`[onboard-service] Starting upgrade for ${repoPath} (agent: ${aiAgent})`);
    this.bridge.emit({ type: "repo:upgrade-specify:started", repoPath });

    const fullCommand = this.buildCommand(aiAgent);

    this.bridge.emit({
      type: "repo:upgrade-specify:output",
      repoPath,
      data: `$ ${fullCommand}\n`,
    });

    await this.runCommand(
      repoPath,
      repoPath,
      fullCommand,
      "repo:upgrade-specify:output",
      "repo:upgrade-specify:complete",
    );
  }

  /**
   * Switches the Specify integration to a different AI agent using
   * `specify integration switch {agent}`. Much lighter than a full re-onboard.
   */
  async switchIntegration(repoPath: string, aiAgent: string): Promise<void> {
    if (this.activeProcesses.has(repoPath)) {
      throw new AppError("VALIDATION_ERROR", `Process already in progress for ${repoPath}`);
    }

    const validAgent = SPECIFY_AI_AGENTS.find((a) => a.id === aiAgent);
    if (!validAgent) {
      throw new AppError("VALIDATION_ERROR", `Unknown AI agent: ${aiAgent}`);
    }

    console.log(`[onboard-service] Switching integration for ${repoPath} to ${aiAgent}`);
    this.bridge.emit({ type: "repo:onboard:started", repoPath });

    const fullCommand = this.buildSwitchCommand(aiAgent);

    this.bridge.emit({
      type: "repo:onboard:output",
      repoPath,
      data: `$ ${fullCommand}\n`,
    });

    await this.runCommand(
      repoPath,
      repoPath,
      fullCommand,
      "repo:onboard:output",
      "repo:onboard:complete",
    );
  }

  /**
   * Cancels a running onboard or upgrade process by killing the spawned child process.
   */
  cancel(repoPath: string): void {
    const child = this.activeProcesses.get(repoPath);
    if (!child) {
      console.warn(`[onboard-service] No active process found for ${repoPath}`);
      return;
    }

    console.log(`[onboard-service] Cancelling process for ${repoPath}`);
    child.kill("SIGTERM");

    // Give it a moment, then force kill if still alive
    setTimeout(() => {
      if (this.activeProcesses.has(repoPath)) {
        try {
          child.kill("SIGKILL");
        } catch {
          // Already dead
        }
        this.activeProcesses.delete(repoPath);
      }
    }, 2000);
  }

  /**
   * Builds a shell command from the configured template by replacing {agent}.
   * Returns the first token as the command and the rest as args for spawn().
   */
  private buildCommand(agent: string): string {
    const template = this.configManager.getConfig().specifyCommand || DEFAULT_SPECIFY_COMMAND;

    return template
      .replace(/\{agent\}/g, agent)
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Builds a `specify integration switch {agent}` command by extracting the
   * specify runner prefix from the configured init command template.
   * E.g. if template is "uvx --from ... specify init --here --ai {agent} --force"
   * we extract "uvx --from ... specify" and append "integration switch {agent}".
   */
  private buildSwitchCommand(agent: string): string {
    const template = this.configManager.getConfig().specifyCommand || DEFAULT_SPECIFY_COMMAND;

    // Find the "specify" token in the template and take everything up to and including it
    const tokens = template.replace(/\s+/g, " ").trim().split(" ");
    const specifyIdx = tokens.indexOf("specify");
    const prefix = specifyIdx >= 0 ? tokens.slice(0, specifyIdx + 1) : tokens.slice(0, 1);

    return [...prefix, "integration", "switch", agent].join(" ");
  }

  /**
   * Creates a worktree for onboarding. Auto-generates a name like
   * `specify-init-<branch>-<timestamp>` under the `.worktrees/` directory.
   * Returns the absolute path of the created worktree.
   */
  private async createOnboardWorktree(repoPath: string): Promise<string> {
    const resolved = resolve(repoPath);
    const git = createGit(resolved);

    // Get the current branch name
    let currentBranch = "main";
    try {
      currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
    } catch {
      // fallback to "main"
    }

    // Sanitize branch name for use in directory/branch name.
    // `sanitizeName` returns "" for an input made entirely of special chars
    // (e.g. a branch literally named "!@#$"). Without this guard the resulting
    // worktree path and branch would be malformed and the subsequent git
    // checkout would fail with a cryptic error. WorktreeApplicationService
    // already guards the user-facing flow; keep the same guard here for the
    // onboarding-only path.
    const rawSafeBranch = sanitizeName(currentBranch);
    if (!rawSafeBranch) {
      throw new AppError(
        "WORKTREE_CONFLICT",
        `Cannot derive a worktree name from branch "${currentBranch}" — it contains no usable characters.`,
      );
    }
    const safeBranch = rawSafeBranch;
    const timestamp = Math.floor(Date.now() / 1000);
    const worktreeName = `specify-init-${safeBranch}-${timestamp}`;
    const newBranch = `specify-init/${safeBranch}`;

    // Create in .worktrees/ directory (standard for this project)
    const worktreeDir = join(resolved, ".worktrees");
    if (!existsSync(worktreeDir)) {
      mkdirSync(worktreeDir, { recursive: true });
    }

    const worktreePath = join(worktreeDir, worktreeName);

    console.log(`[onboard-service] Creating worktree: ${worktreePath} (branch: ${newBranch})`);

    // Create the worktree with a new branch from current HEAD
    try {
      await git.raw(["worktree", "add", worktreePath, "-b", newBranch]);
    } catch {
      // Branch may already exist — try without -b
      try {
        await git.raw(["worktree", "add", worktreePath, newBranch]);
      } catch (err2) {
        // Last resort: detach from HEAD
        await git.raw(["worktree", "add", "--detach", worktreePath]);
      }
    }

    // Ensure .worktrees is in .gitignore
    this.ensureGitignoreEntry(resolved, ".worktrees");

    return worktreePath;
  }

  /**
   * Ensure an entry exists in .gitignore.
   */
  private ensureGitignoreEntry(repoPath: string, entry: string): void {
    const gitignorePath = join(repoPath, ".gitignore");
    try {
      if (existsSync(gitignorePath)) {
        const content = readFileSync(gitignorePath, "utf-8");
        if (!content.includes(entry)) {
          const { appendFileSync } = require("node:fs");
          appendFileSync(gitignorePath, `\n${entry}/\n`, "utf-8");
        }
      }
    } catch {
      // Ignore .gitignore errors
    }
  }

  /**
   * Returns the Specify onboard status for a repo: whether .specify/ exists
   * and which AI agent is configured (or null if not onboarded).
   * Checks integration.json first (canonical after switch), then init-options.json.
   */
  getSpecifyStatus(repoPath: string): { hasSpecs: boolean; currentAgent: string | null } {
    const specifyDir = join(repoPath, ".specify");
    const hasSpecs = existsSync(specifyDir);
    const currentAgent = hasSpecs
      ? this.readCurrentIntegration(repoPath) ?? this.readInitOptionsAgent(repoPath)
      : null;
    return { hasSpecs, currentAgent };
  }

  /**
   * Reads the current integration from .specify/integration.json.
   * This is the canonical source after `specify integration switch`.
   */
  private readCurrentIntegration(repoPath: string): string | null {
    const integrationPath = join(repoPath, ".specify", "integration.json");
    try {
      if (existsSync(integrationPath)) {
        const content = readFileSync(integrationPath, "utf-8");
        const data = JSON.parse(content) as Record<string, unknown>;
        if (typeof data.integration === "string") {
          return data.integration;
        }
      }
    } catch (err) {
      console.warn(`[onboard-service] Could not read integration.json: ${err}`);
    }
    return null;
  }

  /**
   * Reads the AI agent from .specify/init-options.json if it exists.
   */
  private readInitOptionsAgent(repoPath: string): string | null {
    const optionsPath = join(repoPath, ".specify", "init-options.json");
    try {
      if (existsSync(optionsPath)) {
        const content = readFileSync(optionsPath, "utf-8");
        const options = JSON.parse(content) as Record<string, unknown>;
        if (typeof options.ai === "string") {
          return options.ai;
        }
      }
    } catch (err) {
      console.warn(`[onboard-service] Could not read init-options.json: ${err}`);
    }
    return null;
  }

  /**
   * Spawns a command, streams its output via IPC, and optionally emits a
   * completion event. Consolidates the formerly separate runCommand / runCommandSync
   * methods — the only difference was whether a completeEvent was emitted.
   *
   * @param repoPath - The original repo path (used as key for IPC events)
   * @param cwd - The actual working directory to run the command in
   * @param completeEvent - If provided, emits this event on close/error. When
   *   omitted the caller is responsible for signalling completion.
   */
  /**
   * Shell-metacharacter allowlist for command tokens. Anything outside this
   * set is rejected: semicolons, pipes, backticks, `$()`, redirections,
   * quoting, globs — the usual cast of shell-injection enablers. URLs,
   * version specifiers, typical CLI flags, and simple identifiers are all
   * fine. The `{agent}` placeholder has already been substituted by the
   * time we reach here, so literal `{}` is also disallowed.
   */
  private static readonly SAFE_TOKEN = /^[A-Za-z0-9_@:/.\-+=~,%]+$/;

  private tokenizeSafely(command: string): string[] {
    const tokens = command
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    for (const token of tokens) {
      if (!OnboardApplicationService.SAFE_TOKEN.test(token)) {
        throw new AppError(
          "VALIDATION_ERROR",
          `Onboard command contains unsafe characters: ${JSON.stringify(token)}`,
        );
      }
    }
    if (tokens.length === 0) {
      throw new AppError("VALIDATION_ERROR", "Onboard command is empty");
    }
    return tokens;
  }

  private runCommand(
    repoPath: string,
    cwd: string,
    fullCommand: string,
    outputEvent: "repo:onboard:output" | "repo:upgrade-specify:output",
    completeEvent?: "repo:onboard:complete" | "repo:upgrade-specify:complete",
  ): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      // Tokenize + validate, then spawn with `shell: false` so none of the
      // tokens pass through a shell interpreter. This is the primary defense
      // against injection via the configurable `specifyCommand` template.
      let argv: string[];
      try {
        argv = this.tokenizeSafely(fullCommand);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (completeEvent) {
          this.bridge.emit({ type: completeEvent, repoPath, success: false, error: message });
          resolve(false);
        } else {
          reject(err);
        }
        return;
      }
      const [command, ...args] = argv;
      const child = spawn(command, args, {
        cwd,
        shell: false,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      this.activeProcesses.set(repoPath, child);

      const emitOutput = (data: Buffer) => {
        const text = data.toString("utf-8");
        this.bridge.emit({ type: outputEvent, repoPath, data: text });
      };

      child.stdout?.on("data", emitOutput);
      child.stderr?.on("data", emitOutput);

      child.on("close", (code) => {
        this.activeProcesses.delete(repoPath);
        const success = code === 0;
        console.log(`[onboard-service] Command finished for ${repoPath} (exit ${code})`);

        if (completeEvent) {
          this.bridge.emit({
            type: completeEvent,
            repoPath,
            success,
            error: success ? undefined : `Process exited with code ${code}`,
          });
        }

        resolve(success);
      });

      child.on("error", (err) => {
        this.activeProcesses.delete(repoPath);
        console.error(`[onboard-service] Spawn error for ${repoPath}:`, err.message);

        if (completeEvent) {
          this.bridge.emit({
            type: completeEvent,
            repoPath,
            success: false,
            error: err.message,
          });
          resolve(false);
        } else {
          reject(new AppError("INTERNAL_ERROR", `Failed to start command: ${err.message}`));
        }
      });
    });
  }
}
