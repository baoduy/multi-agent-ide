import React, { useState } from "react";
import {
  FileText,
  ClipboardList,
  CheckCircle,
  Circle,
  ChevronRight,
  Layers,
  GitBranch,
} from "lucide-react";

import type { SpecFolder, PipelineStage } from "@magenta/shared/models";
import type { StageStatus } from "@magenta/shared/constants";
import { stageStatusColor } from "../../utils/stageColors";

/* ═══════════════════════════════════════════════════════
   Spec high-level state derivation
   ═══════════════════════════════════════════════════════ */

type SpecState = "spec" | "planned" | "implemented";

function deriveSpecState(spec: SpecFolder): SpecState {
  const stageMap = new Map(spec.stages.map((s) => [s.name, s]));

  const tasks = stageMap.get("tasks");
  const impl = stageMap.get("implementation");

  // "Implemented" = tasks stage has all completed OR implementation has 100% progress
  if (tasks?.metadata?.taskCount && tasks.metadata.taskCount > 0) {
    if (tasks.metadata.completedCount === tasks.metadata.taskCount) {
      return "implemented";
    }
  }
  if (impl?.metadata?.implementationProgress === 100) {
    return "implemented";
  }

  // "Planned" = plan or tasks stage exists and isn't missing
  const plan = stageMap.get("plan");
  if (
    (plan && plan.status !== "missing") ||
    (tasks && tasks.status !== "missing")
  ) {
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
  { label: string; bg: string; color: string; Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }> }
> = {
  spec: {
    label: "Spec",
    bg: "#dbeafe",
    color: "#1e40af",
    Icon: FileText,
  },
  planned: {
    label: "Planned",
    bg: "#fef3c7",
    color: "#92400e",
    Icon: ClipboardList,
  },
  implemented: {
    label: "Implemented",
    bg: "#dcfce7",
    color: "#166534",
    Icon: CheckCircle,
  },
};

/* ═══════════════════════════════════════════════════════
   Stage status badge
   ═══════════════════════════════════════════════════════ */

function statusColor(status: StageStatus): { bg: string; color: string } {
  const c = stageStatusColor(status);
  return { bg: c.bg, color: c.fg };
}

/* ═══════════════════════════════════════════════════════
   Progress stepper (Spec → Planned → Implemented)
   ═══════════════════════════════════════════════════════ */

const STEPS: SpecState[] = ["spec", "planned", "implemented"];

function ProgressStepper({ current }: { current: SpecState }): React.ReactElement {
  const currentIdx = STEPS.indexOf(current);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {STEPS.map((step, i) => {
        const isActive = i <= currentIdx;
        const isCurrent = i === currentIdx;
        const cfg = STATE_CONFIG[step];

        return (
          <React.Fragment key={step}>
            {i > 0 && (
              <div
                style={{
                  width: 16,
                  height: 2,
                  borderRadius: 1,
                  background: i <= currentIdx ? cfg.color : "#e5e2da",
                  transition: "background 0.2s",
                }}
              />
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 10,
                background: isCurrent ? cfg.bg : "transparent",
                transition: "background 0.2s",
              }}
            >
              {isActive ? (
                <CheckCircle size={10} color={cfg.color} strokeWidth={2} />
              ) : (
                <Circle size={10} color="#d1cec6" strokeWidth={2} />
              )}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: isCurrent ? 600 : 400,
                  color: isActive ? cfg.color : "#b5b1a8",
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
  const approvedCount = spec.stages.filter((s) => s.status === "approved").length;

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
        border: isSelected ? "1px solid #C15F3C" : "1px solid #e5e2da",
        borderRadius: 10,
        padding: "14px 16px",
        background: isSelected ? "#faf5f2" : hovered ? "#f5f4ed" : "#faf9f5",
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
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#2c2c2c",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {spec.name}
            </span>
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
                  background: spec.isCurrentBranch ? "#dcfce7" : "#f0ede8",
                  color: spec.isCurrentBranch ? "#166534" : "#6b6560",
                  border: spec.isCurrentBranch ? "1px solid #bbf7d0" : "1px solid #e5e2da",
                }}
              >
                <GitBranch size={9} strokeWidth={2} />
                {spec.branch}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#9a958c", marginTop: 2 }}>
            {spec.stages.length} stages &middot; {spec.files.length} files
            {approvedCount > 0 && <> &middot; {approvedCount} approved</>}
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
            fontSize: 11,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          <stateConfig.Icon size={12} strokeWidth={2} />
          {stateConfig.label}
        </span>

        <ChevronRight size={14} color="#b5b1a8" strokeWidth={2} style={{ flexShrink: 0 }} />
      </div>

      {/* Progress stepper */}
      <ProgressStepper current={specState} />

      {/* Stage pills row */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {spec.stages.map((stage) => {
          const sc = statusColor(stage.status as StageStatus);
          return (
            <span
              key={stage.name}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 4,
                background: sc.bg,
                color: sc.color,
                fontSize: 10,
                fontWeight: 500,
              }}
            >
              {stage.status === "approved" && <CheckCircle size={9} strokeWidth={2} />}
              {stage.name}
            </span>
          );
        })}
      </div>

      {/* Task progress bar (if tasks exist) */}
      {taskCount > 0 && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: "#9a958c",
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
              background: "#e5e2da",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPercent}%`,
                borderRadius: 2,
                background: progressPercent === 100 ? "#16A34A" : "#C15F3C",
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
  if (specs.length === 0) {
    return (
      <div style={{ padding: 24, color: "#9a958c", fontSize: 13, textAlign: "center" }}>
        <Layers size={32} color="#d1cec6" strokeWidth={1.5} style={{ marginBottom: 12 }} />
        <div>No specs found for this repository.</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>
          Create a spec folder under <code style={{ background: "#eeece6", padding: "1px 4px", borderRadius: 3 }}>specs/</code> to get started.
        </div>
      </div>
    );
  }

  // Group by state
  const grouped: Record<SpecState, SpecFolder[]> = { spec: [], planned: [], implemented: [] };
  for (const s of specs) {
    grouped[deriveSpecState(s)].push(s);
  }

  return (
    <div style={{ padding: 20 }}>
      {/* Summary bar */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 20,
          padding: "10px 14px",
          background: "#f5f4ed",
          borderRadius: 8,
          border: "1px solid #e5e2da",
        }}
      >
        {(["spec", "planned", "implemented"] as SpecState[]).map((state) => {
          const cfg = STATE_CONFIG[state];
          return (
            <div key={state} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <cfg.Icon size={14} color={cfg.color} strokeWidth={1.8} />
              <span style={{ fontSize: 12, fontWeight: 600, color: cfg.color }}>
                {grouped[state].length}
              </span>
              <span style={{ fontSize: 11, color: "#9a958c" }}>{cfg.label}</span>
            </div>
          );
        })}
      </div>

      {/* Spec cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {specs.map((spec) => (
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
