import type { DatabaseService } from "../../../core/db/DatabaseService";
import type { LmdbDatabase } from "../../../core/db/LmdbStore";
import type { AIProvider } from "@magenta/shared/aiTerminal";
import type { ChatThreadRecord } from "@magenta/shared/chatThread";

/**
 * LMDB-backed repository for `chat_threads`.
 *
 * Layout (single sub-db so iteration is one prefix scan):
 *   row:${filePath}::${provider}::${threadId}  → ChatThreadRecord
 *   active:${filePath}::${provider}            → threadId        (active pointer)
 *   id:${threadId}                             → row-key         (secondary index for O(1) getById/archive)
 */
export class ChatThreadRepository {
  private readonly db: LmdbDatabase<unknown>;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getDb<unknown>("chat_threads");
  }

  private static encodeFilePath(filePath: string): string {
    return encodeURIComponent(filePath);
  }

  private rowKey(filePath: string, provider: AIProvider, threadId: string): string {
    return `row:${ChatThreadRepository.encodeFilePath(filePath)}::${provider}::${threadId}`;
  }

  private activeKey(filePath: string, provider: AIProvider): string {
    return `active:${ChatThreadRepository.encodeFilePath(filePath)}::${provider}`;
  }

  private idKey(threadId: string): string {
    return `id:${threadId}`;
  }

  getById(threadId: string): ChatThreadRecord | null {
    const rowKey = this.db.get(this.idKey(threadId)) as string | undefined;
    if (!rowKey) return null;
    return (this.db.get(rowKey) as ChatThreadRecord | undefined) ?? null;
  }

  getActive(filePath: string, provider: AIProvider): ChatThreadRecord | null {
    const threadId = this.db.get(this.activeKey(filePath, provider)) as string | undefined;
    if (!threadId) return null;
    return this.getById(threadId);
  }

  setActive(filePath: string, provider: AIProvider, threadId: string): void {
    this.databaseService.transactionSync(() => {
      this.db.putSync(this.activeKey(filePath, provider), threadId);
    });
  }

  upsert(record: ChatThreadRecord): void {
    const rowKey = this.rowKey(record.filePath, record.provider, record.threadId);
    this.databaseService.transactionSync(() => {
      this.db.putSync(rowKey, record);
      this.db.putSync(this.idKey(record.threadId), rowKey);
    });
  }

  /**
   * Mark a thread archived. If the active pointer for its (filePath, provider)
   * still points at it, the pointer is cleared so the next `get-active-thread`
   * call returns null and the renderer creates a fresh one.
   */
  archive(threadId: string, archivedAt: number): void {
    const existing = this.getById(threadId);
    if (!existing) return;
    const updated: ChatThreadRecord = { ...existing, archivedAt, updatedAt: archivedAt };
    const rowKey = this.rowKey(existing.filePath, existing.provider, existing.threadId);
    const activeKey = this.activeKey(existing.filePath, existing.provider);

    this.databaseService.transactionSync(() => {
      this.db.putSync(rowKey, updated);
      const currentActive = this.db.get(activeKey) as string | undefined;
      if (currentActive === threadId) {
        this.db.removeSync(activeKey);
      }
    });
  }

  /**
   * List every thread (active + archived) for a file, optionally narrowed by
   * provider. Sorted by `updatedAt` descending so the freshest appears first
   * — useful for a future picker UI.
   */
  listForFile(filePath: string, provider?: AIProvider): ChatThreadRecord[] {
    const encoded = ChatThreadRepository.encodeFilePath(filePath);
    const prefix = provider
      ? `row:${encoded}::${provider}::`
      : `row:${encoded}::`;
    const out: ChatThreadRecord[] = [];
    for (const entry of this.db.range({ prefix })) {
      out.push(entry.value as ChatThreadRecord);
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  }
}
