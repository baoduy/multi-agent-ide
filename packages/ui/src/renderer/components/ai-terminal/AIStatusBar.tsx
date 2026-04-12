import React from "react";
import type { AISessionRecord } from "@magenta/shared/aiTerminal";
import { ProviderBadge } from "../common/ProviderBadge";

type AIStatusBarProps = {
  session: AISessionRecord;
};


/**
 * Gets the status color.
 */
function getStatusColor(status: AISessionRecord["status"]): string {
  switch (status) {
    case "running":
      return "#3d7a2a";
    case "waiting-input":
      return "#b8860b";
    case "error":
      return "#c75050";
    case "exited":
    case "idle":
    default:
      return "#9a958c";
  }
}

/**
 * Formats the status for display.
 */
function formatStatus(status: AISessionRecord["status"]): string {
  switch (status) {
    case "waiting-input":
      return "Waiting for input";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

/**
 * Simple status bar displayed at the bottom of the AI terminal view.
 * Shows: provider dot + status + separator + provider name.
 */
export function AIStatusBar({ session }: AIStatusBarProps): React.ReactElement {
  const statusColor = getStatusColor(session.status);
  const statusText = formatStatus(session.status);

  return (
    <div
      style={{
        height: 28,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 16px",
        background: "#f5f4ed",
        borderTop: "1px solid #e5e2da",
        fontSize: 12,
        color: "#6b6560",
      }}
    >
      {/* Provider badge (icon + name) */}
      <ProviderBadge provider={session.provider} iconSize={12} fontSize={12} color="#6b6560" />

      {/* Separator */}
      <span style={{ color: "#d1cec6" }}>·</span>

      {/* Status text */}
      <span
        style={{
          color: statusColor,
          fontWeight: 500,
        }}
      >
        {statusText}
      </span>
    </div>
  );
}
