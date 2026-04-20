import path from "node:path";
import type {
  SyncedSessionRecord,
  SyncedSessionProvider,
} from "@magenta/shared/syncedSession";
import type { DatabaseService } from "../db/DatabaseService";
import type { LmdbDatabase } from "../db/LmdbStore";

/**
 * Full on-disk row — SyncedSessionRecord plus the sync bookkeeping columns
 * the SQL table carried (mtime / size / lastSyncedAt).
 */
interface SyncedSessionRow extends SyncedSessionRecord {
  syncedFileMtime: number;
  syncedFileSize: number;
  lastSyncedAt: number;
}

/** Width used for the inverted-timestamp segment in the provider index. */
const TS_WIDTH = 16;
/** Largest value we need the inverted timestamp to subtract from. */
const TS_MAX = Number.MAX_SAFE_INTEGER;

function invertedTs(startedAtMs: number): string {
  return String(TS_MAX - startedAtMs).padStart(TS_WIDTH, "0");
}

/**
 * LMDB-backed repository for `synced_sessions`.
 *
 * Sub-db layout:
 *   synced_sessions:
 *     session:${id}                                → SyncedSessionRow
 *     session:file:${syncedFilePath}               → id
 *     session:provider:${provider}:${invertedStartedAt}:${id}  → id
 *
 * The inverted-timestamp index lets `listByProvider()` do a forward prefix
 * scan and receive rows in DESC started_at order with no in-memory sort.
 */
