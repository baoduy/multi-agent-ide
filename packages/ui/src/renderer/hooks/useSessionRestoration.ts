import { useEffect } from "react";

import { useSessionStore } from "../store/sessionStore";
import { useRepoStore } from "../store/repoStore";
import { useSpecStore } from "../store/specStore";
import { SessionCoordinator } from "../services/SessionCoordinator";

/**
 * Hook that restores session state on app initialization.
 * This should be called from the root component (MainPage) once on mount.
 *
 * Recovery strategy:
 * - Load session state from daemon (persisted in SQLite)
 * - If selectedRepoPath exists in the repos list, keep it
 * - Otherwise, clear selectedRepoPath
 * - If selectedSpecPath exists in the specs list for selectedRepoPath, keep it
 * - Otherwise, clear selectedSpecPath
 */
export function useSessionRestoration(): void {
  const loadSessionState = useSessionStore((state) => state.loadSessionState);
  const initialized = useSessionStore((state) => state.initialized);
  const repos = useRepoStore((state) => state.repos);
  const specs = useSpecStore((state) => state.specs);
  const selectedRepoPath = useSessionStore((state) => state.selectedRepoPath);

  // Load session state on mount
  useEffect(() => {
    void loadSessionState();
  }, [loadSessionState]);

  // Validate and restore repo selection
  useEffect(() => {
    if (!initialized) {
      return;
    }
    void SessionCoordinator.restoreSession();
  }, [initialized, repos]);

  // Validate and restore spec selection
  useEffect(() => {
    if (!initialized || !selectedRepoPath) {
      return;
    }
    SessionCoordinator.validateSpecSelection();
  }, [initialized, selectedRepoPath, specs]);
}
