import React, { useState, useMemo } from "react";
import {
  FileText,
  ClipboardList,
  CheckCircle,
  Circle,
  Layers,
  GitBranch,
  ListChecks,
  Clock,
} from "lucide-react";

import type { SpecFolder } from "@magenta/shared/models";
import { colors } from "../../utils/colors";
import { Tag } from "../common/Tag";
import { useSortedSpecs } from "../../hooks/useSortedSpecs";

/* ═══════════════════════════════════════════════════════
   Spec high-level state derivation
   ═══════════════════════════════════════════════════════ */

type SpecState = "spec" | "planned" | "tasks" | "implementing" | "done";

function deriveSpecState(spec: SpecFolder): SpecState {
  const stageMap = new Map(spec.stages.map((s) => [s.name, s]));

  const tasks = stageMap.get("tasks");
  const impl = stageMap.get("implementation");
  const plan = stageMap.get("plan");

  if (tasks?.metadata?.taskCount && tasks.metadata.taskCount > 0) {
    if (tasks.metadata.completedCount === tasks.metadata.taskCount) {
      return "done";
    }
  }
  if (impl?.metadata?.implementationProgress === 100) {
    return "done";
  }

  if (
    impl &&
    (impl.status === "running" || impl.status === "in-progress")
  ) {
    return "implementing";
  }
  if (
    tasks?.metadata?.taskCount &&
    tasks.metadata.taskCount > 0 &&
    tasks.metadata.completedCount !== undefined &&
    tasks.metadata.completedCount > 0 &&
    tasks.metadata.completedCount < tasks.metadata.taskCount
  ) {
    return "implementing";
  }

  if (tasks && tasks.status !== "missing") {
    return "tasks";
  }

  if (plan && plan.status !== "missing") {
    return "planned";
  }

  return "spec";
}

/* ═══════════════════════════════════════════════════════
   State badge configs
   ═══════════════════════════════════════════════════════ */

const STATE_CONFIG: Record<
  SpecState,
  {
    label: string;
    bg: string;
    color: string;
    border: string;
    Icon: React.ComponentType<{
      size?: number;
      color?: string;
      strokeWidth?: number;
    }>;
  }
> = {
  spec: {
    label: "Spec",
    bg: colors.infoSoft,
    color: colors.infoText,
    border: colors.infoBorder,
    Icon: FileText,
  },
  planned: {
    label: "Planned",
    bg: colors.warningSoft,
    color: colors.warningTextStrong,
    border: colors.warningBorder,
    Icon: ClipboardList,
  },
  tasks: {
    label: "Tasks",
    bg: colors.warningSoft,
    color: colors.warningTextDeep,
    border: colors.warningBorderSoft,
    Icon: ListChecks,
  },
  implementing: {
    label: "In Progress",
    bg: colors.progressSoft,
    color: colors.progressText,
    border: colors.progressBorder,
    Icon: Circle,
  },
  done: {
    label: "Done",
    bg: colors.successSoft,
    color: colors.successText,
    border: colors.successSoftBorder,
    Icon: CheckCircle,
  },
};

const STEPS: SpecState[] = [
  "spec",
  "planned",
  "tasks",
  "implementing",
  "done",
];

/* ═══════════════════════════════════════════════════════
   Relative time formatter
   ═══════════════════════════════════════════════════════ */

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/* ═══════════════════════════════════════════════════════
   Compact progress stepper (fits inside sticker)
   ═══════════════════════════════════════════════════════ */

