import type { SqliteCompat } from "../SqliteCompat";

export function run(sqlite: SqliteCompat): void {
  sqlite.exec(`ALTER TABLE session_state ADD COLUMN spec_panel_height INTEGER DEFAULT NULL`);
}
