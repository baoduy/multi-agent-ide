import type { SqliteCompat } from "../SqliteCompat";

/**
 * Migration 11: Add `permission_mode` column to ai_sessions.
 *
 * Stores the permission mode (default, acceptEdits, plan, auto, dontAsk,
 * bypassPermissions) selected when the session was created. Defaults to
 * 'auto' for new sessions.
 */
export function run(sqlite: SqliteCompat): void {
  sqlite.exec(`ALTER TABLE ai_sessions ADD COLUMN permission_mode TEXT NOT NULL DEFAULT 'auto'`);
}
