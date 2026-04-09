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
 *     sidebar_collapsed     INTEGER NOT NULL DEFAULT 0  (boolean)
 *     activity_collapsed    INTEGER NOT NULL DEFAULT 0  (boolean)
 *     spec_panel_height     INTEGER DEFAULT NULL
 *     main_tab              TEXT DEFAULT 'plan' ('plan' | 'worktrees' | 'spec')
 *     updated_at            INTEGER NOT NULL
 *
 *   specs
 *     id                   TEXT PRIMARY KEY
 *     repo_id              TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE
 *     name                 TEXT NOT NULL
 *     path                 TEXT NOT NULL
 *     branch               TEXT NOT NULL
 *     is_current_branch    INTEGER NOT NULL DEFAULT 0  (boolean)
 *     files_json           TEXT NOT NULL DEFAULT '[]'  (JSON-serialized file paths)
 *     synced_at            INTEGER NOT NULL            (epoch ms when spec was last synced)
 *     UNIQUE(repo_id, branch, name)
 *
 *   spec_stages
 *     id                   TEXT PRIMARY KEY
 *     spec_id              TEXT NOT NULL REFERENCES specs(id) ON DELETE CASCADE
 *     name                 TEXT NOT NULL               (pipeline stage: constitution, spec, plan, tasks, implementation)
 *     status               TEXT NOT NULL DEFAULT 'missing'  (missing | completed | failed | pending)
 *     file_path            TEXT                        (path to stage output file)
 *     metadata_json        TEXT                        (JSON-serialized stage metadata)
 *     UNIQUE(spec_id, name)
 *
 * DROPPED TABLES:
 *   spec_cache (migration 0006) - replaced by specs and spec_stages tables
 */
export {};
