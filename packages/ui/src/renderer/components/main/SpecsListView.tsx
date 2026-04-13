import React, { useState } from "react";
import {
  FileText,
  ClipboardList,
  CheckCircle,
  Circle,
  ChevronRight,
  Layers,
  GitBranch,
  ListChecks,
  Play,
} from "lucide-react";

import type { SpecFolder, PipelineStage } from "@magenta/shared/models";
import { ScrollableText } from "../common/ScrollableText";
import { colors } from "../../utils/colors";

/* ═══════════════════════════════════════════════════════
   Spec high-level state derivation
   ═══════════════════════════════════════════════════════ */

type SpecState = "spec" | "planned" | "tasks" | "implementing" | "done";

function deriveSpecState(spec: SpecFolder): SpecState {
  const stageMap = new Map(spec.stages.map((s) => [s.name, s]));

  const tasks = stageMap.get("tasks");
  const impl = stageMap.get("implementation");
  const plan = stageMap.get("plan");

  // "Done" = all tasks completed OR implementation at 100%
  if (tasks?.metadata?.taskCount && tasks.metadata.taskCount > 0) {
    if (tasks.metadata.completedCount === tasks.metadata.taskCount) {
      return "done";
    }
  }
  if (impl?.metadata?.implementationProgress === 100) {
    return "done";
  }

  // "Implementing" = implementation stage is active (running/in-progress)
  // or some tasks are completed but not all
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

  // "Tasks" = tasks stage exists and isn't missing
  if (tasks && tasks.status !== "missing") {
    return "tasks";
  }

  // "Planned" = plan stage exists and isn't missing
  if (plan && plan.status !== "missing") {
    return "planned";
  }

  // Default = "spec" (early stage)
  return "spec";
}

/* ═══════════════════════════════════════════════════════
   State badge configs
   ═══════════════════════════════════════════════════════ */

const STATE_CONFIG: Record<
  SpecState,
  { label: string; bg: string; color: string; border: string; Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }> }
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

/* ═══════════════════════════════════════════════════════
   Progress stepper (Spec → Planned → Implemented)
   ═══════════════════════════════════════════════════════ */

const STEPS: SpecState[] = ["spec", "planned", "tasks", "implementing", "done"];

