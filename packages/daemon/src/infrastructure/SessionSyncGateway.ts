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
   * Reads a JSONL file and returns all lines as an array of strings.
   * Uses streaming to handle large files efficiently.
   */
  async readJsonlLines(filePath: string): Promise<string[]> {
    if (!fs.existsSync(filePath)) {
      throw new AppError("FILE_NOT_FOUND", `JSONL file not found: ${filePath}`);
    }

    const lines: string[] = [];
    const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (line.trim()) {
        lines.push(line);
      }
    }

    return lines;
  }
}
