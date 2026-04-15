import { useState, useMemo } from "react";

/* ─── Mock data matching your real SpecFolder shape ─── */
const MOCK_SPECS = [
  {
    id: "1", name: "001-remove-channel-amount-fields", branch: "dev", isCurrentBranch: false,
    createdAt: Date.now() - 86400000 * 14,
    stages: [
      { name: "spec", status: "approved" }, { name: "plan", status: "approved" },
      { name: "tasks", status: "approved", metadata: { taskCount: 6, completedCount: 3 } },
      { name: "implementation", status: "in-progress", metadata: { implementationProgress: 50 } },
    ],
  },
  {
    id: "2", name: "002-restructure-static-data-entities", branch: "dev", isCurrentBranch: false,
    createdAt: Date.now() - 86400000 * 10,
    stages: [
      { name: "spec", status: "approved" }, { name: "plan", status: "approved" },
      { name: "tasks", status: "draft", metadata: { taskCount: 4, completedCount: 0 } },
      { name: "implementation", status: "missing" },
    ],
  },
  {
    id: "3", name: "007-merchant-onboarding-flow", branch: "dev", isCurrentBranch: false,
    createdAt: Date.now() - 86400000 * 8,
    stages: [
      { name: "spec", status: "approved" }, { name: "plan", status: "approved" },
      { name: "tasks", status: "draft", metadata: { taskCount: 8, completedCount: 0 } },
      { name: "implementation", status: "missing" },
    ],
  },
  {
    id: "4", name: "008-bdd-test-setup", branch: "dev", isCurrentBranch: false,
    createdAt: Date.now() - 86400000 * 5,
    stages: [
      { name: "spec", status: "draft" }, { name: "plan", status: "missing" },
      { name: "tasks", status: "missing" }, { name: "implementation", status: "missing" },
    ],
  },
  {
    id: "5", name: "009-bdd-charge-tests", branch: "dev", isCurrentBranch: false,
    createdAt: Date.now() - 86400000 * 4,
    stages: [
      { name: "spec", status: "approved" }, { name: "plan", status: "approved" },
      { name: "tasks", status: "draft", metadata: { taskCount: 5, completedCount: 0 } },
      { name: "implementation", status: "missing" },
    ],
  },
  {
    id: "6", name: "010-fee-effective-dates-approval", branch: "dev", isCurrentBranch: false,
    createdAt: Date.now() - 86400000 * 3,
    stages: [
      { name: "spec", status: "approved" }, { name: "plan", status: "approved" },
      { name: "tasks", status: "approved", metadata: { taskCount: 7, completedCount: 2 } },
      { name: "implementation", status: "in-progress", metadata: { implementationProgress: 28 } },
    ],
  },
  {
    id: "7", name: "012-merchant-submit-review-flow", branch: "dev", isCurrentBranch: true,
    createdAt: Date.now() - 86400000 * 1,
    stages: [
      { name: "spec", status: "approved" }, { name: "plan", status: "approved" },
      { name: "tasks", status: "approved", metadata: { taskCount: 10, completedCount: 4 } },
      { name: "implementation", status: "in-progress", metadata: { implementationProgress: 40 } },
    ],
  },
  {
    id: "8", name: "013-bdd-test-migration", branch: "dev", isCurrentBranch: false,
    createdAt: Date.now() - 86400000 * 0.5,
    stages: [
      { name: "spec", status: "approved" }, { name: "plan", status: "approved" },
      { name: "tasks", status: "approved", metadata: { taskCount: 3, completedCount: 1 } },
      { name: "implementation", status: "in-progress", metadata: { implementationProgress: 33 } },
    ],
  },
  {
    id: "9", name: "014-payment-gateway-v2", branch: "dev", isCurrentBranch: false,
    createdAt: Date.now() - 86400000 * 20,
    stages: [
      { name: "spec", status: "approved" }, { name: "plan", status: "approved" },
      { name: "tasks", status: "approved", metadata: { taskCount: 12, completedCount: 12 } },
      { name: "implementation", status: "done", metadata: { implementationProgress: 100 } },
    ],
  },
];

