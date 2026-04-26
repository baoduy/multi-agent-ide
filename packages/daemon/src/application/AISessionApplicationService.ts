import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { AIProvider, AISessionRecord, AISessionListEntry, AISessionConfig, AIPermissionMode, ProviderMeta } from "@magenta/shared/aiTerminal";
import { parseWorkspaceYaml } from "../domain/copilotSessionParser";
import { extractTitleFromContent } from "../domain/claudeSessionParser";
import type { IPCBridge } from "../ipc/IPCBridge";
import { buildAllowlist, resolveAndAssert, type PathAllowlistProvider } from "../domain/pathGuard";
import { resolveSessionCwd } from "../domain/sessionCwdResolver";
import { getAllProviderMeta, getProviderMeta } from "../domain/providerRegistry";
import { getSessionFactory } from "../infrastructure/sessions";
import { sessionConfigToSpawn } from "../infrastructure/sessions/BaseAISession";
import type { BaseAISession } from "../infrastructure/sessions";
import { getProviderCapability } from "@magenta/shared/providerCapabilities";
import { getToArgv } from "../domain/providerArgv";
import { resolveSessionId } from "../domain/sessionIdResolver";
import { buildForkArgv } from "../domain/forkArgvBuilder";
import { awaitProviderSessionId } from "./awaitProviderSessionId";
import type { GitGateway } from "../infrastructure/GitGateway";
import { AppError } from "../errors/AppError";
import type { AiPresetService } from "./AiPresetService";

/**
 * AISessionApplicationService is the in-memory home for live AI sessions.
 *
 * Design note — we intentionally do NOT persist session records to SQLite.
 * The authoritative record of every session lives on disk (Claude Code under
 * ~/.claude/projects/, Copilot under ~/.copilot/session-state/) and is picked
 * up by SessionSyncApplicationService within ~300 ms of any JSONL append (via
 * fs.watch). On app restart every live PTY dies, so there's no live state
 * worth persisting: the sync job reconstructs the full list from disk, which
 * is the single source of truth.
 *
 * The only state we hold is the in-memory records + their running PTYs,
 * keyed by a locally-generated UUID. The agent-generated session UUID is
 * captured post-spawn (for both Claude and Copilot) into
 * `providerSessionId`, which is the same id the sync layer writes into
 * synced_sessions.session_id — so live ↔ synced rows join by
 * providerSessionId.
 */
export class AISessionApplicationService {
  private readonly records = new Map<string, AISessionRecord>();
  private readonly liveSessions = new Map<string, BaseAISession>();
  /**
   * Phase 5 — subscribers waiting for a provider-assigned session UUID.
   * Populated by `awaitProviderSessionId` callers (e.g. `resumeSession`
   * for Copilot); fired from the Claude / Copilot reconciliation patches.
   */
  private readonly reconcileWaiters = new Map<string, Set<(p: string) => void>>();
  /** FR-7.2.c — bounded wait for provider-assigned UUID. Default 5s. */
  private readonly resumeReconciliationTimeoutMs: number;

  constructor(
    private readonly bridge: IPCBridge,
    /**
     * Allowlist provider for repo/worktree paths. ai-session:create spawns a
     * long-running AI CLI under the selected cwd; without containment the
     * renderer could spawn those processes anywhere on disk.
     */
    private readonly allowlistProvider: PathAllowlistProvider,
    /** Optional — enables worktree-existence checks on resume. */
    private readonly gitGateway?: GitGateway,
    /** Optional — resolves Phase 4 tool/permission presets per provider. */
    private readonly presetService?: AiPresetService,
    options?: { resumeReconciliationTimeoutMs?: number },
  ) {
    this.resumeReconciliationTimeoutMs =
      options?.resumeReconciliationTimeoutMs ?? 5_000;
  }

