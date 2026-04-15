import type { SqliteCompat } from "../SqliteCompat";

/**
 * Migration 14: Add `activity` column to `synced_sessions`.
 *
 * Refines the existing `status` (active|completed) with three live-activity states:
 *   - `processing` — the agent is currently producing output
 *   - `idle`       — alive but waiting for the next user input
 *   - `completed`  — the session has been shut down
 *
 * Defaults existing rows to `idle` (they get overwritten on the next sync anyway).
 *
 * NOTE: SQLite does not enforce CHECK constraints added via ALTER TABLE on
 * existing tables, so the column is plain TEXT NOT NULL with a DEFAULT — the
 * application layer (Zod schema in shared/syncedSession.ts) is the source of truth.
 */
export function run(sqlite: SqliteCompat): void {
  sqlite.exec(`
    ALTER TABLE synced_sessions ADD COLUMN activity TEXT NOT NULL DEFAULT 'idle';
  `);
}