/* ─── Derive spec state (same logic as your codebase) ─── */
function deriveSpecState(spec) {
  const stageMap = new Map(spec.stages.map((s) => [s.name, s]));
  const tasks = stageMap.get("tasks");
  const impl = stageMap.get("implementation");
  const plan = stageMap.get("plan");

  if (tasks?.metadata?.taskCount > 0 && tasks.metadata.completedCount === tasks.metadata.taskCount) return "done";
  if (impl?.metadata?.implementationProgress === 100) return "done";
  if (impl && (impl.status === "running" || impl.status === "in-progress")) return "implementing";
  if (tasks?.metadata?.taskCount > 0 && tasks.metadata.completedCount > 0 && tasks.metadata.completedCount < tasks.metadata.taskCount) return "implementing";
  if (tasks && tasks.status !== "missing") return "tasks";
  if (plan && plan.status !== "missing") return "planned";
  return "spec";
}

/* ─── State configs ─── */
const STATE_CONFIG = {
  spec:         { label: "Spec",        bg: "#eff6ff", color: "#3b82f6", border: "#bfdbfe", ring: "#3b82f620" },
  planned:      { label: "Planned",     bg: "#fefce8", color: "#ca8a04", border: "#fde68a", ring: "#ca8a0420" },
  tasks:        { label: "Tasks",       bg: "#fefce8", color: "#b45309", border: "#fcd34d", ring: "#b4530920" },
  implementing: { label: "In Progress", bg: "#fff7ed", color: "#ea580c", border: "#fed7aa", ring: "#ea580c20" },
  done:         { label: "Done",        bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0", ring: "#16a34a20" },
};

const STEPS = ["spec", "planned", "tasks", "implementing", "done"];

/* ─── Relative time formatter ─── */
function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ─── Mini progress stepper (compact for card) ─── */
function CompactStepper({ current }) {
  const idx = STEPS.indexOf(current);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      {STEPS.map((step, i) => {
        const cfg = STATE_CONFIG[step];
        const isCompleted = i < idx;
        const isCurrent = i === idx;
        return (
          <div key={step} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            {i > 0 && (
              <div style={{
                width: 8, height: 2, borderRadius: 1,
                background: i <= idx ? cfg.color : "#e5e7eb",
              }} />
            )}
            <div
              title={cfg.label}
              style={{
                width: isCurrent ? "auto" : 8,
                height: 8,
                borderRadius: isCurrent ? 10 : 4,
                padding: isCurrent ? "0 6px" : 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: isCompleted ? cfg.color : isCurrent ? cfg.bg : "#f3f4f6",
                border: isCurrent ? `1.5px solid ${cfg.border}` : isCompleted ? "none" : "1.5px solid #e5e7eb",
                transition: "all 0.2s",
              }}
            >
              {isCurrent && (
                <span style={{ fontSize: 9, fontWeight: 700, color: cfg.color, whiteSpace: "nowrap" }}>
                  {cfg.label}
                </span>
              )}
              {isCompleted && (
                <svg width={6} height={6} viewBox="0 0 12 12">
                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Spec Sticker Card ─── */
function SpecSticker({ spec, isSelected, onSelect, onOpen }) {
  const [hovered, setHovered] = useState(false);
  const specState = deriveSpecState(spec);
  const cfg = STATE_CONFIG[specState];

  const tasksStage = spec.stages.find((s) => s.name === "tasks");
  const taskCount = tasksStage?.metadata?.taskCount ?? 0;
  const completedCount = tasksStage?.metadata?.completedCount ?? 0;
  const pct = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(spec.id)}
      onDoubleClick={() => onOpen(spec.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 280,
        minHeight: 160,
        textAlign: "left",
        border: isSelected ? `2px solid ${cfg.color}` : `1px solid ${hovered ? "#d1d5db" : "#e5e7eb"}`,
        borderRadius: 14,
        padding: isSelected ? "15px" : "16px",
        background: isSelected ? `${cfg.ring}` : hovered ? "#fafafa" : "#ffffff",
        cursor: "pointer",
        transition: "all 0.15s ease",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        boxShadow: hovered
          ? "0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)"
          : "0 1px 3px rgba(0,0,0,0.03)",
        transform: hovered ? "translateY(-1px)" : "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Top accent bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: cfg.color,
        opacity: isSelected ? 1 : 0.5,
        borderRadius: "14px 14px 0 0",
      }} />

      {/* Header: name + badge */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 650, color: "#111827",
            overflow: "hidden", textOverflow: "ellipsis",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            lineHeight: "1.35",
          }}>
            {spec.name}
          </div>
        </div>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "3px 8px", borderRadius: 10,
          background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
          fontSize: 10, fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap",
        }}>
          {cfg.label}
        </span>
      </div>

      {/* Branch + date row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {spec.branch && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            padding: "2px 7px", borderRadius: 6,
            fontSize: 10, fontWeight: 600,
            background: spec.isCurrentBranch ? "#dcfce7" : "#f3f4f6",
            color: spec.isCurrentBranch ? "#16a34a" : "#6b7280",
            border: spec.isCurrentBranch ? "1px solid #bbf7d0" : "1px solid #e5e7eb",
          }}>
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            {spec.branch}
          </span>
        )}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          fontSize: 10, color: "#9ca3af", fontWeight: 500,
        }}>
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          {timeAgo(spec.createdAt)}
        </span>
      </div>

      {/* Compact stepper */}
      <CompactStepper current={specState} />

      {/* Task progress (if applicable) */}
      {taskCount > 0 && (
        <div style={{ marginTop: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9ca3af", marginBottom: 4 }}>
            <span>Tasks</span>
            <span style={{ fontWeight: 600, color: pct === 100 ? "#16a34a" : "#6b7280" }}>
              {completedCount}/{taskCount}
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: "#f3f4f6", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${pct}%`, borderRadius: 2,
              background: pct === 100
                ? "linear-gradient(90deg, #22c55e, #16a34a)"
                : "linear-gradient(90deg, #3b82f6, #6366f1)",
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>
      )}
    </button>
  );
}

/* ─── Filter Chip ─── */
function FilterChip({ state, count, isActive, onClick }) {
  const cfg = STATE_CONFIG[state];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "5px 12px", borderRadius: 8,
        border: isActive ? `1.5px solid ${cfg.border}` : "1.5px solid transparent",
        background: isActive ? cfg.bg : "transparent",
        cursor: count > 0 ? "pointer" : "default",
        opacity: count > 0 ? 1 : 0.35,
        pointerEvents: count > 0 ? "auto" : "none",
        transition: "all 0.15s",
        fontFamily: "inherit",
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: "50%",
        background: isActive ? cfg.color : "#d1d5db",
        transition: "background 0.15s",
      }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? cfg.color : "#6b7280" }}>
        {count}
      </span>
      <span style={{ fontSize: 11, color: isActive ? cfg.color : "#9ca3af" }}>
        {cfg.label}
      </span>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Component — Flex-wrap sticker grid
   ═══════════════════════════════════════════════════════ */
export default function SpecsGridDraft() {
  const [selectedId, setSelectedId] = useState(null);
  const [filterState, setFilterState] = useState(null);

  // Sort by createdAt descending (newest first)
  const sortedSpecs = useMemo(
    () => [...MOCK_SPECS].sort((a, b) => b.createdAt - a.createdAt),
    []
  );

  // Group by state for filter counts
  const grouped = useMemo(() => {
    const g = { spec: [], planned: [], tasks: [], implementing: [], done: [] };
    for (const s of sortedSpecs) g[deriveSpecState(s)].push(s);
    return g;
  }, [sortedSpecs]);

  // Apply filter
  const filtered = filterState ? grouped[filterState] : sortedSpecs;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f9fafb",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{ padding: "24px 24px 16px", borderBottom: "1px solid #e5e7eb", background: "#ffffff" }}>
        {/* Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
          </svg>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>Specs</span>
          <span style={{
            fontSize: 12, fontWeight: 600, color: "#6b7280",
            background: "#f3f4f6", padding: "2px 8px", borderRadius: 10,
          }}>
            {sortedSpecs.length}
          </span>
        </div>

        {/* Filter bar */}
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {STEPS.map((state) => (
            <FilterChip
              key={state}
              state={state}
              count={grouped[state].length}
              isActive={filterState === state}
              onClick={() => setFilterState(filterState === state ? null : state)}
            />
          ))}
        </div>
      </div>

      {/* ─── Flex-wrap card grid ─── */}
      <div style={{
        padding: 24,
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        alignItems: "stretch",
        alignContent: "flex-start",
      }}>
        {filtered.map((spec) => (
          <SpecSticker
            key={spec.id}
            spec={spec}
            isSelected={selectedId === spec.id}
            onSelect={setSelectedId}
            onOpen={(id) => alert(`Open spec: ${id}`)}
          />
        ))}
        {filtered.length === 0 && (
          <div style={{
            width: "100%", textAlign: "center", padding: 48, color: "#9ca3af", fontSize: 13,
          }}>
            No specs match this filter.
          </div>
        )}
      </div>
    </div>
  );
}
