import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { AIProvider, AISessionRecord, AISessionConfig, AIPermissionMode, ProviderMeta } from "@magenta/shared/aiTerminal";
import type { IPCBridge } from "../ipc/IPCBridge";
import type { AISessionRepository } from "../services/AISessionRepository";
import { resolveSessionCwd } from "../domain/sessionCwdResolver";
import { getAllProviderMeta, getProviderMeta, getPermissionModeArgs } from "../domain/providerRegistry";
import { getSessionFactory } from "../infrastructure/sessions";
import type { BaseAISession } from "../infrastructure/sessions";
import { AppError } from "../errors/AppError";

export class AISessionApplicationService {
  private readonly liveSessions = new Map<string, BaseAISession>();

  constructor(
    private readonly bridge: IPCBridge,
    private readonly sessionRepo: AISessionRepository,
  ) {}

  async createSession(
    config: AISessionConfig,
    cols: number,
    rows: number,
  ): Promise<AISessionRecord> {
    const id = randomUUID();
    const provider = config.provider;
    const providerMeta = getProviderMeta(provider);
    const permissionMode: AIPermissionMode = config.permissionMode ?? "auto";

    // Resolve working directory
    const cwd = resolveSessionCwd({
      repoPath: config.repoPath,
      worktreePath: config.worktreePath,
    });

    // Ensure directory exists
    await fs.mkdir(cwd, { recursive: true });

    // Derive repo name from path
    const repoName = config.repoPath ? path.basename(config.repoPath) : null;

    // Derive worktree name from path
    const worktreeName = config.worktreePath ? path.basename(config.worktreePath) : null;

    // Create DB record (status is NOT persisted)
    const now = Date.now();
    const record: AISessionRecord = {
      id,
      provider,
      repoPath: config.repoPath ?? null,
      repoName,
      branch: config.branch ?? null,
      worktreePath: config.worktreePath ?? null,
      worktreeName,
      cwd,
      providerSessionId: null,
      status: "active", // Runtime status — not persisted
      permissionMode,
      title: null,
      createdAt: now,
      lastActiveAt: now,
    };
    this.sessionRepo.create(record);

    // Build CLI args — permission mode flags first, then provider defaults, then overrides
    const permissionArgs = getPermissionModeArgs(provider, permissionMode);
    const args = [...permissionArgs, ...providerMeta.defaultArgs, ...(config.args ?? [])];

    // Spawn PTY session via factory
    const factory = getSessionFactory(provider);
    const session = factory.create(id);

    // Wire events → bridge push events
    this.wireSessionEvents(id, session);

    session.start(cwd, args, cols, rows);
    this.liveSessions.set(id, session);

    return record;
  }

  async resumeSession(
    sessionId: string,
    cols: number,
    rows: number,
  ): Promise<AISessionRecord> {
    const record = this.sessionRepo.getById(sessionId);
    if (!record) {
      throw new AppError("NOT_FOUND", `AI session not found: ${sessionId}`);
    }

    // If already live, just return with current status
    const existingSession = this.liveSessions.get(sessionId);
    if (existingSession) {
      return { ...record, status: existingSession.getStatus() };
    }

    // Ensure directory still exists
    await fs.mkdir(record.cwd, { recursive: true });

    const providerMeta = getProviderMeta(record.provider);

    // Build args for resume — use provider's --resume or --continue flag
    const args = [...providerMeta.defaultArgs];
    if (record.providerSessionId) {
      args.push("--resume", record.providerSessionId);
    } else {
      args.push("--continue");
    }

    // Spawn PTY
    const factory = getSessionFactory(record.provider);
    const session = factory.create(sessionId);

    this.wireSessionEvents(sessionId, session);

    session.start(record.cwd, args, cols, rows);
    this.liveSessions.set(sessionId, session);

    // Update lastActiveAt
    const now = Date.now();
    this.sessionRepo.update(sessionId, { lastActiveAt: now });

    return { ...record, permissionMode: record.permissionMode ?? "default", status: "active", lastActiveAt: now };
  }

  /**
   * List all sessions, enriching each with real-time status from the
   * live PTY process map. Sessions without a live process get "idle".
   */
  listSessions(): AISessionRecord[] {
    const records = this.sessionRepo.list();
    return records.map((record) => {
      const liveSession = this.liveSessions.get(record.id);
      return {
        ...record,
        status: liveSession ? liveSession.getStatus() : "idle",
      };
    });
  }

