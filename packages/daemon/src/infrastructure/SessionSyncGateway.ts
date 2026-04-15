import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { AppError } from "../errors/AppError";

const TAG = "[SessionSyncGateway]";

export interface FileInfo {
  path: string;
  mtime: number;
  size: number;
}

export interface SessionFileEntry {
  /** Full path to the JSONL file */
  filePath: string;
  /** Session UUID extracted from filename */
  sessionId: string;
  /** Parent project directory name (Claude Code) or null (Copilot) */
  projectDir: string | null;
  /** File modification time (ms) */
  mtime: number;
  /** File size (bytes) */
  size: number;
  /** Number of subagent JSONL files (Claude Code only) */
  subagentCount: number;
}

/**
 * A Copilot CLI session on disk. Only sessions that have BOTH a `workspace.yaml`
 * (binding the session to a repo) AND an `events.jsonl` (event stream) are returned.
 */
export interface CopilotSessionFileEntry {
  /** Session UUID — matches the directory name */
  sessionId: string;
  /** Absolute path to the session directory (~/.copilot/session-state/{sessionId}) */
  sessionDir: string;
  /** Absolute path to the workspace.yaml file */
  workspaceYamlPath: string;
  /** Absolute path to events.jsonl */
  eventsJsonlPath: string;
  /** events.jsonl mtime (ms) — drives change detection */
  mtime: number;
  /** events.jsonl size (bytes) — drives change detection */
  size: number;
}

/**
 * Infrastructure gateway that wraps all filesystem I/O
 * for scanning Claude Code and Copilot session directories.
 */
export class SessionSyncGateway {
  /**
   * Returns the default Claude Code projects directory.
   */
  getClaudeProjectsDir(): string {
    return path.join(os.homedir(), ".claude", "projects");
  }

  /**
   * Scans the Claude Code projects directory and returns all main session files.
   * Main sessions are JSONL files directly inside each project directory
   * (not inside subagents/ subdirectories).
   */
  listClaudeSessionFiles(projectsDir: string): SessionFileEntry[] {
    if (!fs.existsSync(projectsDir)) {
      console.log(`${TAG} Claude projects dir not found: ${projectsDir}`);
      return [];
    }

    const entries: SessionFileEntry[] = [];

    try {
      const projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory());

      for (const projDir of projectDirs) {
        const projPath = path.join(projectsDir, projDir.name);

        try {
          const files = fs.readdirSync(projPath, { withFileTypes: true });

          for (const file of files) {
            if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;

            const filePath = path.join(projPath, file.name);
            const sessionId = file.name.replace(".jsonl", "");

            try {
              const stat = fs.statSync(filePath);

              // Count subagents
              const subagentDir = path.join(projPath, sessionId, "subagents");
              let subagentCount = 0;
              if (fs.existsSync(subagentDir)) {
                subagentCount = fs.readdirSync(subagentDir)
                  .filter((f) => f.endsWith(".jsonl")).length;
              }

              entries.push({
                filePath,
                sessionId,
                projectDir: projDir.name,
                mtime: stat.mtimeMs,
                size: stat.size,
                subagentCount,
              });
            } catch {
              // Skip files we can't stat
            }
          }
        } catch {
          // Skip project dirs we can't read
        }
      }
    } catch (err) {
      throw new AppError("SESSION_SYNC_ERROR", `Failed to scan Claude projects: ${String(err)}`);
    }

    return entries;
  }

  /**
   * Returns the default GitHub Copilot CLI session-state directory.
   */
  getCopilotSessionStateDir(): string {
    return path.join(os.homedir(), ".copilot", "session-state");
  }

  /**
   * Scans the Copilot CLI session-state directory and returns every session
   * that has BOTH a `workspace.yaml` and an `events.jsonl`.
   *
   * Skips:
   *   - flat `{sessionId}.jsonl` files (legacy / VSCode extension exports)
   *   - directories that only contain `vscode.metadata.json` (VSCode-only stubs)
   */
  listCopilotSessionFiles(stateDir: string): CopilotSessionFileEntry[] {
    if (!fs.existsSync(stateDir)) {
      console.log(`${TAG} Copilot session-state dir not found: ${stateDir}`);
      return [];
    }

    const entries: CopilotSessionFileEntry[] = [];

    try {
      const dirEntries = fs.readdirSync(stateDir, { withFileTypes: true })
        .filter((d) => d.isDirectory());

      for (const dir of dirEntries) {
        const sessionDir = path.join(stateDir, dir.name);
        const workspaceYamlPath = path.join(sessionDir, "workspace.yaml");
        const eventsJsonlPath = path.join(sessionDir, "events.jsonl");

        if (!fs.existsSync(workspaceYamlPath)) continue;
        if (!fs.existsSync(eventsJsonlPath)) continue;

        try {
          const stat = fs.statSync(eventsJsonlPath);
          entries.push({
            sessionId: dir.name,
            sessionDir,
            workspaceYamlPath,
            eventsJsonlPath,
            mtime: stat.mtimeMs,
            size: stat.size,
          });
        } catch {
          // Skip sessions we can't stat
        }
      }
    } catch (err) {
      throw new AppError("SESSION_SYNC_ERROR", `Failed to scan Copilot session-state: ${String(err)}`);
    }

    return entries;
  }

  /**
   * Reads workspace.yaml content as a UTF-8 string.
   */
  readCopilotWorkspaceYaml(workspaceYamlPath: string): string {
    if (!fs.existsSync(workspaceYamlPath)) {
      throw new AppError("FILE_NOT_FOUND", `workspace.yaml not found: ${workspaceYamlPath}`);
    }
    return fs.readFileSync(workspaceYamlPath, "utf-8");
  }

  /**
   * Hard caps on JSONL read size to prevent a single pathological Claude
   * session file from blowing up the daemon's memory. A typical Claude
   * session is well under 1 MB; multi-MB sessions occur but still fit
   * comfortably. Beyond these caps we silently skip the file rather than
   * OOM the process — a missing session is preferable to a crash.
   */
  private static readonly MAX_SESSION_FILE_BYTES = 64 * 1024 * 1024; // 64 MB
  private static readonly MAX_SESSION_LINES = 200_000;

  /**
   * Reads a JSONL file and returns all lines as an array of strings.
   * Uses streaming to handle large files efficiently.
   *
   * Enforces a size cap (see {@link MAX_SESSION_FILE_BYTES}) before reading
   * and a line cap during iteration. If either is exceeded the file is
   * treated as empty — the caller will see zero rows rather than trigger a
   * runaway allocation.
   */
  async readJsonlLines(filePath: string): Promise<string[]> {
    if (!fs.existsSync(filePath)) {
      throw new AppError("FILE_NOT_FOUND", `JSONL file not found: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    if (stat.size > SessionSyncGateway.MAX_SESSION_FILE_BYTES) {
      console.warn(
        `[SessionSyncGateway] Skipping oversize JSONL (${(stat.size / 1024 / 1024).toFixed(1)} MB): ${filePath}`,
      );
      return [];
    }

    const lines: string[] = [];
    const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (line.trim()) {
        lines.push(line);
        if (lines.length >= SessionSyncGateway.MAX_SESSION_LINES) {
          rl.close();
          stream.destroy();
          console.warn(
            `[SessionSyncGateway] JSONL truncated at ${SessionSyncGateway.MAX_SESSION_LINES} lines: ${filePath}`,
          );
          break;
        }
      }
    }

    return lines;
  }
}
