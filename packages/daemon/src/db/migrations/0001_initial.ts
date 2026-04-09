import type { SqliteCompat } from "../SqliteCompat";

export const initialMigrationStatements = [
  `CREATE TABLE IF NOT EXISTS repos (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    branch TEXT NOT NULL,
    has_specs INTEGER NOT NULL DEFAULT 0,
    spec_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    scanned_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS working_dirs (
    id TEXT PRIMARY KEY NOT NULL,
    path TEXT NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS session_state (
    id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
    selected_repo_path TEXT,
    selected_spec_path TEXT,
    selected_file_path TEXT,
    sidebar_width INTEGER DEFAULT 300,
    activity_panel_width INTEGER DEFAULT 300,
    activity_panel_open INTEGER DEFAULT 1,
    main_tab TEXT DEFAULT 'plan',
    updated_at INTEGER NOT NULL
  )`,
  `INSERT OR IGNORE INTO session_state (
    id,
    selected_repo_path,
    selected_spec_path,
    selected_file_path,
    sidebar_width,
    activity_panel_width,
    activity_panel_open,
    main_tab,
    updated_at
  ) VALUES (1, NULL, NULL, NULL, 300, 300, 1, 'plan', strftime('%s', 'now'))`,
];

export function runInitialMigration(sqlite: SqliteCompat): void {
  for (const statement of initialMigrationStatements) {
    sqlite.exec(statement);
  }
}