function ProgressStepper({ current }: { current: SpecState }): React.ReactElement {
  const currentIdx = STEPS.indexOf(current);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {STEPS.map((step, i) => {
        const isCompleted = i < currentIdx;
        const isCurrent = i === currentIdx;
        const isActive = i <= currentIdx;
        const cfg = STATE_CONFIG[step];
        const prevCfg = i > 0 ? STATE_CONFIG[STEPS[i - 1]] : cfg;

        return (
          <React.Fragment key={step}>
            {i > 0 && (
              <div
                style={{
                  width: 12,
                  height: 2,
                  borderRadius: 1,
                  background: isActive ? prevCfg.color : colors.border,
                  transition: "background 0.2s",
                }}
              />
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
                padding: isCurrent ? "2px 7px" : "2px 4px",
                borderRadius: 10,
                background: isCurrent ? cfg.bg : "transparent",
                border: isCurrent ? `1px solid ${cfg.border}` : "1px solid transparent",
                transition: "all 0.2s",
              }}
            >
              {isCompleted ? (
                <CheckCircle size={10} color={cfg.color} strokeWidth={2.5} />
              ) : isCurrent ? (
                <cfg.Icon size={10} color={cfg.color} strokeWidth={2.5} />
              ) : (
                <Circle size={10} color={colors.borderMuted} strokeWidth={2} />
              )}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: isCurrent ? 600 : 400,
                  color: isActive ? cfg.color : colors.borderStrong,
                }}
              >
                {cfg.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Spec card
   ═══════════════════════════════════════════════════════ */

function SpecCard({
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

  // Calculate overall progress
  const tasksStage = spec.stages.find((s) => s.name === "tasks");
  const taskCount = tasksStage?.metadata?.taskCount ?? 0;
  const completedCount = tasksStage?.metadata?.completedCount ?? 0;
  const progressPercent = taskCount > 0 ? Math.min(100, Math.round((completedCount / taskCount) * 100)) : 0;

  // Count approved stages


  return (
    <button
      type="button"
      onClick={() => onSelect(spec.path)}
      onDoubleClick={() => onOpen(spec.path)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        textAlign: "left",
        border: isSelected ? `1px solid ${colors.primary}` : `1px solid ${colors.border}`,
        borderRadius: 10,
        padding: "14px 16px",
        background: isSelected ? colors.bgPanelSoft : hovered ? colors.bgPanel : colors.bgSurface,
        cursor: "pointer",
        transition: "all 0.12s",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Header row: icon + name + state badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            borderRadius: 6,
            background: `${stateConfig.color}14`,
            flexShrink: 0,
          }}
        >
          <Layers size={16} color={stateConfig.color} strokeWidth={1.8} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ScrollableText
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: colors.textStrong,
              }}
            >
              {spec.name}
            </ScrollableText>
            {spec.branch && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "1px 7px",
                  borderRadius: 8,
                  fontSize: 10,
                  fontWeight: 600,
                  flexShrink: 0,
                  background: spec.isCurrentBranch ? colors.successSoft : colors.bgHover,
                  color: spec.isCurrentBranch ? colors.successText : colors.textMuted,
                  border: spec.isCurrentBranch ? `1px solid ${colors.successSoftBorder}` : `1px solid ${colors.border}`,
                }}
              >
                <GitBranch size={9} strokeWidth={2} />
                {spec.branch}
              </span>
            )}
          </div>
        </div>

        {/* State badge */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 10px",
            borderRadius: 12,
            background: stateConfig.bg,
            color: stateConfig.color,
            border: `1px solid ${stateConfig.border}`,
            fontSize: 11,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          <stateConfig.Icon size={12} strokeWidth={2} />
          {stateConfig.label}
        </span>

        <ChevronRight size={14} color={colors.borderStrong} strokeWidth={2} style={{ flexShrink: 0 }} />
      </div>

      {/* Progress stepper */}
      <ProgressStepper current={specState} />

      {/* Task progress bar (if tasks exist) */}
      {taskCount > 0 && (
        <div>
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
            <span>
              {completedCount}/{taskCount} ({progressPercent}%)
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
                background: progressPercent === 100 ? colors.success : colors.primary,
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   Main SpecsListView
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

  if (specs.length === 0) {
    return (
      <div style={{ padding: 24, color: colors.textTertiary, fontSize: 13, textAlign: "center" }}>
        <Layers size={32} color={colors.borderMuted} strokeWidth={1.5} style={{ marginBottom: 12 }} />
        <div>No specs found for this repository.</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>
          Create a spec folder under <code style={{ background: colors.bgCodeInline, padding: "1px 4px", borderRadius: 3 }}>specs/</code> to get started.
        </div>
      </div>
    );
  }

  // Group by state
  const grouped: Record<SpecState, SpecFolder[]> = { spec: [], planned: [], tasks: [], implementing: [], done: [] };
  for (const s of specs) {
    grouped[deriveSpecState(s)].push(s);
  }

  // Apply filter
  const filteredSpecs = filterState ? grouped[filterState] : specs;

  return (
    <div style={{ padding: 20 }}>
      {/* Summary filter bar */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 20,
          padding: "6px 8px",
          background: colors.bgPanel,
          borderRadius: 8,
          border: `1px solid ${colors.border}`,
        }}
      >
        {(STEPS as SpecState[]).map((state) => {
          const cfg = STATE_CONFIG[state];
          const count = grouped[state].length;
          const isActive = filterState === state;
          return (
            <button
              type="button"
              key={state}
              onClick={() => setFilterState(isActive ? null : state)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 10px",
                borderRadius: 6,
                border: isActive ? `1px solid ${cfg.border}` : "1px solid transparent",
                background: isActive ? cfg.bg : "transparent",
                cursor: count > 0 ? "pointer" : "default",
                opacity: count > 0 ? 1 : 0.4,
                pointerEvents: count > 0 ? "auto" : "none",
                transition: "all 0.15s",
              }}
            >
              <cfg.Icon size={13} color={isActive ? cfg.color : colors.textTertiary} strokeWidth={1.8} />
              <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? cfg.color : colors.textMuted }}>
                {count}
              </span>
              <span style={{ fontSize: 11, color: isActive ? cfg.color : colors.textTertiary }}>
                {cfg.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Spec cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filteredSpecs.map((spec) => (
          <SpecCard
            key={spec.id}
            spec={spec}
            isSelected={spec.path === selectedSpecPath}
            onSelect={onSelectSpec}
            onOpen={onOpenSpec}
          />
        ))}
      </div>
    </div>
  );
}
