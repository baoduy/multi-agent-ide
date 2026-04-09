import React from "react";

/* ── Section wrapper ── */

function Section({
  title,
  children,
  style,
}: {
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}): React.ReactElement {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderBottom: "1px solid #e5e5ec",
        ...style,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#8b8b96",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

/* ── Agent Activity log ── */

function LogLine({
  agent,
  message,
}: {
  agent?: string;
  message: string;
}): React.ReactElement {
  return (
    <div
      style={{
        fontSize: 12,
        color: "#8b8b96",
        padding: "3px 0",
        fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', ui-monospace, monospace",
      }}
    >
      {agent && <span style={{ color: "#1e1e2e", fontWeight: 500 }}>{agent} </span>}
      {message}
    </div>
  );
}

/* ── Action button ── */

function ActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      style={{
        display: "block",
        width: "100%",
        padding: "8px 12px",
        fontSize: 12,
        fontWeight: 400,
        border: "1px solid #d0d0d8",
        borderRadius: 6,
        background: "#ffffff",
        color: "#1e1e2e",
        cursor: "pointer",
        textAlign: "left",
        marginBottom: 6,
        transition: "background 0.12s, border-color 0.12s",
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#f4f4f6";
        e.currentTarget.style.borderColor = "#c8c8d0";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "#ffffff";
        e.currentTarget.style.borderColor = "#d0d0d8";
      }}
    >
      {label}
    </button>
  );
}

/* ── Legend dot ── */

function LegendItem({
  color,
  label,
}: {
  color: string;
  label: string;
}): React.ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 12, color: "#8b8b96" }}>{label}</span>
    </div>
  );
}

/* ── Main panel ── */

export function ActivityPanel(): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Agent Activity */}
      <Section title="Agent Activity">
        <LogLine message="No agents running" />
      </Section>

      {/* Quick Actions */}
      <Section title="Quick Actions">
        <ActionButton label="View diff" />
        <ActionButton label="Pause agents" />
        <ActionButton label="New spec" />
        <ActionButton label="Run queued" />
      </Section>

      {/* Legend */}
      <Section title="Legend" style={{ flex: 1, overflowY: "auto", borderBottom: "none" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <LegendItem color="#5b57d1" label="Claude Code agent" />
          <LegendItem color="#1a7f37" label="GitHub Copilot agent" />
          <LegendItem color="#c8c8d0" label="Idle / queued" />
        </div>
      </Section>
    </div>
  );
}
