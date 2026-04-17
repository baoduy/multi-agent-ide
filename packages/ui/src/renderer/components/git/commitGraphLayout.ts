import type { CommitSummary } from "@magenta/shared/ipc";

/**
 * Per-row layout info for rendering a multi-lane git graph.
 *
 * `lanesBefore` / `lanesAfter` hold the sha each lane is waiting to see, or null
 * for an empty slot. A lane's *index* is its horizontal column in the rail.
 * A lane that appears at the same index with the same sha in both snapshots is
 * a branch that passes straight through the row as a vertical line.
 */
export type GraphRow = {
  commit: CommitSummary;
  /** Column index (0-based) where this commit's dot sits. */
  laneIdx: number;
  /** Lane snapshot entering the top of this row (pending shas from above). */
  lanesBefore: (string | null)[];
  /** Lane snapshot leaving the bottom of this row (pending shas going down). */
  lanesAfter: (string | null)[];
};

/**
 * Compute a multi-lane graph layout for a commit list.
 *
 * The input must already be sorted newest → oldest (matches `git log` output).
 * The algorithm assigns each commit a lane based on which pending branch
 * tip (if any) was waiting for its sha, then advances the active lanes to
 * track its parents. Merge commits open additional lanes.
 */
export function layoutCommitGraph(commits: CommitSummary[]): GraphRow[] {
  const rows: GraphRow[] = [];
  let lanes: (string | null)[] = [];

  for (const commit of commits) {
    // Find this commit's lane — either an existing pending slot, or a new one.
    let laneIdx = lanes.indexOf(commit.sha);
    if (laneIdx === -1) {
      laneIdx = lanes.indexOf(null);
      if (laneIdx === -1) {
        laneIdx = lanes.length;
        lanes.push(null);
      }
    }

    const lanesBefore = [...lanes];

    // Advance: this commit's lane now points at its first parent; extra parents
    // (merges) open new lanes or reuse empty ones.
    const next = [...lanes];
    next[laneIdx] = null;

    const [firstParent, ...otherParents] = commit.parents;

    if (firstParent) {
      // First parent stays on the current lane unless that sha is already
      // tracked elsewhere (two commits pointing at the same parent) — in that
      // case we dedupe later.
      next[laneIdx] = firstParent;
    }

    for (const parent of otherParents) {
      let slot = next.findIndex((s) => s === null);
      if (slot === -1) {
        slot = next.length;
        next.push(null);
      }
      next[slot] = parent;
    }

    // Dedupe: if the same parent sha ended up in multiple lanes, keep only the
    // leftmost — subsequent lanes collapse into it when we encounter the parent.
    const seen = new Set<string>();
    for (let i = 0; i < next.length; i++) {
      const v = next[i];
      if (v && seen.has(v)) next[i] = null;
      else if (v) seen.add(v);
    }

    // Trim trailing nulls so the rail doesn't grow unbounded.
    while (next.length > 0 && next[next.length - 1] === null) next.pop();

    rows.push({
      commit,
      laneIdx,
      lanesBefore,
      lanesAfter: [...next],
    });

    lanes = next;
  }

  return rows;
}

/**
 * Stable colour for a given lane index. Rotates through a small palette so
 * the same lane always reads as the same colour while it's active.
 */
export const LANE_COLORS = [
  "#e67e22", // orange (main trunk)
  "#e74c3c", // red
  "#2ecc71", // green
  "#3498db", // blue
  "#9b59b6", // purple
  "#f1c40f", // yellow
  "#1abc9c", // teal
  "#e84393", // pink
] as const;

export function laneColor(index: number): string {
  return LANE_COLORS[index % LANE_COLORS.length]!;
}
