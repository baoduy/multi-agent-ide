import type { SqliteCompat } from "../SqliteCompat";

export function run(sqlite: SqliteCompat): void {
  sqlite.exec(`ALTER TABLE session_state ADD COLUMN sidebar_collapsed INTEGER NOT NULL DEFAULT 0`);
  sqlite.exec(`ALTER TABLE session_state ADD COLUMN activity_collapsed INTEGER NOT NULL DEFAULT 0`);
}
