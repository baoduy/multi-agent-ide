import type { SqliteCompat } from "../SqliteCompat";

export function run(sqlite: SqliteCompat): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS spec_cache (
      repo_path   TEXT NOT NULL,
      specs_json  TEXT NOT NULL,
      cached_at   INTEGER NOT NULL,
      PRIMARY KEY (repo_path)
    )
  `);
}