function CompactStepper({
  current,
}: {
  current: SpecState;
}): React.ReactElement {
  const idx = STEPS.indexOf(current);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      {STEPS.map((step, i) => {
        const isCompleted = i < idx;
        const isCurrent = i === idx;
        const cfg = STATE_CONFIG[step];

        return (
          <React.Fragment key={step}>
            {i > 0 && (
              <div
                style={{
                  width: 8,
                  height: 2,
                  borderRadius: 1,
                  background: i <= idx ? cfg.color : colors.border,
                  transition: "background 0.2s",
                }}
              />
            )}
            <div
              title={cfg.label}
              style={{
                width: isCurrent ? "auto" : 8,
                height: isCurrent ? "auto" : 8,
                borderRadius: isCurrent ? 10 : 4,
                padding: isCurrent ? "3px 8px" : 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: isCompleted
                  ? cfg.color
                  : isCurrent
                    ? cfg.bg
                    : colors.bgMuted,
                border: isCurrent
                  ? `1.5px solid ${cfg.border}`
                  : isCompleted
                    ? "none"
                    : `1.5px solid ${colors.border}`,
                transition: "all 0.2s",
              }}
            >
              {isCurrent && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: cfg.color,
                    whiteSpace: "nowrap",
                    lineHeight: 1,
                  }}
                >
                  {cfg.label}
                </span>
              )}
              {isCompleted && (
                <CheckCircle
                  size={6}
                  color={colors.bgSurface}
                  strokeWidth={3}
                />
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Spec sticker card (fixed-width, flex-wrap friendly)
   ═══════════════════════════════════════════════════════ */

const STICKER_WIDTH = 280;

const SpecSticker = React.memo(function SpecSticker({
  spec,
  isSelected,
  onSelect,
  onOpen,
}: {
  spec: SpecFolder;
  isSelected: boolean;
  onSelect: (specPath: string) => void;
  onOpen: (specPath: string) => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const specState = deriveSpecState(spec);
  const stateConfig = STATE_CONFIG[specState];

  const tasksStage = spec.stages.find((s) => s.name === "tasks");
  const taskCount = tasksStage?.metadata?.taskCount ?? 0;
  const completedCount = tasksStage?.metadata?.completedCount ?? 0;
  const progressPercent =
    taskCount > 0
      ? Math.min(100, Math.round((completedCount / taskCount) * 100))
      : 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(spec.path)}
      onDoubleClick={() => onOpen(spec.path)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: STICKER_WIDTH,
        minHeight: 156,
        textAlign: "left",
        border: isSelected
          ? `2px solid ${colors.warningBorder}`
          : `1px solid ${hovered ? colors.borderStrong : colors.border}`,
        borderRadius: 14,
        padding: isSelected ? 15 : 16,
        background: isSelected
          ? colors.warningSoft
          : hovered
            ? colors.bgPanel
            : colors.bgSurface,
        cursor: "pointer",
        transition: "all 0.15s ease",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        boxShadow: hovered
          ? colors.shadowSoft
          : "none",
        transform: hovered ? "translateY(-1px)" : "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Top accent bar — amber when selected, hidden otherwise */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: colors.warningBorder,
          opacity: isSelected ? 1 : 0,
          borderRadius: "14px 14px 0 0",
          transition: "opacity 0.15s ease",
        }}
      />

      {/* Header: name + state badge */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
          marginTop: 2,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 650,
              color: colors.textStrong,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              lineHeight: "1.35",
            }}
          >
            {spec.name}
          </div>
        </div>
        <Tag
          size="md"
          bg={stateConfig.bg}
          color={stateConfig.color}
          borderColor={stateConfig.border}
          borderRadius={10}
          fontWeight={700}
          icon={<stateConfig.Icon size={10} strokeWidth={2.5} />}
        >
          {stateConfig.label}
        </Tag>
      </div>

      {/* Branch + creation date row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        {spec.branch && (
          <Tag
            tone={spec.isCurrentBranch ? "success" : "neutral"}
            // Non-current branches borrow the neutral tone but still want a
            // visible outline — the neutral palette has no border, so pass
            // the default divider colour explicitly.
            borderColor={
              spec.isCurrentBranch ? undefined : colors.border
            }
            icon={<GitBranch size={9} strokeWidth={2.5} />}
          >
            {spec.branch}
          </Tag>
        )}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            fontSize: 10,
            color: colors.textTertiary,
            fontWeight: 500,
          }}
        >
          <Clock size={9} strokeWidth={2} />
          {timeAgo(spec.createdAt)}
        </span>
      </div>

      {/* Compact stepper */}
      <CompactStepper current={specState} />

      {/* Task progress bar (if tasks exist) */}
      {taskCount > 0 && (
        <div style={{ marginTop: "auto" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: colors.textTertiary,
              marginBottom: 4,
            }}
          >
            <span>Tasks</span>
            <span
              style={{
                fontWeight: 600,
                color:
                  progressPercent === 100
                    ? colors.successText
                    : colors.textMuted,
              }}
            >
              {completedCount}/{taskCount}
            </span>
          </div>
          <div
            style={{
              height: 4,
              borderRadius: 2,
              background: colors.border,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPercent}%`,
                borderRadius: 2,
                background:
                  progressPercent === 100 ? colors.success : colors.primary,
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>
      )}
    </button>
  );
});

/* ═══════════════════════════════════════════════════════
   Main SpecsListView — flex-wrap sticker grid
   ═══════════════════════════════════════════════════════ */

type SpecsListViewProps = {
  specs: SpecFolder[];
  selectedSpecPath: string | null;
  onSelectSpec: (specPath: string) => void;
  onOpenSpec: (specPath: string) => void;
};

export function SpecsListView({
  specs,
  selectedSpecPath,
  onSelectSpec,
  onOpenSpec,
}: SpecsListViewProps): React.ReactElement {
  const [filterState, setFilterState] = useState<SpecState | null>(null);

  // Sort by createdAt descending (newest first)
  const sortedSpecs = useSortedSpecs(specs);

  // Group by state for filter counts
  const grouped = useMemo(() => {
    const g: Record<SpecState, SpecFolder[]> = {
      spec: [],
      planned: [],
      tasks: [],
      implementing: [],
      done: [],
    };
    for (const s of sortedSpecs) {
      g[deriveSpecState(s)].push(s);
    }
    return g;
  }, [sortedSpecs]);

  // Apply filter
  const filteredSpecs = filterState ? grouped[filterState] : sortedSpecs;

  if (specs.length === 0) {
    return (
      <div
        style={{
          padding: 12,
          color: colors.textTertiary,
          fontSize: 11,
          textAlign: "center",
        }}
      >
        <Layers
          size={24}
          color={colors.borderMuted}
          strokeWidth={1.5}
          style={{ marginBottom: 8 }}
        />
        <div>No specs found for this repository.</div>
        <div style={{ fontSize: 10, marginTop: 4 }}>
          Create a spec folder under{" "}
          <code
            style={{
              background: colors.bgCodeInline,
              padding: "1px 3px",
              borderRadius: 3,
            }}
          >
            specs/
          </code>{" "}
          to get started.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 10 }}>
      {/* Summary filter bar */}
      <div
        style={{
          display: "flex",
          gap: 3,
          marginBottom: 10,
          padding: "4px 6px",
          background: colors.bgPanel,
          borderRadius: 6,
          border: `1px solid ${colors.border}`,
          flexWrap: "wrap",
        }}
      >
        {STEPS.map((state) => {
          const cfg = STATE_CONFIG[state];
          const count = grouped[state].length;
          const isActive = filterState === state;
          return (
            <button
              type="button"
              key={state}
              onClick={() =>
                setFilterState(isActive ? null : state)
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 4,
                border: isActive
                  ? `1px solid ${cfg.border}`
                  : "1px solid transparent",
                background: isActive ? cfg.bg : "transparent",
                cursor: count > 0 ? "pointer" : "default",
                opacity: count > 0 ? 1 : 0.4,
                pointerEvents: count > 0 ? "auto" : "none",
                transition: "all 0.15s",
              }}
            >
              <cfg.Icon
                size={11}
                color={isActive ? cfg.color : colors.textTertiary}
                strokeWidth={1.8}
              />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: isActive ? cfg.color : colors.textMuted,
                }}
              >
                {count}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: isActive ? cfg.color : colors.textTertiary,
                }}
              >
                {cfg.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Flex-wrap sticker grid */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "stretch",
          alignContent: "flex-start",
        }}
      >
        {filteredSpecs.map((spec) => (
          <SpecSticker
            key={spec.id}
            spec={spec}
            isSelected={spec.path === selectedSpecPath}
            onSelect={onSelectSpec}
            onOpen={onOpenSpec}
          />
        ))}
        {filteredSpecs.length === 0 && (
          <div
            style={{
              width: "100%",
              textAlign: "center",
              padding: 24,
              color: colors.textTertiary,
              fontSize: 11,
            }}
          >
            No specs match this filter.
          </div>
        )}
      </div>
    </div>
  );
}