  /**
   * Subscribe to a one-shot notification when this canonical sessionId gets
   * its provider-assigned UUID reconciled. Returns an unsubscribe function.
   */
  private subscribeReconciled(
    sessionId: string,
    cb: (providerSessionId: string) => void,
  ): () => void {
    let set = this.reconcileWaiters.get(sessionId);
    if (!set) {
      set = new Set();
      this.reconcileWaiters.set(sessionId, set);
    }
    set.add(cb);
    return () => {
      const s = this.reconcileWaiters.get(sessionId);
      if (!s) return;
      s.delete(cb);
      if (s.size === 0) this.reconcileWaiters.delete(sessionId);
    };
  }

  /**
   * Internal entry point invoked by Claude / Copilot reconciliation paths
   * once the provider-assigned UUID is known. Emits the
   * `ai-session:reconciled` push event (FR-7.4) and notifies any pending
   * `awaitProviderSessionId` waiters.
   */
  private onProviderSessionIdReconciled(
    sessionId: string,
    providerSessionId: string,
  ): void {
    this.bridge.emit({
      type: "ai-session:reconciled",
      sessionId,
      providerSessionId,
    });
    const waiters = this.reconcileWaiters.get(sessionId);
    if (waiters) {
      for (const cb of waiters) {
        try { cb(providerSessionId); } catch { /* best effort */ }
      }
      this.reconcileWaiters.delete(sessionId);
    }
  }

