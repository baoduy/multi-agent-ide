import type { DatabaseService } from "../db/DatabaseService";
import type { LmdbDatabase } from "../db/LmdbStore";

/**
 * LMDB-backed repository for the user's `--plugin-dir` list. Single document
 * stored under sub-db `plugin_dirs` at key `paths`.
 */
type PluginDirsRow = {
  paths: string[];
};

const KEY = "paths";

export class PluginDirRepository {
  private readonly db: LmdbDatabase<PluginDirsRow>;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getDb<PluginDirsRow>("plugin_dirs");
  }

  get(): string[] {
    const row = this.db.get(KEY);
    return row?.paths ?? [];
  }

  set(paths: string[]): void {
    this.databaseService.transactionSync(() => {
      this.db.putSync(KEY, { paths: [...paths] });
    });
  }
}
