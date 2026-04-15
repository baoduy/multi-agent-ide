/**
 * RingBuffer — bounded, sequence-numbered chunk buffer for terminal output.
 *
 * Every write returns a monotonically-increasing seq number. Subscribers
 * pass their last-seen seq to `since()` to receive only what they missed.
 * When the byte budget is exceeded, oldest chunks are evicted — callers
 * that ask for chunks older than the tail receive a "snapshot" (the full
 * current tail as a single chunk) so they never see partial/torn state.
 *
 * This is the durability backbone of the terminal system:
 *   - Reload the renderer → reattach from `lastSeq`, replay the gap.
 *   - Multiple viewers of the same session (split pane, observer) each
 *     track their own `lastSeq` independently.
 *   - PTY keeps producing at native speed; flow control is applied only
 *     on the emit side, not the ingest side.
 */
export interface Chunk {
  readonly seq: number;
  readonly data: string;
}

export interface AttachResult {
  /** Chunks to replay, ordered by seq ascending. */
  readonly chunks: Chunk[];
  /**
   * True when the requested `fromSeq` was older than the buffer tail and
   * `chunks` is a collapsed snapshot of the full current buffer contents.
   * The UI can use this to reset xterm before writing the snapshot.
   */
  readonly snapshot: boolean;
  /** The head seq as of this call — the newest seq in `chunks`. */
  readonly headSeq: number;
}

export class RingBuffer {
  private readonly chunks: Chunk[] = [];
  private headSeqValue = 0;
  /** Total bytes currently held in `chunks`. */
  private totalBytes = 0;

  constructor(private readonly maxBytes: number = 4 * 1024 * 1024) {}

  /** Monotonic seq of the newest chunk. 0 means nothing has been pushed yet. */
  get headSeq(): number {
    return this.headSeqValue;
  }

  /** Seq of the oldest chunk still retained. 0 when empty. */
  get tailSeq(): number {
    return this.chunks.length > 0 ? this.chunks[0].seq : 0;
  }

  /** Append a chunk, evicting oldest if needed. Returns the new head seq. */
  push(data: string): number {
    if (data.length === 0) return this.headSeqValue;
    this.headSeqValue += 1;
    const chunk: Chunk = { seq: this.headSeqValue, data };
    this.chunks.push(chunk);
    this.totalBytes += data.length;
    this.evictIfNeeded();
    return this.headSeqValue;
  }

  /**
   * Return everything newer than `fromSeq`. If `fromSeq` is older than the
   * tail (or omitted), returns a *snapshot*: a single chunk containing the
   * concatenated current buffer contents. The snapshot's seq equals the
   * current head, so the caller's next `fromSeq` is correct.
   */
  since(fromSeq = 0): AttachResult {
    if (this.chunks.length === 0) {
      return { chunks: [], snapshot: false, headSeq: this.headSeqValue };
    }

    // If requester is up-to-date, nothing to send
    if (fromSeq >= this.headSeqValue) {
      return { chunks: [], snapshot: false, headSeq: this.headSeqValue };
    }

    // If requester is older than our tail, collapse into a snapshot.
    // fromSeq === 0 (fresh attach) also takes the snapshot path.
    if (fromSeq < this.tailSeq) {
      const collapsed = this.chunks.map((c) => c.data).join("");
      return {
        chunks: [{ seq: this.headSeqValue, data: collapsed }],
        snapshot: true,
        headSeq: this.headSeqValue,
      };
    }

    // Partial catch-up — slice from fromSeq+1 onward
    const out: Chunk[] = [];
    for (const c of this.chunks) {
      if (c.seq > fromSeq) out.push(c);
    }
    return { chunks: out, snapshot: false, headSeq: this.headSeqValue };
  }

  /** Reset the buffer. Seq numbers continue monotonically. */
  clear(): void {
    this.chunks.length = 0;
    this.totalBytes = 0;
  }

  /** Current number of retained bytes. */
  get byteLength(): number {
    return this.totalBytes;
  }

  private evictIfNeeded(): void {
    while (this.totalBytes > this.maxBytes && this.chunks.length > 1) {
      const evicted = this.chunks.shift()!;
      this.totalBytes -= evicted.data.length;
    }
  }
}
