import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
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
  { id: "cursor-agent", label: "Cursor" },
  { id: "gemini", label: "Gemini CLI" },
  { id: "codex", label: "Codex CLI" },
  { id: "windsurf", label: "Windsurf" },
  { id: "amp", label: "Amp" },
  { id: "qwen", label: "Qwen Code" },
  { id: "opencode", label: "OpenCode" },
  { id: "junie", label: "Junie" },
  { id: "kilocode", label: "Kilo Code" },
  { id: "roo", label: "Roo Code" },
  { id: "kiro-cli", label: "Kiro CLI" },
  { id: "tabnine", label: "Tabnine CLI" },
  { id: "trae", label: "Trae" },
  { id: "forge", label: "Forge" },
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
        targetPath = this.createOnboardWorktree(repoPath);
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

    const { command, args, fullCommand } = this.buildCommand(aiAgent);

    this.bridge.emit({
      type: "repo:onboard:output",
      repoPath,
      data: `$ ${fullCommand}\n`,
    });

    await this.runCommand(
      repoPath,
      targetPath,
      command,
      args,
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

    const { command, args, fullCommand } = this.buildCommand(aiAgent);

    this.bridge.emit({
      type: "repo:upgrade-specify:output",
      repoPath,
      data: `$ ${fullCommand}\n`,
    });

    await this.runCommand(
      repoPath,
      repoPath,
      command,
      args,
      "repo:upgrade-specify:output",
      "repo:upgrade-specify:complete",
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
  private buildCommand(agent: string): { command: string; args: string[]; fullCommand: string } {
    const template = this.configManager.getConfig().specifyCommand || DEFAULT_SPECIFY_COMMAND;

    const fullCommand = template
      .replace(/\{agent\}/g, agent)
      .replace(/\s+/g, " ")
      .trim();

    const parts = fullCommand.split(" ");
    const command = parts[0];
    const args = parts.slice(1);

    return { command, args, fullCommand };
  }

  /**
   * Creates a worktree for onboarding. Auto-generates a name like
   * `specify-init-<branch>-<timestamp>` under the `.worktrees/` directory.
   * Returns the absolute path of the created worktree.
   */
  private createOnboardWorktree(repoPath: string): string {
    const resolved = resolve(repoPath);

    // Get the current branch name
    let currentBranch = "main";
    try {
      currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: resolved,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch {
      // fallback to "main"
    }

    // Sanitize branch name for use in directory/branch name
    const safeBranch = sanitizeName(currentBranch);
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
      execSync(
        `git worktree add "${worktreePath}" -b "${newBranch}"`,
        { cwd: resolved, stdio: "pipe" },
      );
    } catch {
      // Branch may already exist — try without -b
      try {
        execSync(
          `git worktree add "${worktreePath}" "${newBranch}"`,
          { cwd: resolved, stdio: "pipe" },
        );
      } catch (err2) {
        // Last resort: detach from HEAD
        execSync(
          `git worktree add --detach "${worktreePath}"`,
          { cwd: resolved, stdio: "pipe" },
        );
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
  private runCommand(
    repoPath: string,
    cwd: string,
    command: string,
    args: string[],
    outputEvent: "repo:onboard:output" | "repo:upgrade-specify:output",
    completeEvent?: "repo:onboard:complete" | "repo:upgrade-specify:complete",
  ): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        shell: true,
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
          reject(new AppError("INTERNAL_ERROR", `Failed to start ${command}: ${err.message}`));
        }
      });
    });
  }
}
