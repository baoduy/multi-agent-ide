import React, { useCallback, useRef, useState } from "react";
import { ChevronDown, Terminal } from "lucide-react";
import type { AISessionRecord, AIPermissionMode } from "@magenta/shared/aiTerminal";
import { ProviderBadge } from "../common/ProviderBadge";
import { RepoLabel, BranchLabel } from "../common/RepoLabel";
import { WorkspaceLabel } from "../common/WorkspaceLabel";
import { useAISessionStore } from "../../store/aiSessionStore";
import { getStatusColor } from "../../utils/sessionStatus";

/** Simplified permission modes — matches NewSessionDialog. */
type SimplifiedPermission = "default" | "auto" | "bypassPermissions";

const SIMPLIFIED_MODES: readonly { key: SimplifiedPermission; label: string }[] = [
  { key: "default", label: "Default" },
  { key: "auto", label: "Auto" },
  { key: "bypassPermissions", label: "Bypass" },
];

/** Info for a plain terminal tab. */
export type TerminalTabInfo = {
  kind: "terminal";
  label: string;
  cwd: string;
};

/** Info for an AI agent tab. */
export type AgentTabInfo = {
  kind: "agent";
  session: AISessionRecord;
};

export type StatusBarTab = TerminalTabInfo | AgentTabInfo;

type AIStatusBarProps = {
  tab: StatusBarTab;
};

/** Color for each simplified permission mode. */
function getModeColor(mode: SimplifiedPermission): string {
  switch (mode) {
    case "auto":
      return "#3d7a2a";
    case "bypassPermissions":
      return "#c75050";
    default:
      return "#6b6560";
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
 * Status bar displayed at the bottom of the tab view.
 * For agent tabs: provider badge + repo/branch + status + permission dropdown.
 * For terminal tabs: shell icon + directory label + "Running" status.
 */
export function AIStatusBar({ tab }: AIStatusBarProps): React.ReactElement {
  const setPermissionMode = useAISessionStore((s) => s.setPermissionMode);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Derived values differ by tab kind
  const isAgent = tab.kind === "agent";
  const session = isAgent ? tab.session : null;

  const statusColor = session ? getStatusColor(session.status) : "#3d7a2a";
  const statusText = session ? formatStatus(session.status) : "Running";

  // Permission mode (agent tabs only)
  const rawMode = session?.permissionMode ?? "default";
  const currentMode: SimplifiedPermission =
    rawMode === "auto" ? "auto"
    : rawMode === "bypassPermissions" || rawMode === "dontAsk" ? "bypassPermissions"
    : "default";
  const modeColor = getModeColor(currentMode);

  const handleModeSelect = useCallback(
    (mode: SimplifiedPermission) => {
      setDropdownOpen(false);
      if (session && mode !== currentMode) {
        void setPermissionMode(session.id, mode as AIPermissionMode);
      }
    },
    [currentMode, session, setPermissionMode],
  );

  const handleToggleDropdown = useCallback(() => {
    setDropdownOpen((prev) => !prev);
  }, []);

  // Close dropdown on blur
  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.relatedTarget as Node)) {
      setDropdownOpen(false);
    }
  }, []);

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
        flexShrink: 0,
        color: "#6b6560",
      }}
    >
      {/* ── Agent tab content ── */}
      {isAgent && session && (
        <>
          {/* Provider badge (icon + name) */}
          <ProviderBadge provider={session.provider} iconSize={12} fontSize={12} color="#6b6560" />

          <span style={{ color: "#d1cec6" }}>·</span>

          {/* Repo / branch info */}
          {session.repoName ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden" }}>
              <RepoLabel name={session.repoName} size="xs" />
              {(session.worktreeName || session.branch) && (
                <BranchLabel name={session.worktreeName || session.branch || ""} size="xs" />
              )}
            </span>
          ) : (
            <WorkspaceLabel size="xs" />
          )}

          <span style={{ color: "#d1cec6" }}>·</span>

          {/* Status text */}
          <span style={{ color: statusColor, fontWeight: 500 }}>
            {statusText}
          </span>

          <span style={{ color: "#d1cec6" }}>·</span>

          {/* Permission mode dropdown */}
          <div
            ref={dropdownRef}
            style={{ position: "relative", display: "inline-flex" }}
            onBlur={handleBlur}
          >
            <button
              type="button"
              onClick={handleToggleDropdown}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 6px",
                borderRadius: 4,
                border: "none",
                background: dropdownOpen ? "#e5e2da" : "transparent",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                color: modeColor,
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => { if (!dropdownOpen) e.currentTarget.style.background = "#eae8e1"; }}
              onMouseLeave={(e) => { if (!dropdownOpen) e.currentTarget.style.background = "transparent"; }}
              title="Change permission mode"
            >
              {SIMPLIFIED_MODES.find((m) => m.key === currentMode)?.label ?? "Default"}
              <ChevronDown size={10} strokeWidth={2.5} />
            </button>

            {/* Dropdown menu */}
            {dropdownOpen && (
              <div
                style={{
                  position: "absolute",
                  bottom: "100%",
                  left: 0,
                  marginBottom: 4,
                  minWidth: 180,
                  background: "#ffffff",
                  border: "1px solid #e5e2da",
                  borderRadius: 6,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  zIndex: 100,
                  overflow: "hidden",
                }}
              >
                {SIMPLIFIED_MODES.map(({ key, label }) => {
                  const isActive = key === currentMode;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleModeSelect(key)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "8px 12px",
                        border: "none",
                        background: isActive ? "#f5f4ed" : "transparent",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? getModeColor(key) : "#2c2c2c",
                        textAlign: "left",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#faf9f5"; }}
                      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                    >
                      {/* Active indicator dot */}
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: isActive ? getModeColor(key) : "transparent",
                          flexShrink: 0,
                        }}
                      />
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Terminal tab content ── */}
      {!isAgent && (
        <>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Terminal size={12} strokeWidth={1.8} color="#6b6560" />
            <span style={{ fontWeight: 500 }}>Shell</span>
          </span>

          <span style={{ color: "#d1cec6" }}>·</span>

          {/* Directory label */}
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 260,
              color: "#8a857e",
            }}
            title={(tab as TerminalTabInfo).cwd}
          >
            {(tab as TerminalTabInfo).label}
          </span>

          <span style={{ color: "#d1cec6" }}>·</span>

          {/* Status */}
          <span style={{ color: "#3d7a2a", fontWeight: 500 }}>
            Running
          </span>
        </>
      )}

      {/* Spacer pushes nothing to the right — keeps layout consistent */}
      <span style={{ flex: 1 }} />
    </div>
  );
}
