import type { SqliteCompat } from "../SqliteCompat";

export function run(sqlite: SqliteCompat): void {
  sqlite.exec(`
    DROP TABLE IF EXISTS spec_cache;

    CREATE TABLE specs (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      branch TEXT NOT NULL,
      is_current_branch INTEGER NOT NULL DEFAULT 0,
      files_json TEXT NOT NULL DEFAULT '[]',
      synced_at INTEGER NOT NULL,
      UNIQUE(repo_id, branch, name)
    );

    CREATE TABLE spec_stages (
      id TEXT PRIMARY KEY,
      spec_id TEXT NOT NULL REFERENCES specs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'missing',
      file_path TEXT,
      metadata_json TEXT,
      UNIQUE(spec_id, name)
    );

    CREATE INDEX idx_specs_repo_id ON specs(repo_id);
    CREATE INDEX idx_spec_stages_spec_id ON spec_stages(spec_id);
  `);
}