  deleteSession(sessionId: string): void {
    // Kill live session if active
    this.stop(sessionId);
    this.sessionRepo.delete(sessionId);
  }

  sendInput(sessionId: string, data: string): void {
    const session = this.liveSessions.get(sessionId);
    if (!session) return;
    session.sendInput(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.liveSessions.get(sessionId);
    if (!session) return;
    session.resize(cols, rows);
  }

  stop(sessionId: string): void {
    const session = this.liveSessions.get(sessionId);
    if (!session) return;
    session.stop();
    session.dispose();
    this.liveSessions.delete(sessionId);
  }

  /**
   * Change the permission mode for a live session by sending Shift+Tab
   * key sequences to cycle through available modes until the target
   * mode is reached. Updates the persisted record and emits a push event.
   *
   * Note: Both Claude Code and Copilot CLI support Shift+Tab cycling.
   * The escape sequence for Shift+Tab is \x1b[Z.
   */
  setPermissionMode(sessionId: string, mode: AIPermissionMode): void {
    const record = this.sessionRepo.getById(sessionId);
    if (!record) {
      throw new AppError("NOT_FOUND", `AI session not found: ${sessionId}`);
    }

    const session = this.liveSessions.get(sessionId);
    if (!session) {
      throw new AppError("NOT_FOUND", `AI session is not live: ${sessionId}`);
    }

    // Update persisted record
    this.sessionRepo.update(sessionId, { permissionMode: mode });

    // Emit push event so the UI updates
    this.bridge.emit({
      type: "ai-session:permission-mode-changed",
      sessionId,
      permissionMode: mode,
    });
  }

  /** Returns the number of sessions with a live PTY process. */
  getRunningCount(): number {
    return this.liveSessions.size;
  }

  getProviders(): Record<AIProvider, ProviderMeta> {
    return getAllProviderMeta();
  }

  destroyAll(): void {
    for (const [id, session] of this.liveSessions) {
      try {
        session.stop();
        session.dispose();
      } catch {
        // Best effort
      }
      this.liveSessions.delete(id);
    }
  }

  /**
   * Wire PTY session events to IPC bridge push events.
   * Status changes and exit events are broadcast to the UI in real time.
   * Only lastActiveAt is persisted to DB — status is NOT persisted.
   */
  private wireSessionEvents(sessionId: string, session: BaseAISession): void {
    session.on("data", (payload: { data: string; seq: number }) => {
      this.bridge.emit({ type: "ai-session:data", sessionId, data: payload.data, seq: payload.seq });
    });
    session.on("status", (status: string) => {
      this.bridge.emit({
        type: "ai-session:status",
        sessionId,
        status: status as AISessionRecord["status"],
      });
      // Only update lastActiveAt — status is runtime-only
      this.sessionRepo.update(sessionId, { lastActiveAt: Date.now() });
    });
    session.on("exit", (exitCode: number) => {
      this.liveSessions.delete(sessionId);
      this.bridge.emit({ type: "ai-session:exited", sessionId, exitCode });
      this.sessionRepo.update(sessionId, { lastActiveAt: Date.now() });
    });
    session.on("heartbeat", (payload: { headSeq: number; alive: boolean }) => {
      this.bridge.emit({
        type: "ai-session:heartbeat",
        sessionId,
        headSeq: payload.headSeq,
        alive: payload.alive,
      });
    });
  }

  /**
   * Return chunks newer than fromSeq for the given session, plus a snapshot
   * marker. If the session is not live but record exists, returns null —
   * the UI should call resumeSession to bring it back up.
   */
  attach(sessionId: string, fromSeq?: number) {
    const session = this.liveSessions.get(sessionId);
    if (!session) return null;
    return session.attach(fromSeq ?? 0);
  }

  /** Acknowledge received seq (currently a liveness signal; reserved for windowed flow control). */
  ack(_sessionId: string, _seq: number): void {
    // Intentionally no-op today — present so the IPC contract exists and
    // the UI can start sending acks. A future sliding-window flow
    // controller will read these.
  }
}
