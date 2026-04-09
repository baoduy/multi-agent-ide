import type { SessionState } from "@magenta/shared/models";
import type { DatabaseService } from "../db/DatabaseService";

/**
 * SessionManager handles persistence of user session state (selected repo, spec, panel widths, etc.)
 * Uses debouncing to avoid excessive database writes during rapid UI updates.
 */
export class SessionManager {
  private readonly databaseService: DatabaseService;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingState: Partial<SessionState> | null = null;
  private readonly debounceMs: number = 500;

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
  }

  /**
   * Gets the current session state from the database.
   */
  getSessionState(): SessionState {
    const row = this.databaseService
      .getSqlite()
      .prepare(
        `SELECT
          selected_repo_path as selectedRepoPath,
          selected_spec_path as selectedSpecPath,
          selected_file_path as selectedFilePath,
          sidebar_width as sidebarWidth,
          activity_panel_width as activityPanelWidth,
          activity_panel_open as activityPanelOpen,
          main_tab as mainTab,
          updated_at as updatedAt
         FROM session_state
         WHERE id = 1`
      )
      .get() as SessionState | undefined;

    // Return default state if not found
    if (!row) {
      return {
        selectedRepoPath: null,
        selectedSpecPath: null,
        selectedFilePath: null,
        sidebarWidth: null,
        activityPanelWidth: null,
        activityPanelOpen: true,
        mainTab: "plan",
        updatedAt: Date.now(),
      };
    }

    // Convert activity_panel_open from number (0/1) to boolean
    return {
      ...row,
      activityPanelOpen: Boolean(row.activityPanelOpen),
    };
  }

  /**
   * Queues a session state update with debouncing.
   * Multiple rapid updates are coalesced into a single database write.
   */
  updateSessionState(state: Partial<SessionState>): void {
    // Merge with pending state
    this.pendingState = { ...this.pendingState, ...state };

    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new debounce timer
    this.debounceTimer = setTimeout(() => {
      this.flushSessionState();
    }, this.debounceMs);
  }

  /**
   * Immediately writes pending session state to the database.
   */
  private flushSessionState(): void {
    if (!this.pendingState) {
      return;
    }

    const state = this.pendingState;
    this.pendingState = null;

    try {
      const updates: Record<string, unknown> = {
        updated_at: Date.now(),
      };

      if (state.selectedRepoPath !== undefined) {
        updates.selected_repo_path = state.selectedRepoPath;
      }

      if (state.selectedSpecPath !== undefined) {
        updates.selected_spec_path = state.selectedSpecPath;
      }

      if (state.selectedFilePath !== undefined) {
        updates.selected_file_path = state.selectedFilePath;
      }

      if (state.sidebarWidth !== undefined) {
        updates.sidebar_width = state.sidebarWidth;
      }

      if (state.activityPanelWidth !== undefined) {
        updates.activity_panel_width = state.activityPanelWidth;
      }

      if (state.activityPanelOpen !== undefined) {
        updates.activity_panel_open = state.activityPanelOpen ? 1 : 0;
      }

      if (state.mainTab !== undefined) {
        updates.main_tab = state.mainTab;
      }

      // Build UPDATE query
      const setClause = Object.keys(updates)
        .map((key) => `${key} = ?`)
        .join(", ");

      const values = Object.values(updates);

      this.databaseService.getSqlite().prepare(`UPDATE session_state SET ${setClause} WHERE id = 1`).run(...values);
    } catch (error) {
      console.error("Failed to save session state:", error);
    }
  }

  /**
   * Ensure any pending writes are flushed before shutdown.
   */
  flush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.flushSessionState();
  }
}
