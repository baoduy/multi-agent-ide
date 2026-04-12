import type { SqliteCompat } from "../SqliteCompat";

/**
 * Migration 10: Add `title` column to ai_sessions.
 *
 * Stores a human-readable title derived from the user's first input
 * so sessions are easy to identify in the session list.
 */
export function run(sqlite: SqliteCompat): void {
  sqlite.exec(`ALTER TABLE ai_sessions ADD COLUMN title TEXT`);
}