export class SyncedSessionRepository {
  private readonly db: LmdbDatabase<unknown>;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getDb("synced_sessions");
  }

  list(): SyncedSessionRecord[] {
    // Scan only primary-key entries. Range bounds isolate primaries from the
    // two secondary indexes: primary IDs are `${provider}:${uuid}`, where
    // provider is "claude-code" or "copilot" — both start with 'c' (0x63),
    // which sorts between ':' (0x3A) and 'f' (0x66). The file index starts
    // at "session:file:" (end-exclusive), and the provider index starts at
    // "session:provider:" (above the end bound entirely). No in-loop filter
    // needed — a previous `.includes(":")` check here wrongly excluded every
    // primary because the IDs themselves contain a colon.
    const rows: SyncedSessionRow[] = [];
    for (const entry of this.db.range({ start: "session:", end: "session:file:" })) {
      const row = entry.value as SyncedSessionRow;
      if (row.isArchived) continue;
      rows.push(row);
    }
    rows.sort((a, b) => b.startedAt - a.startedAt);
    return rows.map(stripSyncBookkeeping);
  }

  listByProvider(provider: SyncedSessionProvider): SyncedSessionRecord[] {
    const out: SyncedSessionRecord[] = [];
    for (const entry of this.db.range({
      prefix: `session:provider:${provider}:`,
    })) {
      const id = entry.value as string;
      const row = this.db.get(`session:${id}`) as SyncedSessionRow | undefined;
      if (!row || row.isArchived) continue;
      out.push(stripSyncBookkeeping(row));
    }
    return out;
  }

  getFileSync(filePath: string): { mtime: number; size: number } | null {
    const id = this.db.get(`session:file:${filePath}`) as string | undefined;
    if (!id) return null;
    const row = this.db.get(`session:${id}`) as SyncedSessionRow | undefined;
    if (!row) return null;
    return { mtime: row.syncedFileMtime, size: row.syncedFileSize };
  }

  upsert(
    record: SyncedSessionRecord & {
      syncedFilePath: string;
      syncedFileMtime: number;
      syncedFileSize: number;
      lastSyncedAt: number;
    },
  ): void {
    this.databaseService.transactionSync(() => {
      const existing = this.db.get(`session:${record.id}`) as
        | SyncedSessionRow
        | undefined;

      // Preserve an explicitly archived state across resync.
      const preservedArchived = existing?.isArchived === true ? true : record.isArchived;

      // If started_at changed, the old provider-index entry must be removed.
      if (existing && existing.provider === record.provider) {
        if (existing.startedAt !== record.startedAt) {
          this.db.removeSync(
            `session:provider:${existing.provider}:${invertedTs(existing.startedAt)}:${existing.id}`,
          );
        }
      }
      // If provider changed (shouldn't happen in practice but be defensive),
      // remove the old provider-index entry entirely.
      if (existing && existing.provider !== record.provider) {
        this.db.removeSync(
          `session:provider:${existing.provider}:${invertedTs(existing.startedAt)}:${existing.id}`,
        );
      }
      // If syncedFilePath changed, remove the old file index.
      if (existing && existing.syncedFilePath && existing.syncedFilePath !== record.syncedFilePath) {
        this.db.removeSync(`session:file:${existing.syncedFilePath}`);
      }

      const row: SyncedSessionRow = {
        ...record,
        isArchived: preservedArchived,
      };

      this.db.putSync(`session:${record.id}`, row);
      this.db.putSync(`session:file:${record.syncedFilePath}`, record.id);
      this.db.putSync(
        `session:provider:${record.provider}:${invertedTs(record.startedAt)}:${record.id}`,
        record.id,
      );
    });
  }

  archiveById(id: string): boolean {
    const row = this.db.get(`session:${id}`) as SyncedSessionRow | undefined;
    if (!row) return false;
    if (row.isArchived) return false;
    const updated: SyncedSessionRow = { ...row, isArchived: true };
    this.db.putSync(`session:${id}`, updated);
    return true;
  }

  deleteByProvider(provider: SyncedSessionProvider): number {
    let count = 0;
    this.databaseService.transactionSync(() => {
      const ids: string[] = [];
      for (const entry of this.db.range({ prefix: `session:provider:${provider}:` })) {
        ids.push(entry.value as string);
      }
      for (const id of ids) {
        this.removeByIdSync(id);
        count += 1;
      }
    });
    return count;
  }

  countByProvider(provider: SyncedSessionProvider): number {
    return this.db.countRange({ prefix: `session:provider:${provider}:` });
  }

  /**
   * Delete Claude Code synced sessions whose cwd does not match any of the
   * given known paths. A session matches if its cwd equals or is a
   * subdirectory of any known path. Sessions with null cwd are also removed.
   *
   * Copilot sessions are intentionally excluded — their inclusion is governed
   * by workspace.yaml presence on disk, not knownPaths membership.
   */
  deleteClaudeWhereNotMatchingPaths(knownPaths: readonly string[]): number {
    if (knownPaths.length === 0) return 0;

    const normalizedKnownPaths = knownPaths.map((p) => path.normalize(p));

    const idsToDelete: string[] = [];
    for (const entry of this.db.range({
      prefix: `session:provider:claude-code:`,
    })) {
      const id = entry.value as string;
      const row = this.db.get(`session:${id}`) as SyncedSessionRow | undefined;
      if (!row) continue;
      if (!row.cwd) {
        idsToDelete.push(id);
        continue;
      }
      const normalizedCwd = path.normalize(row.cwd);
      const matches = normalizedKnownPaths.some(
        (known) => normalizedCwd === known || normalizedCwd.startsWith(known + path.sep),
      );
      if (!matches) idsToDelete.push(id);
    }

    if (idsToDelete.length === 0) return 0;

    this.databaseService.transactionSync(() => {
      for (const id of idsToDelete) this.removeByIdSync(id);
    });
    return idsToDelete.length;
  }

  /** No-op for source compatibility with the SQL repository. */
  flush(): void {
    // intentional no-op
  }

  // --- internal helpers (call inside an active sync transaction) ---

  private removeByIdSync(id: string): void {
    const row = this.db.get(`session:${id}`) as SyncedSessionRow | undefined;
    if (!row) return;
    this.db.removeSync(`session:${id}`);
    if (row.syncedFilePath) {
      this.db.removeSync(`session:file:${row.syncedFilePath}`);
    }
    this.db.removeSync(
      `session:provider:${row.provider}:${invertedTs(row.startedAt)}:${row.id}`,
    );
  }
}

function stripSyncBookkeeping(row: SyncedSessionRow): SyncedSessionRecord {
  // The public record shape omits the sync-bookkeeping fields. Rather than
  // constructing it field-by-field (and drifting from the type), strip the
  // three extras via destructuring.
  const { syncedFileMtime, syncedFileSize, lastSyncedAt, ...rest } = row;
  void syncedFileMtime;
  void syncedFileSize;
  void lastSyncedAt;
  return rest;
}
