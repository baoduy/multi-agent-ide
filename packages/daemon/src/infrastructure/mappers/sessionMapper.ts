import type { SessionState } from "@magenta/shared/models";

/**
 * Maps a raw SQLite row to SessionState.
 * Handles boolean conversion (SQLite stores 0/1 for booleans).
 */
export function mapSessionRow(row: Record<string, unknown>): SessionState {
  return {
    ...(row as unknown as SessionState),
    activityPanelOpen: Boolean(row.activityPanelOpen ?? (row as any).activityPanelOpen),
    sidebarCollapsed: Boolean(row.sidebarCollapsed ?? (row as any).sidebarCollapsed),
    activityCollapsed: Boolean(row.activityCollapsed ?? (row as any).activityCollapsed),
  };
}

/**
 * Maps a partial SessionState to SQLite column names and values.
 * Converts camelCase to snake_case and booleans to 0/1.
 */
export function toSessionColumns(state: Partial<SessionState>): Record<string, unknown> {
  const columns: Record<string, unknown> = {
    updated_at: Date.now(),
  };

  if (state.selectedRepoPath !== undefined) columns.selected_repo_path = state.selectedRepoPath;
  if (state.selectedSpecPath !== undefined) columns.selected_spec_path = state.selectedSpecPath;
  if (state.selectedFilePath !== undefined) columns.selected_file_path = state.selectedFilePath;
  if (state.sidebarWidth !== undefined) columns.sidebar_width = state.sidebarWidth;
  if (state.activityPanelWidth !== undefined) columns.activity_panel_width = state.activityPanelWidth;
  if (state.activityPanelOpen !== undefined) columns.activity_panel_open = state.activityPanelOpen ? 1 : 0;
  if (state.sidebarCollapsed !== undefined) columns.sidebar_collapsed = state.sidebarCollapsed ? 1 : 0;
  if (state.activityCollapsed !== undefined) columns.activity_collapsed = state.activityCollapsed ? 1 : 0;
  if (state.specPanelHeight !== undefined) columns.spec_panel_height = state.specPanelHeight;
  if (state.mainTab !== undefined) columns.main_tab = state.mainTab;

  return columns;
}
