import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export type GitCloneProgress = {
  phase: string;
  percent: number;
  data: string;
};

export type GitCloneOptions = {
  url: string;
  parentDir: string;
  folderName: string;
  depth?: number;
  onProgress?: (progress: GitCloneProgress) => void;
};

/**
 * Parses `git clone --progress` stderr lines like:
 *   "Receiving objects:  45% (1234/2700)"
 * into a structured progress object.
 */
function parseProgressLine(line: string): GitCloneProgress | null {
  const m = line.match(/^([A-Za-z][A-Za-z ]+?):\s+(\d+)%/);
  if (!m) return null;
  return {
    phase: m[1]!.trim(),
    percent: Math.min(100, Math.max(0, parseInt(m[2]!, 10) || 0)),
    data: line.trim(),
  };
}

/**
 * GitCloneGateway runs `git clone --progress` via child_process.spawn so
 * stderr can be streamed line-by-line. simple-git buffers stderr and does
 * not expose progress events cleanly, so it's not suitable here.
 *
 * The caller must pass an existing parent directory; this gateway only
 * validates folderName + checks the target child path doesn't already exist.
 */
export class GitCloneGateway {
  async clone(options: GitCloneOptions): Promise<{ repoPath: string }> {
    const { url, parentDir, folderName, depth, onProgress } = options;
    const targetPath = path.resolve(parentDir, folderName);

    if (!fs.existsSync(parentDir) || !fs.statSync(parentDir).isDirectory()) {
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
    if (fs.existsSync(targetPath)) {
      throw new Error(`Target directory already exists: ${targetPath}`);
    }

    const args: string[] = ["clone", "--progress"];
    if (depth && depth > 0) args.push("--depth", String(depth));
    args.push(url, folderName);

    const binary = process.env.MAGENTA_GIT_PATH || "git";

    return new Promise<{ repoPath: string }>((resolve, reject) => {
      const child = spawn(binary, args, {
        cwd: parentDir,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_ASKPASS: "/bin/true",
        },
      });

      let stderr = "";
      let stdoutBuf = "";
      let carry = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString("utf8");
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stderr += text;
        // git uses \r to overwrite lines during progress; split on both \r and \n
        const buffer = carry + text;
        const lines = buffer.split(/[\r\n]+/);
        carry = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const prog = parseProgressLine(line);
          if (prog && onProgress) onProgress(prog);
        }
      });

      child.on("error", (err) => {
        reject(err);
      });

      child.on("close", (code) => {
        if (carry.trim()) {
          const prog = parseProgressLine(carry);
          if (prog && onProgress) onProgress(prog);
        }
        if (code === 0) {
          resolve({ repoPath: targetPath });
        } else {
          const errMsg = (stderr || stdoutBuf).trim().split("\n").slice(-3).join(" ").trim()
            || `git clone exited with code ${code}`;
          reject(new Error(errMsg));
        }
      });
    });
  }
}
