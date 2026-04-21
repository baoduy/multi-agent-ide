import React, { useEffect, useMemo } from "react";
import { FileDiff, GitMerge, Loader2, RefreshCw } from "lucide-react";

import type { CommitSummary } from "@magenta/shared/ipc";
import { colors } from "../../utils/colors";
import { InlineLoadingRow } from "../common/InlineLoadingRow";
import { ScrollableText } from "../common/ScrollableText";
import { useGitHistoryStore, historyKey } from "../../store/gitHistoryStore";
import { layoutCommitGraph, laneColor, type GraphRow } from "./commitGraphLayout";

export type SelectedRow =
  | { kind: "working" }
  | { kind: "commit"; sha: string };

type CommitGraphListProps = {
  repoPath: string;
  /** Number of uncommitted files — shown next to the "Working tree" pseudo-row. */
  workingTreeCount: number | null;
  selected: SelectedRow;
  onSelect: (sel: SelectedRow) => void;
};

const ROW_HEIGHT = 44;
const LANE_WIDTH = 14;
const LEFT_PAD = 12;

const spin: React.CSSProperties = { animation: "spin 1s linear infinite" };

function relativeTime(unixSec: number): string {
  const ms = Date.now() - unixSec * 1000;
  if (ms < 60_000) return "now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function CommitGraphList({
  repoPath,
  workingTreeCount,
  selected,
  onSelect,
}: CommitGraphListProps): React.ReactElement {
  const query = useMemo(() => ({ repoPath }), [repoPath]);
  const entries = useGitHistoryStore((s) => s.entries);
  const loadFirstPage = useGitHistoryStore((s) => s.loadFirstPage);
  const loadMore = useGitHistoryStore((s) => s.loadMore);
  const refresh = useGitHistoryStore((s) => s.refresh);

  useEffect(() => {
    void loadFirstPage(query);
  }, [query, loadFirstPage]);

  const entry = entries.get(historyKey(query));
  const commits = entry?.commits ?? [];

  const rows = useMemo(() => layoutCommitGraph(commits), [commits]);

  // Number of lanes we need to render for the rail column. Include one slot for
  // the uncommitted row's single orange dot.
  const maxLanes = useMemo(() => {
    let max = 1;
    for (const r of rows) {
      max = Math.max(max, r.lanesBefore.length, r.lanesAfter.length, r.laneIdx + 1);
    }
    return max;
  }, [rows]);

  const railWidth = LEFT_PAD + maxLanes * LANE_WIDTH + 6;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 8px",
          borderBottom: `1px solid ${colors.borderLight}`,
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: colors.textTertiary,
          flexShrink: 0,
        }}
      >
        <span>History</span>
        <button
          type="button"
          onClick={() => void refresh(query)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 6px",
            fontSize: 10,
            color: colors.textSecondary,
            background: "transparent",
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          {entry?.isLoading ? <Loader2 size={10} style={spin} /> : <RefreshCw size={10} strokeWidth={2} />}
          Reload
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {/* Working tree pseudo-row — always the first entry. */}
        <WorkingTreeRow
          fileCount={workingTreeCount}
          isSelected={selected.kind === "working"}
          onClick={() => onSelect({ kind: "working" })}
          railWidth={railWidth}
          firstLaneColor={laneColor(0)}
          connectsBelow={rows.length > 0}
        />

        {!entry || (entry.isLoading && rows.length === 0) ? (
          <InlineLoadingRow label="Loading history…" />
        ) : entry.error ? (
          <div style={{ padding: "4px 8px", fontSize: 11, color: colors.error }}>{entry.error}</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: "4px 8px", fontSize: 11, color: colors.textTertiary }}>
            No commits.
          </div>
        ) : (
          rows.map((row, idx) => (
            <CommitRowView
              key={row.commit.sha}
              row={row}
              isFirstRow={idx === 0}
              isLastRow={idx === rows.length - 1}
              railWidth={railWidth}
              isSelected={selected.kind === "commit" && selected.sha === row.commit.sha}
              onClick={() => onSelect({ kind: "commit", sha: row.commit.sha })}
            />
          ))
        )}

        {entry?.hasMore && (
          <button
            type="button"
            onClick={() => void loadMore(query)}
            disabled={entry.isLoading}
            style={{
              display: "block",
              margin: "8px auto",
              padding: "4px 10px",
              fontSize: 11,
              color: colors.primary,
              fontWeight: 600,
              background: "transparent",
              border: `1px dashed ${colors.border}`,
              borderRadius: 4,
              cursor: entry.isLoading ? "default" : "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            {entry.isLoading ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function WorkingTreeRow({
  fileCount,
  isSelected,
  onClick,
  railWidth,
  firstLaneColor,
  connectsBelow,
}: {
  fileCount: number | null;
  isSelected: boolean;
  onClick: () => void;
  railWidth: number;
  firstLaneColor: string;
  connectsBelow: boolean;
}): React.ReactElement {
  const [hover, setHover] = React.useState(false);
  const dotX = LEFT_PAD + LANE_WIDTH / 2;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: ROW_HEIGHT,
        cursor: "pointer",
        background: isSelected ? colors.bgPanelSoft : hover ? colors.bgHover : "transparent",
        borderLeft: isSelected ? `2px solid ${colors.primary}` : "2px solid transparent",
      }}
    >
      <svg
        width={railWidth}
        height={ROW_HEIGHT}
        style={{ flexShrink: 0, display: "block" }}
        aria-hidden
      >
        {connectsBelow && (
          <line
            x1={dotX}
            y1={ROW_HEIGHT / 2}
            x2={dotX}
            y2={ROW_HEIGHT}
            stroke={firstLaneColor}
            strokeWidth={2}
          />
        )}
        <circle cx={dotX} cy={ROW_HEIGHT / 2} r={5} fill={firstLaneColor} stroke={colors.bgSurface} strokeWidth={1.5} />
        <circle cx={dotX} cy={ROW_HEIGHT / 2} r={2} fill={colors.bgSurface} />
      </svg>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1, padding: "4px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: colors.text }}>
            Uncommitted changes
          </span>
          {fileCount !== null && (
            <span
              style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 3,
                background: fileCount > 0 ? colors.warningSoft : colors.bgMuted,
                color: fileCount > 0 ? colors.warningText : colors.textTertiary,
                fontWeight: 600,
              }}
            >
              {fileCount} {fileCount === 1 ? "file" : "files"}
            </span>
          )}
        </div>
        <span style={{ fontSize: 10, color: colors.textTertiary }}>
          Working tree · click to review before committing
        </span>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function CommitRowView({
  row,
  isFirstRow,
  isLastRow,
  railWidth,
  isSelected,
  onClick,
}: {
  row: GraphRow;
  isFirstRow: boolean;
  isLastRow: boolean;
  railWidth: number;
  isSelected: boolean;
  onClick: () => void;
}): React.ReactElement {
  const [hover, setHover] = React.useState(false);
  const { commit, laneIdx, lanesBefore, lanesAfter } = row;

  const isMerge = commit.parents.length > 1;

  const dotX = LEFT_PAD + laneIdx * LANE_WIDTH + LANE_WIDTH / 2;
  const midY = ROW_HEIGHT / 2;

  // ── Build SVG path segments ────────────────────────────────────────────
  const segments: React.ReactElement[] = [];
  let key = 0;

  // Straight vertical lines for lanes that pass through unchanged from top to bottom.
  for (let i = 0; i < Math.max(lanesBefore.length, lanesAfter.length); i++) {
    const top = lanesBefore[i];
    const bot = lanesAfter[i];
    if (top && bot && top === bot) {
      const x = LEFT_PAD + i * LANE_WIDTH + LANE_WIDTH / 2;
      segments.push(
        <line key={`v-${key++}`} x1={x} y1={0} x2={x} y2={ROW_HEIGHT} stroke={laneColor(i)} strokeWidth={2} />
      );
    }
  }

  // Incoming segment from the top of this row to the dot (lane i where sha === commit.sha).
  if (!isFirstRow) {
    for (let i = 0; i < lanesBefore.length; i++) {
      if (lanesBefore[i] === commit.sha) {
        const x = LEFT_PAD + i * LANE_WIDTH + LANE_WIDTH / 2;
        if (i === laneIdx) {
          segments.push(
            <line key={`in-${key++}`} x1={x} y1={0} x2={x} y2={midY} stroke={laneColor(laneIdx)} strokeWidth={2} />
          );
        } else {
          // Branch curving into this lane.
          segments.push(
            <path
              key={`in-${key++}`}
              d={`M ${x},0 L ${x},${midY - 6} Q ${x},${midY} ${x + Math.sign(dotX - x) * 6},${midY} L ${dotX},${midY}`}
              stroke={laneColor(i)}
              strokeWidth={2}
              fill="none"
            />
          );
        }
      }
    }
  }

  // Outgoing segments from the dot to parents' lanes at the bottom.
  if (!isLastRow) {
    for (const parent of commit.parents) {
      const outLane = lanesAfter.indexOf(parent);
      if (outLane === -1) continue;
      const x = LEFT_PAD + outLane * LANE_WIDTH + LANE_WIDTH / 2;
      if (outLane === laneIdx) {
        segments.push(
          <line key={`out-${key++}`} x1={dotX} y1={midY} x2={x} y2={ROW_HEIGHT} stroke={laneColor(outLane)} strokeWidth={2} />
        );
      } else {
        // Merge branch curving out of this lane.
        segments.push(
          <path
            key={`out-${key++}`}
            d={`M ${dotX},${midY} L ${x - Math.sign(x - dotX) * 6},${midY} Q ${x},${midY} ${x},${midY + 6} L ${x},${ROW_HEIGHT}`}
            stroke={laneColor(outLane)}
            strokeWidth={2}
            fill="none"
          />
        );
      }
    }
  }

  // The commit dot itself — hollow for merges.
  segments.push(
    <circle
      key={`dot-${key++}`}
      cx={dotX}
      cy={midY}
      r={5}
      fill={isMerge ? colors.bgSurface : laneColor(laneIdx)}
      stroke={laneColor(laneIdx)}
      strokeWidth={2}
    />
  );
  if (isMerge) {
    segments.push(
      <circle key={`dot-inner-${key++}`} cx={dotX} cy={midY} r={2.2} fill={laneColor(laneIdx)} />
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "stretch",
        minHeight: ROW_HEIGHT,
        cursor: "pointer",
        background: isSelected ? colors.bgPanelSoft : hover ? colors.bgHover : "transparent",
        borderLeft: isSelected ? `2px solid ${colors.primary}` : "2px solid transparent",
      }}
    >
      <svg
        width={railWidth}
        height={ROW_HEIGHT}
        style={{ flexShrink: 0, display: "block" }}
        aria-hidden
      >
        {segments}
      </svg>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1, padding: "4px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {isMerge && <GitMerge size={11} color={colors.textTertiary} strokeWidth={2} style={{ flexShrink: 0 }} />}
          {commit.refs.map((ref) => (
            <RefChip key={ref} ref_={ref} />
          ))}
          <ScrollableText
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: colors.text,
              flex: 1,
              minWidth: 0,
            }}
            title={commit.subject}
          >
            {commit.subject}
          </ScrollableText>
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            fontSize: 10,
            color: colors.textTertiary,
            alignItems: "center",
          }}
        >
          <span
            title={commit.authorName}
            style={{
              fontSize: 9,
              fontWeight: 600,
              padding: "1px 4px",
              background: colors.bgMuted,
              borderRadius: 3,
              color: colors.textSecondary,
            }}
          >
            {authorInitials(commit.authorName)}
          </span>
          <ScrollableText style={{ maxWidth: 140 }}>
            {commit.authorName}
          </ScrollableText>
          <span>· {relativeTime(commit.timestamp)}</span>
          <span style={{ fontFamily: "var(--font-sans)", color: colors.textTertiary, marginLeft: "auto" }}>
            {commit.shortSha}
          </span>
        </div>
      </div>
    </div>
  );
}

function RefChip({ ref_ }: { ref_: string }): React.ReactElement {
  const isTag = /^tag: /.test(ref_);
  const isRemote = /^origin\//.test(ref_) || ref_.includes("/");
  const label = ref_.replace(/^tag: /, "");

  const bg = isTag ? colors.infoSoft : isRemote ? colors.bgMuted : colors.branchBg;
  const fg = isTag ? colors.infoText : isRemote ? colors.textSecondary : colors.branchFg;
  const Icon = isTag ? FileDiff : null; // keep simple; a dedicated tag icon could be added later

  return (
    <ScrollableText
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        fontSize: 9,
        fontFamily: "var(--font-sans)",
        fontWeight: 600,
        color: fg,
        background: bg,
        border: `1px solid ${colors.border}`,
        padding: "1px 5px",
        borderRadius: 3,
        flexShrink: 0,
        maxWidth: 140,
      }}
      title={ref_}
    >
      {Icon && <Icon size={8} strokeWidth={2} />}
      {label}
    </ScrollableText>
  );
}
