/**
 * Line-based 3-way merge used by the file-watcher: when a file changes on
 * disk while the user has unsaved edits, we fold the disk change into the
 * editor buffer if the two changes don't overlap. If they do, the caller
 * falls back to a banner that lets the user pick a side.
 *
 * The algorithm:
 *   1. Line-diff `base→ours` and `base→theirs` using LCS.
 *   2. Convert both diffs into hunks indexed by `base` line ranges.
 *   3. If any two hunks from opposite sides overlap AND their replacement
 *      content differs, return a conflict. Otherwise interleave the hunks
 *      over the base and emit the merged text.
 *
 * No-conflict cases we handle cleanly:
 *   - Edits at different places in the file → both applied.
 *   - Both sides make the same edit → applied once.
 *   - One side changed, other untouched → the change applied.
 *
 * This is line-granular — a character-level edit inside a single line that
 * both sides touched will always conflict even if the characters don't
 * overlap. Acceptable for v1 of the markdown editor file-watcher.
 */

export type MergeResult =
  | { ok: true; merged: string }
  | { ok: false; conflicts: Array<{ baseStart: number; baseEnd: number }> };

interface Hunk {
  /** Inclusive base-line index where the hunk begins. */
  baseStart: number;
  /** Exclusive base-line index where the hunk ends. `baseEnd === baseStart` means a pure insertion. */
  baseEnd: number;
  /** Replacement lines. An empty array is a deletion. */
  lines: string[];
}

/**
 * Entry point. Pass the common ancestor (`base`) and the two descendants
 * (`ours` = editor buffer, `theirs` = disk content). Line endings are
 * normalized to `\n` internally; the returned `merged` text uses `\n`.
 *
 * If the three inputs are identical to each other, returns `{ ok: true,
 * merged: base }` without running any diff — saves work on the hot path.
 */
export function threeWayMerge(base: string, ours: string, theirs: string): MergeResult {
  if (ours === theirs) return { ok: true, merged: ours };
  if (ours === base) return { ok: true, merged: theirs };
  if (theirs === base) return { ok: true, merged: ours };

  const baseLines = splitLines(base);
  const oursLines = splitLines(ours);
  const theirsLines = splitLines(theirs);

  const oursHunks = diffToHunks(baseLines, oursLines);
  const theirsHunks = diffToHunks(baseLines, theirsLines);

  // Detect overlapping hunks with different content.
  const conflicts: Array<{ baseStart: number; baseEnd: number }> = [];
  for (const o of oursHunks) {
    for (const t of theirsHunks) {
      if (!rangesOverlap(o, t)) continue;
      if (hunkContentEqual(o, t)) continue;
      conflicts.push({
        baseStart: Math.min(o.baseStart, t.baseStart),
        baseEnd: Math.max(o.baseEnd, t.baseEnd),
      });
    }
  }
  if (conflicts.length > 0) {
    return { ok: false, conflicts };
  }

  // No overlaps — merge all hunks over base.
  const merged = applyHunks(baseLines, [...oursHunks, ...theirsHunks]);
  return { ok: true, merged: merged.join("\n") };
}

/* ─── helpers ─────────────────────────────────────────────────────── */

function splitLines(s: string): string[] {
  // Normalize CRLF and CR to LF; split on LF. Empty final line after a
  // trailing newline is preserved as an empty string so the merged output
  // keeps the file's final newline behavior.
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function rangesOverlap(a: Hunk, b: Hunk): boolean {
  // Half-open ranges. Pure insertions at the same point count as overlap
  // only if they differ in content (the content-equal check runs after).
  if (a.baseStart === a.baseEnd && b.baseStart === b.baseEnd) {
    return a.baseStart === b.baseStart;
  }
  return a.baseStart < b.baseEnd && b.baseStart < a.baseEnd;
}

function hunkContentEqual(a: Hunk, b: Hunk): boolean {
  if (a.baseStart !== b.baseStart || a.baseEnd !== b.baseEnd) return false;
  if (a.lines.length !== b.lines.length) return false;
  for (let i = 0; i < a.lines.length; i++) {
    if (a.lines[i] !== b.lines[i]) return false;
  }
  return true;
}

/**
 * Build an LCS table for `a` and `b`. `dp[i][j]` is the LCS length of
 * a[0..i] and b[0..j]. Classic O(N*M) DP — fine for files up to a few
 * thousand lines, which is what the markdown editor handles.
 */
function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
    }
  }
  return dp;
}

/**
 * Diff `base` against `other` and return a list of hunks describing how to
 * transform base into other. Walks backward from (m, n) through the LCS
 * table, accumulating deletes/inserts into contiguous hunks.
 */
function diffToHunks(base: string[], other: string[]): Hunk[] {
  const dp = lcsTable(base, other);
  const hunks: Hunk[] = [];

  let i = base.length;
  let j = other.length;
  // Accumulate a trailing hunk in progress; pushed when we hit a "keep"
  // (equal lines on both sides).
  let pendingDeletes: number[] = []; // base indices removed, in reverse order
  let pendingInserts: string[] = []; // other lines inserted, in reverse order

  const flush = () => {
    if (pendingDeletes.length === 0 && pendingInserts.length === 0) return;
    // Reverse because we walked backward.
    const baseStart = pendingDeletes.length > 0 ? pendingDeletes[pendingDeletes.length - 1] : i;
    const baseEnd =
      pendingDeletes.length > 0 ? pendingDeletes[0] + 1 : i;
    hunks.push({
      baseStart,
      baseEnd,
      lines: pendingInserts.slice().reverse(),
    });
    pendingDeletes = [];
    pendingInserts = [];
  };

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && base[i - 1] === other[j - 1]) {
      // Matching line — flush any pending hunk.
      flush();
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      // Insertion from `other`.
      pendingInserts.push(other[j - 1]);
      j--;
    } else {
      // Deletion from `base`.
      pendingDeletes.push(i - 1);
      i--;
    }
  }
  flush();

  // We built hunks while walking backward — reverse to get ascending
  // base-position order.
  return hunks.reverse();
}

/**
 * Apply a set of non-overlapping hunks to `baseLines` and return the
 * resulting line array. Hunks may come from either `ours` or `theirs`; the
 * caller has already confirmed they don't conflict. Hunks are sorted by
 * baseStart before application; ties (two pure insertions at the same base
 * position) are applied in input order.
 */
function applyHunks(baseLines: string[], hunks: Hunk[]): string[] {
  const sorted = [...hunks].sort((a, b) => {
    if (a.baseStart !== b.baseStart) return a.baseStart - b.baseStart;
    return a.baseEnd - b.baseEnd;
  });

  const out: string[] = [];
  let cursor = 0; // current position in base
  for (const h of sorted) {
    // Copy any untouched base lines up to this hunk.
    while (cursor < h.baseStart) {
      out.push(baseLines[cursor]);
      cursor++;
    }
    // Apply the hunk's replacement lines.
    out.push(...h.lines);
    // Skip over the base range the hunk replaces.
    cursor = Math.max(cursor, h.baseEnd);
  }
  // Copy any trailing base lines.
  while (cursor < baseLines.length) {
    out.push(baseLines[cursor]);
    cursor++;
  }
  return out;
}