  async createSession(
    config: AISessionConfig,
    cols: number,
    rows: number,
  ): Promise<AISessionRecord> {
    const provider = config.provider;
    const providerMeta = getProviderMeta(provider);
    const permissionMode: AIPermissionMode = config.permissionMode ?? "auto";

    // Resolve working directory and enforce containment. The guard must
    // run on the *resolved* cwd (which may be a worktree path derived from
    // repoPath) — not on the raw config fields, because worktree paths can
    // legitimately sit outside the repoPath itself but must still live under
    // one of the user's declared working directories.
    const rawCwd = resolveSessionCwd({
      repoPath: config.repoPath,
      worktreePath: config.worktreePath,
    });
    const cwd = resolveAndAssert(rawCwd, buildAllowlist(this.allowlistProvider));

    // Ensure directory exists
    await fs.mkdir(cwd, { recursive: true });

    // Derive repo / worktree names from path
    const repoName = config.repoPath ? path.basename(config.repoPath) : null;
    const worktreeName = config.worktreePath ? path.basename(config.worktreePath) : null;

    // ── Resolve agent session ID strategy ────────────────────────────────
    //
    // Neither Claude nor Copilot accept a flag to pin the session UUID on
    // spawn (Claude's `--session-id` is rejected when combined with
    // `--continue`/`--resume` unless `--fork-session` is also set, and we
    // don't want to fork). Both CLIs generate their own UUID on disk.
    //
    // Strategy: assign a local `id` for the in-memory Map key and let the
    // background sync job capture the real agent UUID into
    // `providerSessionId`. Post-spawn reconciliation watches the provider's
    // state directory and patches the live record once the UUID appears.
    //
    // Resuming a synced session passes its sessionId via
    // config.providerSessionId → the CLI is invoked with `--resume <id>`
    // (Claude) or `--resume=<id>` (Copilot), no `--session-id` involved.
    const explicitId = config.providerSessionId;
    // FR-7.1 — caller-provided sessionId wins; otherwise generate UUID v4.
    const id = resolveSessionId({
      callerProvided: config.sessionId,
      generate: randomUUID,
    });

    // FR-7.3 — idempotent reconnect: if a row already exists for the same
    // canonical sessionId AND the same repoPath/worktreePath, treat the create
    // as resume.
    const existingRecord = this.records.get(id);
    if (
      existingRecord &&
      (existingRecord.repoPath ?? null) === (config.repoPath ?? null) &&
      (existingRecord.worktreePath ?? null) === (config.worktreePath ?? null)
    ) {
      return this.resumeSession(id, cols, rows);
    }

    const initialProviderSessionId = explicitId ?? null;

    // Phase 4 — resolve preset, then layer caller-provided fields on top.
    const caps = getProviderCapability(provider);
    let mergedAllowedTools = config.allowedTools;
    let mergedDisallowedTools = config.disallowedTools;
    let mergedPermissionMode: AIPermissionMode = permissionMode;

    if (config.presetId && this.presetService) {
      const presetSpawn = this.presetService.resolveForProvider(
        config.presetId,
        provider,
      );
      // Caller-explicit fields beat the preset; preset fills in undefined.
      if (mergedAllowedTools === undefined && presetSpawn.allowedTools) {
        mergedAllowedTools = presetSpawn.allowedTools;
      }
      if (mergedDisallowedTools === undefined && presetSpawn.disallowedTools) {
        mergedDisallowedTools = presetSpawn.disallowedTools;
      }
      if (
        config.permissionMode === undefined &&
        presetSpawn.permissionMode !== undefined
      ) {
        mergedPermissionMode = presetSpawn.permissionMode;
      }
    }

    // Reject unsupported permission-prompt-tool on providers without the cap.
    if (
      config.permissionPromptTool &&
      !caps.supportedKeys.includes("permissionPromptTool")
    ) {
      throw new AppError(
        "UNSUPPORTED_SPAWN_OPTION",
        `${provider} does not support permissionPromptTool`,
      );
    }

    // Build CLI args via the shared toArgv translator. Provider defaults
    // are prepended so legacy registry behaviour (e.g. always-on flags) is
    // preserved. Arbitrary caller-supplied args are not forwarded: see
    // ai-session:create schema rationale in packages/shared.
    const spawnOpts = sessionConfigToSpawn(provider, {
      ...config,
      permissionMode: mergedPermissionMode,
      providerSessionId: explicitId,
      allowedTools: mergedAllowedTools,
      disallowedTools: mergedDisallowedTools,
      permissionPromptTool: config.permissionPromptTool,
      noAskUser: config.noAskUser,
      programmatic: config.programmatic,
    });

    // FR-7.1.c — emit `--session-id` for providers that honour it. Use the
    // canonical Magenta id so the provider session file equals the canonical
    // row id (Claude). Skip for fork (the fork builder owns argv shape) and
    // for resume paths (caller already provided `providerSessionId`).
    if (caps.supportsExplicitSessionId && !config.forkSession && !explicitId) {
      spawnOpts.sessionId = id;
    }

    const { args: derivedArgs } = getToArgv(provider)(spawnOpts, caps);
    let args = [...providerMeta.defaultArgs, ...derivedArgs];

    // FR-7.7 — fork path overrides the lifecycle argv block. The fork
    // translator emits `--resume <parent> --fork-session [--session-id <child>]`
    // verbatim; everything else (model, tools, permissions) still comes
    // from the standard argv builder above.
    if (config.forkSession && config.providerSessionId) {
      // Strip out lifecycle flags emitted by the standard builder so we don't
      // double up `--session-id` / `--resume`.
      args = args.filter((a, i, arr) => {
        const prev = i > 0 ? arr[i - 1] : null;
        if (a === "--session-id" || a === "--resume" || a === "--fork-session") return false;
        if (prev === "--session-id" || prev === "--resume") return false;
        return true;
      });
      args.push(
        ...buildForkArgv({
          parentResumeToken: config.providerSessionId,
          childCanonicalId: id,
          capability: {
            supportsForkSession: caps.supportsForkSession,
            supportsExplicitSessionId: caps.supportsExplicitSessionId,
            provider,
          },
        }),
      );
    }

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
      providerSessionId: initialProviderSessionId,
      status: "active", // Runtime status — not persisted
      permissionMode: mergedPermissionMode,
      title: null,
      parentSessionId: config.parentSessionId ?? null,
      createdAt: now,
      lastActiveAt: now,
    };
    this.records.set(id, record);

    // Spawn PTY session via factory
    const factory = getSessionFactory(provider);
    const session = factory.create(id);

    // Wire events → bridge push events
    this.wireSessionEvents(id, session);

    session.start(cwd, args, cols, rows);
    this.liveSessions.set(id, session);

