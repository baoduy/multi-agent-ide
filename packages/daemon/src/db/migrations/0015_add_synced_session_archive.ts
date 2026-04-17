import type { SqliteCompat } from "../SqliteCompat";

/**
 * Migration 15: Add `is_archived` flag to `synced_sessions`.
 *
 * User-initiated archive action. Archived rows are filtered out of every
 * read path (`list` / `listByProvider`), so they are invisible to the renderer.
 * There is no restore UI — the flag is write-once from the user's perspective.
 *
 * NOTE: SQLite stores booleans as INTEGER (0 / 1). The mapper in
 * `infrastructure/mappers/syncedSessionMapper.ts` is the ONLY place the
 * 0/1 ↔ boolean conversion happens.
 */
export function run(sqlite: SqliteCompat): void {
  sqlite.exec(`
    ALTER TABLE synced_sessions ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
  `);
}
