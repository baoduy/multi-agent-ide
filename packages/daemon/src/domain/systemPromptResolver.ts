import path from "node:path";
import type { AIProvider } from "@magenta/shared/aiTerminal";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import type { WorkingDirEntry } from "@magenta/shared/workingDir";

export interface ResolvedSystemPrompts {
  /** Absolute path for `--system-prompt-file`, or undefined to skip the flag. */
  systemPromptFile: string | undefined;
  /** Absolute path for `--append-system-prompt-file`, or undefined to skip. */
  appendSystemPromptFile: string | undefined;
}

const PER_TASK_FILENAME: Record<AIProvider, string> = {
  claude: "claude-instructions.md",
  copilot: "copilot-instructions.md",
};

const PER_WORKING_DIR_FILENAME: Record<AIProvider, string> = {
  claude: "claude.md",
  copilot: "copilot.md",
};

/**
 * Pure precedence rule for system-prompt files (FR-9.3, FR-9.4). Existence
 * checks are NOT performed here — the caller (AiBareRunApplicationService) is
 * responsible for fail-fast `fs.existsSync` verification of any path it
 * actually plans to pass to the CLI, and for raising
 * `AppError("SYSTEM_PROMPT_FILE_MISSING", …)` when missing.
 *
 * Precedence per provider:
 *
 *   1. `spawn.systemPromptFile`           → absolute, wins for `--system-prompt-file`.
 *   2. `spawn.appendSystemPromptFile`     → absolute, wins for `--append-system-prompt-file`.
 *   3. `<taskDir>/<provider>-instructions.md`  → falls into the append slot.
 *   4. `<workingDir.promptTemplatesPath>/<provider>.md`  → falls into the append slot.
 */
export function resolveSystemPrompts(
  provider: AIProvider,
  spawn: Pick<AISpawnOptions, "systemPromptFile" | "appendSystemPromptFile">,
  workingDir: WorkingDirEntry,
  taskDir: string | undefined,
): ResolvedSystemPrompts {
  const systemPromptFile = spawn.systemPromptFile;

  let appendSystemPromptFile = spawn.appendSystemPromptFile;
  if (appendSystemPromptFile === undefined) {
    if (taskDir) {
      appendSystemPromptFile = path.join(taskDir, PER_TASK_FILENAME[provider]);
    } else if (workingDir.promptTemplatesPath) {
      appendSystemPromptFile = path.join(
        workingDir.promptTemplatesPath,
        PER_WORKING_DIR_FILENAME[provider],
      );
    }
  }

  return { systemPromptFile, appendSystemPromptFile };
}
