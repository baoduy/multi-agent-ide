import { useSessionStore } from "../store/sessionStore";
import { useRepoStore } from "../store/repoStore";
import { useSpecStore } from "../store/specStore";

/**
 * SessionCoordinator handles cross-store coordination.
 * This replaces:
 * - Dynamic imports in repoStore.setActiveRepoPath()
 * - Dynamic imports in specStore.setSelectedSpecPath()
 * - Multi-store orchestration in useSessionRestoration hook
 */
export const SessionCoordinator = {
  /**
   * Select a repo — updates repoStore and persists to session.
   */
  selectRepo(path: string | null): void {
    useRepoStore.getState().setActiveRepoPath(path);
    void useSessionStore.getState().patchSession({ selectedRepoPath: path });
  },

  /**
   * Select a spec — updates specStore and persists to session.
   */
  selectSpec(path: string | null): void {
    useSpecStore.getState().setSelectedSpecPath(path);
    void useSessionStore.getState().patchSession({ selectedSpecPath: path });
  },

  /**
   * Restore session state on app boot.
   * Called after repos and session state have been loaded.
   */
  async restoreSession(): Promise<void> {
    const session = useSessionStore.getState();
    const repos = useRepoStore.getState().repos;

    if (!session.initialized) return;

    // Validate repo selection
    if (session.selectedRepoPath) {
      const repoExists = repos.some((r) => r.path === session.selectedRepoPath);
      if (repoExists) {
        useRepoStore.getState().setActiveRepoPath(session.selectedRepoPath);
        await useSpecStore.getState().fetchSpecs(session.selectedRepoPath);
      } else {
        // Repo no longer exists — clear selection
        useRepoStore.getState().setActiveRepoPath(null);
        void useSessionStore.getState().patchSession({ selectedRepoPath: null });
      }
    }
  },

  /**
   * Validate spec selection after specs have been loaded.
   * Called from useSessionRestoration after restoreSession.
   */
  validateSpecSelection(): void {
    const session = useSessionStore.getState();
    const specs = useSpecStore.getState().specs;

    if (!session.selectedRepoPath || !session.selectedSpecPath) return;

    const specExists = specs.some((s) => s.path === session.selectedSpecPath);
    if (specExists) {
      useSpecStore.getState().setSelectedSpecPath(session.selectedSpecPath);
    } else {
      useSpecStore.getState().setSelectedSpecPath(null);
      void useSessionStore.getState().patchSession({ selectedSpecPath: null });
    }
  },
};
