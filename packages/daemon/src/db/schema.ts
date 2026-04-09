/**
 * Database schema reference.
 *
 * This file documents the database structure. The actual tables are created
 * by the migration in migrations/0001_initial.ts using raw SQL.
 *
 * Tables:
 *
 *   repos
 *     id           TEXT PRIMARY KEY
 *     name         TEXT NOT NULL
 *     path         TEXT NOT NULL UNIQUE
 *     branch       TEXT NOT NULL
 *     has_specs    INTEGER NOT NULL DEFAULT 0  (boolean)
 *     spec_count   INTEGER NOT NULL DEFAULT 0
 *     status       TEXT NOT NULL DEFAULT 'active' ('active' | 'missing' | 'archived')
 *     scanned_at   INTEGER NOT NULL
 *     created_at   INTEGER NOT NULL
 *
 *   working_dirs
 *     id           TEXT PRIMARY KEY
 *     path         TEXT NOT NULL UNIQUE
 *
 *   session_state (single row, id = 1)
 *     id                    INTEGER PRIMARY KEY CHECK (id = 1)
 *     selected_repo_path    TEXT
 *     selected_spec_path    TEXT
 *     selected_file_path    TEXT
 *     sidebar_width         INTEGER DEFAULT 300
 *     activity_panel_width  INTEGER DEFAULT 300
 *     activity_panel_open   INTEGER DEFAULT 1  (boolean)
 *     main_tab              TEXT DEFAULT 'plan' ('plan' | 'worktrees' | 'spec')
 *     updated_at            INTEGER NOT NULL
 */
export {};
