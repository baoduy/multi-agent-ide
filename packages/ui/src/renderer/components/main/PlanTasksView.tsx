import React from "react";

import type { SpecFolder } from "@magenta/shared/models";

/* ── Shared sub-components ── */

function Badge({ label, bg, color }: { label: string; bg: string; color: string }): React.ReactElement {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 3,
        fontSize: 11,
        fontWeight: 500,
        background: bg,
        color,
        lineHeight: "16px",
      }}
    >
      {label}
    </span>
  );
}

function AgentDot({ variant }: { variant: "claude" | "copilot" | "idle" }): React.ReactElement {
  const colors: Record<string, string> = {
    claude: "#C15F3C",
    copilot: "#3d7a2a",
    idle: "#d1cec6",
  };
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        display: "inline-block",
        background: colors[variant] ?? colors.idle,
      }}
    />
  );
}

function ProgressBar({ percent, color }: { percent: number; color: string }): React.ReactElement {
  return (
    <div style={{ height: 3, borderRadius: 2, background: "#e5e2da", marginTop: 6, overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: 2, width: `${percent}%`, background: color }} />
    </div>
  );
}

/* ── Card ── */

type TaskCard = {
  title: string;
  subtitle: string;
  agent?: "claude" | "copilot" | "idle";
  agentLabel?: string;
  progress?: number;
  active?: boolean;
  badge?: { label: string; bg: string; color: string };
};

function Card({ card }: { card: TaskCard }): React.ReactElement {
  return (
    <div
      style={{
        border: card.active ? "1px solid #C15F3C" : "1px solid #e5e2da",
        borderRadius: 8,
        padding: "12px 14px",
        background: "#faf9f5",
        cursor: "pointer",
        flex: 1,
        minWidth: 160,
        maxWidth: 260,
        transition: "border-color 0.12s, box-shadow 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#d1cec6";
        e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = card.active ? "#C15F3C" : "#e5e2da";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#2c2c2c" }}>
        {card.title}
      </div>
      <div style={{ fontSize: 12, color: "#6b6560", lineHeight: 1.5 }}>{card.subtitle}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        <AgentDot variant={card.agent ?? "idle"} />
        {card.badge ? (
          <Badge label={card.badge.label} bg={card.badge.bg} color={card.badge.color} />
        ) : (
          <span style={{ fontSize: 11, color: "#9a958c" }}>{card.agentLabel ?? ""}</span>
        )}
      </div>
      {card.progress != null && (
        <ProgressBar percent={card.progress} color={card.agent === "copilot" ? "#3d7a2a" : "#C15F3C"} />
      )}
    </div>
  );
}

/* ── Phase row ── */

function PhaseRow({ label, cards }: { label: string; cards: TaskCard[] }): React.ReactElement {
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#9a958c",
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {cards.map((card, i) => (
          <Card key={i} card={card} />
        ))}
      </div>
    </div>
  );
}

/* ── Main view ── */

type PlanTasksViewProps = {
  specs: SpecFolder[];
};

export function PlanTasksView({ specs }: PlanTasksViewProps): React.ReactElement {
  if (specs.length === 0) {
    return (
      <div style={{ padding: 20, color: "#9a958c", fontSize: 13 }}>
        No specs found for this repository. Create a spec folder to get started.
      </div>
    );
  }

  const specPhaseCards: TaskCard[] = specs.map((spec) => ({
    title: spec.name,
    subtitle: spec.stages.map((s) => s.name).join(" \u2192 "),
    agent: "idle" as const,
    agentLabel: spec.stages.length > 0 ? `${spec.stages.length} stages` : "Empty",
  }));

  return (
    <div style={{ padding: 20 }}>
      <PhaseRow label="Spec & Design" cards={specPhaseCards} />
      <PhaseRow
        label="Implementation tasks"
        cards={[
          {
            title: "No tasks yet",
            subtitle: "Approve a spec to generate tasks",
            agent: "idle",
            agentLabel: "Waiting",
          },
        ]}
      />
    </div>
  );
}
