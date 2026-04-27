import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AppError } from "../../../core/errors/AppError";

/**
 * Per-run scratch space for files the daemon needs to materialize before
 * spawning a CLI (inline MCP config, per-task instruction files merged into
 * one). One gateway instance per `runOnce` invocation; `dispose()` is
 * idempotent and called from a `finally` block so a thrown error during
 * spawn cannot leak a temp directory.
 *
 * Why not pass JSON on the command line? Spec NFR-7: secrets MUST NOT appear
 * on argv. MCP configs frequently embed API tokens for downstream services,
 * so they always go via file paths.
 */
export class TempFileGateway {
  readonly dir: string;
  private readonly tracked = new Set<string>();
  private disposed = false;

  constructor(prefix: string = "magenta-aibare") {
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  }

  /**
   * Writes `contents` to a file named `name` inside the gateway's directory.
   * `name` MUST be a simple filename — no slashes, no `..`, no absolute path.
   * Returns the absolute path of the created file.
   */
  writeFile(name: string, contents: string): string {
    if (this.disposed) {
      throw new AppError(
        "INTERNAL_ERROR",
        "TempFileGateway.writeFile after dispose",
      );
    }
    if (
      name.length === 0 ||
      name.includes("/") ||
      name.includes("\\") ||
      name.includes("\0") ||
      name === ".." ||
      name === "." ||
      path.basename(name) !== name
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        `TempFileGateway: name must be a simple filename, got: ${name}`,
      );
    }
    const p = path.join(this.dir, name);
    fs.writeFileSync(p, contents, { encoding: "utf8", mode: 0o600 });
    this.tracked.add(p);
    return p;
  }

  /**
   * Remove tracked files and the gateway directory. Idempotent — calling it
   * twice is safe so a `finally` block can always invoke it.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const p of this.tracked) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* file may already be gone */
      }
    }
    try {
      fs.rmSync(this.dir, { recursive: true, force: true });
    } catch {
      /* ignore — caller is in cleanup, best-effort */
    }
    this.tracked.clear();
  }
}
