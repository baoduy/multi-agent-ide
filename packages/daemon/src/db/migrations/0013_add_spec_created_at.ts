import type { SqliteCompat } from "../SqliteCompat";

/**
 * Adds a `created_at` column to the `specs` table.
 * This stores the spec.md file's creation timestamp (birthtime/mtime)
 * so the UI can sort specs by when they were actually created,
 * rather than when they were last synced.
 *
 * Defaults to the existing `synced_at` value for pre-existing rows.
 */
export function run(sqlite: SqliteCompat): void {
  sqlite.exec(`
    ALTER TABLE specs ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
    UPDATE specs SET created_at = synced_at WHERE created_at = 0;
  `);
}
