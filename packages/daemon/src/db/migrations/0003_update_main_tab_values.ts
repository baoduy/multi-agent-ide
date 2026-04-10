import type { SqliteCompat } from "../SqliteCompat";

/**
 * Migration 3: Update mainTab values from old names to new names.
 * "plan" → "specs", "spec" → "workflow"
 * The "worktrees" tab name is unchanged.
 */
export function run(sqlite: SqliteCompat): void {
  sqlite.exec(`
    UPDATE session_state SET main_tab = 'specs' WHERE main_tab = 'plan';
  `);
  sqlite.exec(`
    UPDATE session_state SET main_tab = 'workflow' WHERE main_tab = 'spec';
  `);
}
