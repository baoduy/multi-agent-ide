import { useEffect } from "react";

import { useSessionStore } from "../store/sessionStore";
import { useRepoStore } from "../store/repoStore";
import { useSpecStore } from "../store/specStore";

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
  const selectedRepoPath = useSessionStore((state) => state.selectedRepoPath);
  const selectedSpecPath = useSessionStore((state) => state.selectedSpecPath);
  const initialized = useSessionStore((state) => state.initialized);

  const repos = useRepoStore((state) => state.repos);
  const specs = useSpecStore((state) => state.specs);
  const setActiveRepoPath = useRepoStore((state) => state.setActiveRepoPath);
  const setSelectedSpecPath = useSpecStore((state) => state.setSelectedSpecPath);
  const updateSelectedRepoPath = useSessionStore((state) => state.updateSelectedRepoPath);
  const updateSelectedSpecPath = useSessionStore((state) => state.updateSelectedSpecPath);
  const fetchSpecs = useSpecStore((state) => state.fetchSpecs);

  // Load session state on mount
  useEffect(() => {
    void loadSessionState();
  }, [loadSessionState]);

  // Validate and restore repo selection
  useEffect(() => {
    if (!initialized) {
      return;
    }

    // Check if selected repo still exists
    const repoExists = repos.some((r) => r.path === selectedRepoPath);

    if (selectedRepoPath && repoExists) {
      // Restore repo selection
      setActiveRepoPath(selectedRepoPath);
      void fetchSpecs(selectedRepoPath);
    } else if (selectedRepoPath) {
      // Selected repo was deleted
      void updateSelectedRepoPath(null);
      setActiveRepoPath(null);
    }
  }, [initialized, repos, selectedRepoPath, setActiveRepoPath, updateSelectedRepoPath, fetchSpecs]);

  // Validate and restore spec selection
  useEffect(() => {
    if (!initialized || !selectedRepoPath) {
      return;
    }

    // Check if selected spec still exists
    const specExists = specs.some((s) => s.path === selectedSpecPath);

    if (selectedSpecPath && specExists) {
      // Spec is valid, set selection
      setSelectedSpecPath(selectedSpecPath);
    } else if (selectedSpecPath) {
      // Selected spec was deleted
      void updateSelectedSpecPath(null);
      setSelectedSpecPath(null);
    }
  }, [initialized, selectedRepoPath, specs, selectedSpecPath, setSelectedSpecPath, updateSelectedSpecPath]);
}