    // Schedule post-spawn reconciliation when we don't already know the
    // agent's session id (i.e. brand-new sessions). Claude and Copilot
    // both generate their own UUIDs on disk; the reconciler watches the
    // provider's state dir and patches `providerSessionId` on match.
    if (!initialProviderSessionId) {
      if (provider === "copilot") {
        this.scheduleCopilotReconciliation(id, cwd, now);
      } else if (provider === "claude") {
        this.scheduleClaudeReconciliation(id, cwd, now);
      }
    }

    return record;
  }

  /**
   * FR-7.7 — Fork an existing session into a new canonical row whose
   * `parentSessionId` points back at the original. Claude only; Copilot
   * raises `UNSUPPORTED_SPAWN_OPTION`.
   */
  async forkSession(
    parentSessionId: string,
    childSessionId: string | undefined,
    cols: number,
    rows: number,
  ): Promise<AISessionRecord> {
    const parent = this.records.get(parentSessionId);
    if (!parent) {
      throw new AppError("NOT_FOUND", `Parent session not found: ${parentSessionId}`);
    }
    const caps = getProviderCapability(parent.provider);
    if (!caps.supportsForkSession) {
      throw new AppError(
        "UNSUPPORTED_SPAWN_OPTION",
        `Provider '${parent.provider}' does not support fork-session`,
      );
    }
    // Resolve the parent's provider-side resume token. For Claude this equals
    // the canonical id (the provider session id is reconciled to match);
    // fall back to canonical id if reconciliation hasn't happened yet.
    const parentResumeToken = parent.providerSessionId ?? parent.id;

    const config: AISessionConfig = {
      provider: parent.provider,
      repoPath: parent.repoPath ?? undefined,
      branch: parent.branch ?? undefined,
      worktreePath: parent.worktreePath ?? undefined,
      permissionMode: parent.permissionMode,
      sessionId: childSessionId,
      parentSessionId: parent.id,
      forkSession: true,
      // Threaded into argv assembly's fork branch as the `--resume` token.
      providerSessionId: parentResumeToken,
    };
    return this.createSession(config, cols, rows);
  }

  /**
   * Checks whether a worktree still exists as a valid git worktree.
   * Used by the UI to decide whether to offer re-creation before resuming.
   */
  async checkWorktreeExists(
    worktreePath: string,
    repoPath: string,
  ): Promise<{ valid: boolean; repoPath: string; worktreeName: string }> {
    const worktreeName = path.basename(worktreePath);
    if (!this.gitGateway) {
      return { valid: true, repoPath, worktreeName };
    }
    try {
      const worktrees = await this.gitGateway.listWorktrees(repoPath);
      const exists = worktrees.some(
        (wt) => path.normalize(wt.worktreePath) === path.normalize(worktreePath),
      );
      return { valid: exists, repoPath, worktreeName };
    } catch {
      return { valid: false, repoPath, worktreeName };
    }
  }

  async resumeSession(
    sessionId: string,
    cols: number,
    rows: number,
  ): Promise<AISessionRecord> {
    const record = this.records.get(sessionId);
    if (!record) {
      throw new AppError("NOT_FOUND", `AI session not found: ${sessionId}`);
    }

    // If already live, just return with current status
    const existingSession = this.liveSessions.get(sessionId);
    if (existingSession) {
      return { ...record, status: existingSession.getStatus() };
    }

    // Ensure directory still exists. For worktree sessions, verify the
    // worktree is a real git worktree — not just a bare directory.
    if (record.worktreePath && record.repoPath && this.gitGateway) {
      const check = await this.checkWorktreeExists(record.worktreePath, record.repoPath);
      if (!check.valid) {
        throw new AppError(
          "WORKTREE_MISSING",
          `Worktree "${check.worktreeName}" no longer exists under ${record.repoPath}`,
        );
      }
    } else {
      await fs.mkdir(record.cwd, { recursive: true });
    }

    const providerMeta = getProviderMeta(record.provider);

    // Build args for resume.
    //
    // Claude:  --resume <id> if the synced UUID is known, else --continue
    //          (legacy records that never got reconciled).
    // Copilot: --resume=<id> if known, else --continue.
    //
    // We never pass --session-id here: Claude rejects it alongside
    // --resume/--continue unless --fork-session is specified, which would
    // create a new conversation branch instead of continuing the original.
    const resumeId = record.providerSessionId;
    const resumeSpawn = sessionConfigToSpawn(record.provider, {
      provider: record.provider,
      permissionMode: record.permissionMode,
      providerSessionId: resumeId ?? undefined,
    });
    // continueRecent fallback when no synced UUID is known (legacy records).
    if (!resumeId) resumeSpawn.continueRecent = true;
    const resumeCaps = getProviderCapability(record.provider);
    const { args: resumeDerived } = getToArgv(record.provider)(resumeSpawn, resumeCaps);
    const args = [...providerMeta.defaultArgs, ...resumeDerived];

    // Spawn PTY
    const factory = getSessionFactory(record.provider);
    const session = factory.create(sessionId);

    this.wireSessionEvents(sessionId, session);

    session.start(record.cwd, args, cols, rows);
    this.liveSessions.set(sessionId, session);

    // Update lastActiveAt (in-memory)
    const now = Date.now();
    const updated: AISessionRecord = { ...record, lastActiveAt: now };
    this.records.set(sessionId, updated);

    return { ...updated, permissionMode: updated.permissionMode ?? "default", status: "active" };
  }

  /**
   * List all live sessions with their real-time PTY status.
   * Note: this only returns sessions that were created (or resumed) in the
   * current daemon process. Historical sessions live in synced_sessions —
   * the renderer merges both lists on the UI side.
   */
  listSessions(): AISessionListEntry[] {
    return [...this.records.values()].map((record) => {
      const liveSession = this.liveSessions.get(record.id);
      return {
        ...record,
        status: liveSession ? liveSession.getStatus() : "idle",
        resumable: this.isResumable(record),
      };
    });
  }

  /**
   * FR-7.6 — Claude: canonical id equals provider session id; we treat it as
   * resumable as long as the record exists (disk presence is verified lazily
   * on resume). Copilot: resumable iff providerSessionId is reconciled.
   */
  private isResumable(record: AISessionRecord): boolean {
    if (record.provider === "claude") return true;
    return record.providerSessionId !== null;
  }

  deleteSession(sessionId: string): void {
    // Kill live session if active, then drop from memory.
    this.stop(sessionId);
    this.records.delete(sessionId);
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
    const record = this.records.get(sessionId);
    if (!record) {
      throw new AppError("NOT_FOUND", `AI session not found: ${sessionId}`);
    }

    const session = this.liveSessions.get(sessionId);
    if (!session) {
      throw new AppError("NOT_FOUND", `AI session is not live: ${sessionId}`);
    }

    // Update in-memory record
    this.records.set(sessionId, { ...record, permissionMode: mode });

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
   * Post-spawn reconciliation for a brand-new Copilot session.
   *
   * Copilot CLI doesn't accept a `--session-id` flag — it generates its own
   * UUID and writes everything under ~/.copilot/session-state/<uuid>/. To
   * link the live `ai_sessions` row to the synced row, we poll that
   * directory for a freshly-created session whose `workspace.yaml` cwd
   * matches our spawn cwd.
   *
   * Strategy: poll every 500 ms for up to 30 s. The first matching
   * directory wins (Copilot creates it within ~1–2 s of spawn). On match,
   * patch `providerSessionId` on the live record and emit `ai-session:updated`
   * so the UI tree dedup picks it up.
   */
  private scheduleCopilotReconciliation(
    liveId: string,
    cwd: string,
    spawnedAt: number,
  ): void {
    const stateDir = path.join(os.homedir(), ".copilot", "session-state");
    const POLL_INTERVAL_MS = 500;
    const TIMEOUT_MS = 30_000;
    // Allow a small clock-skew tolerance so a workspace.yaml whose
    // created_at sits a few hundred ms earlier than spawnedAt still matches.
    const SKEW_TOLERANCE_MS = 1_500;
    const deadline = spawnedAt + TIMEOUT_MS;
    const normalizedCwd = path.normalize(cwd);

    const tryReconcile = (): void => {
      // Bail out if the session was already reconciled (e.g. via a manual
      // path or a concurrent run) or has been deleted.
      const current = this.records.get(liveId);
      if (!current) return;
      if (current.providerSessionId) return;

      let match: { sessionId: string } | null = null;

      try {
        if (existsSync(stateDir)) {
          const dirs = readdirSync(stateDir, { withFileTypes: true });
          for (const dir of dirs) {
            if (!dir.isDirectory()) continue;
            const sessionDir = path.join(stateDir, dir.name);
            const yamlPath = path.join(sessionDir, "workspace.yaml");
            if (!existsSync(yamlPath)) continue;

            // Quick mtime gate before parsing — skip dirs created before
            // we spawned (with a small tolerance for clock skew).
            try {
              const stat = statSync(yamlPath);
              if (stat.mtimeMs < spawnedAt - SKEW_TOLERANCE_MS) continue;
            } catch {
              continue;
            }

            try {
              const content = readFileSync(yamlPath, "utf-8");
              const ws = parseWorkspaceYaml(content);
              if (!ws.cwd) continue;
              if (path.normalize(ws.cwd) !== normalizedCwd) continue;
              match = { sessionId: dir.name };
              break;
            } catch {
              // Skip unreadable / malformed yaml
            }
          }
        }
      } catch (err) {
        console.warn(`[AISession] Copilot reconcile scan failed:`, err);
      }

      if (match) {
        // Extract title from workspace.yaml summary field.
        let title: string | null = null;
        try {
          const yamlPath = path.join(stateDir, match.sessionId, "workspace.yaml");
          const content = readFileSync(yamlPath, "utf-8");
          const ws = parseWorkspaceYaml(content);
          title = ws.summary ?? null;
        } catch {
          // workspace.yaml may not have a summary — title stays null
        }

        const updated: AISessionRecord = { ...current, providerSessionId: match.sessionId, title };
        this.records.set(liveId, updated);
        // Mirror the live runtime status onto the broadcast record so the
        // UI doesn't briefly flip back to "idle" after the dedup runs.
        const liveRuntime = this.liveSessions.get(liveId);
        this.bridge.emit({
          type: "ai-session:updated",
          session: { ...updated, status: liveRuntime ? liveRuntime.getStatus() : updated.status },
        });
        // FR-7.4 — surface provider-assigned UUID for resumability checks +
        // wake any pending bounded-wait awaitProviderSessionId callers.
        this.onProviderSessionIdReconciled(liveId, match.sessionId);
        if (title) {
          this.bridge.emit({ type: "ai-session:title", sessionId: liveId, title });
        }
        return;
      }

      if (Date.now() >= deadline) {
        console.log(
          `[AISession] Copilot reconcile timed out for live id=${liveId} cwd=${cwd}`,
        );
        return;
      }

      setTimeout(tryReconcile, POLL_INTERVAL_MS);
    };

    // First attempt slightly delayed — Copilot needs a moment to write its
    // workspace.yaml after spawn.
    setTimeout(tryReconcile, POLL_INTERVAL_MS);
  }

  /**
   * Post-spawn reconciliation for a brand-new Claude session.
   *
   * Claude Code writes each conversation to
   * `~/.claude/projects/<encodedCwd>/<uuid>.jsonl`, where encodedCwd is
   * the absolute cwd with path separators replaced by dashes (and a
   * leading dash added). The JSONL is created on the first user/assistant
   * message, not at spawn time — so reconciliation may take a while if
   * the user is idle after launch. We poll every 500 ms up to 10 min.
   *
   * Strategy: watch the encoded project dir for `.jsonl` files whose
   * mtime is after spawnedAt. The newest matching file wins. On match,
   * patch `providerSessionId` on the live record and emit
   * `ai-session:updated` so the UI tree dedup picks it up.
   */
  private scheduleClaudeReconciliation(
    liveId: string,
    cwd: string,
    spawnedAt: number,
  ): void {
    // Claude encodes the cwd by replacing path separators with dashes.
    // Absolute path `/Users/foo/bar` → `-Users-foo-bar`.
    const encodedCwd = path.normalize(cwd).replace(/[\\/:]/g, "-");
    const projectDir = path.join(
      os.homedir(),
      ".claude",
      "projects",
      encodedCwd,
    );
    const POLL_INTERVAL_MS = 500;
    const TIMEOUT_MS = 10 * 60_000;
    const SKEW_TOLERANCE_MS = 1_500;
    const deadline = spawnedAt + TIMEOUT_MS;

    const tryReconcile = (): void => {
      // Bail out if the session was already reconciled (e.g. via a manual
      // path or a concurrent run) or has been deleted.
      const current = this.records.get(liveId);
      if (!current) return;
      if (current.providerSessionId) return;

      let match: { sessionId: string; mtime: number } | null = null;

      try {
        if (existsSync(projectDir)) {
          const files = readdirSync(projectDir, { withFileTypes: true });
          for (const file of files) {
            if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
            const filePath = path.join(projectDir, file.name);
            try {
              const stat = statSync(filePath);
              if (stat.mtimeMs < spawnedAt - SKEW_TOLERANCE_MS) continue;
              if (!match || stat.mtimeMs > match.mtime) {
                match = {
                  sessionId: file.name.replace(/\.jsonl$/, ""),
                  mtime: stat.mtimeMs,
                };
              }
            } catch {
              // Skip files we can't stat
            }
          }
        }
      } catch (err) {
        console.warn(`[AISession] Claude reconcile scan failed:`, err);
      }

      if (match) {
        // Extract title from the JSONL file's first user message.
        let title: string | null = null;
        try {
          const jsonlPath = path.join(projectDir, `${match.sessionId}.jsonl`);
          const raw = readFileSync(jsonlPath, "utf-8");
          for (const line of raw.split("\n")) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line) as Record<string, unknown>;
              if (event.type !== "user") continue;
              const message = event.message as Record<string, unknown> | undefined;
              if (message) {
                const content = message.content;
                if (typeof content === "string") {
                  title = extractTitleFromContent(content);
                }
              }
              break; // Only inspect the first user message
            } catch {
              // Skip malformed lines
            }
          }
        } catch {
          // JSONL may not be readable yet — title stays null
        }

        const updated: AISessionRecord = {
          ...current,
          providerSessionId: match.sessionId,
          title,
        };
        this.records.set(liveId, updated);
        const liveRuntime = this.liveSessions.get(liveId);
        this.bridge.emit({
          type: "ai-session:updated",
          session: {
            ...updated,
            status: liveRuntime ? liveRuntime.getStatus() : updated.status,
          },
        });
        // FR-7.4 — surface provider-assigned UUID for resumability checks.
        this.onProviderSessionIdReconciled(liveId, match.sessionId);
        if (title) {
          this.bridge.emit({ type: "ai-session:title", sessionId: liveId, title });
        }
        return;
      }

      if (Date.now() >= deadline) {
        console.log(
          `[AISession] Claude reconcile timed out for live id=${liveId} cwd=${cwd}`,
        );
        return;
      }

      setTimeout(tryReconcile, POLL_INTERVAL_MS);
    };

    // First attempt slightly delayed — Claude writes its JSONL only after
    // the first message, so early polls usually miss.
    setTimeout(tryReconcile, POLL_INTERVAL_MS);
  }

  /**
   * Update the in-memory record's lastActiveAt. No-op if the record was
   * already dropped (e.g. deleteSession ran concurrently).
   */
  private touchLastActive(sessionId: string): void {
    const record = this.records.get(sessionId);
    if (!record) return;
    this.records.set(sessionId, { ...record, lastActiveAt: Date.now() });
  }

  /**
   * Wire PTY session events to IPC bridge push events.
   * Status changes and exit events are broadcast to the UI in real time.
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
      this.touchLastActive(sessionId);
    });
    session.on("exit", (exitCode: number) => {
      this.liveSessions.delete(sessionId);
      this.bridge.emit({ type: "ai-session:exited", sessionId, exitCode });
      this.touchLastActive(sessionId);
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
