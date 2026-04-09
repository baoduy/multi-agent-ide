import type { SessionManager } from "../services/SessionManager";

/**
 * SessionApplicationService orchestrates session operations.
 */
export class SessionApplicationService {
  constructor(private sessionManager: SessionManager) {}

  getSessionState() {
    return this.sessionManager.getSessionState();
  }

  updateSessionState(state: Record<string, unknown>): void {
    this.sessionManager.updateSessionState(state as never);
  }
}
