import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Agent } from "@magenta/shared/ipc";
import { AppError } from "../errors/AppError";

type ExecFn = (
  cmd: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>;

const defaultExec: ExecFn = (cmd, args) =>
  promisify(execFile)(cmd, args, { encoding: "utf8", maxBuffer: 1024 * 1024 });

const KNOWN_SOURCES = new Set(["builtin", "user", "project", "system"]);

/**
 * Thin gateway over `claude agents`. The CLI prints a whitespace-aligned
 * table with columns NAME / SOURCE / DESCRIPTION; we split on the first two
 * whitespace runs and treat the rest as the description so descriptions can
 * contain spaces.
 */
export class ClaudeAgentsGateway {
  constructor(private readonly exec: ExecFn = defaultExec) {}

  async list(): Promise<Agent[]> {
    let stdout: string;
    try {
      ({ stdout } = await this.exec("claude", ["agents"]));
    } catch (err) {
      throw new AppError(
        "CLAUDE_AGENTS_ERROR",
        `Failed to invoke 'claude agents': ${(err as Error).message}`,
      );
    }
    const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    const [, ...rows] = lines; // drop header row
    const out: Agent[] = [];
    for (const row of rows) {
      const m = row.match(/^(\S+)\s+(\S+)\s+(.*)$/);
      if (!m) {
        out.push({ name: row, source: "system", description: "" });
        continue;
      }
      const [, name, rawSource, description] = m;
      const source = KNOWN_SOURCES.has(rawSource)
        ? (rawSource as Agent["source"])
        : "system";
      out.push({ name, source, description });
    }
    return out;
  }
}
