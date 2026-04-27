import { AppError } from "../../../core/errors/AppError";

interface PluginDirRepoLike {
  get(): string[];
  set(paths: string[]): void;
}

/**
 * Phase 6 — CRUD over the user's `--plugin-dir` list. Lives in LMDB so it
 * persists across daemon restarts; the renderer surfaces it via Settings.
 */
export class PluginDirService {
  constructor(private readonly repo: PluginDirRepoLike) {}

  list(): string[] {
    return this.repo.get();
  }

  add(path: string): string[] {
    const trimmed = path.trim();
    if (!trimmed) {
      throw new AppError("PLUGIN_DIR_INVALID", "plugin dir path cannot be empty");
    }
    const cur = this.repo.get();
    if (cur.includes(trimmed)) return cur;
    const next = [...cur, trimmed];
    this.repo.set(next);
    return next;
  }

  remove(path: string): string[] {
    const cur = this.repo.get();
    const next = cur.filter((p) => p !== path);
    if (next.length !== cur.length) this.repo.set(next);
    return next;
  }
}
