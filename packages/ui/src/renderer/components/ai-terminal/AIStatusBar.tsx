import React, { useCallback, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { AISessionRecord, AIPermissionMode } from "@magenta/shared/aiTerminal";
import { PERMISSION_MODE_LABELS, PROVIDER_PERMISSION_MODES } from "@magenta/shared/aiTerminal";
import { ProviderBadge } from "../common/ProviderBadge";
import { useAISessionStore } from "../../store/aiSessionStore";
import { getStatusColor } from "../../utils/sessionStatus";

type AIStatusBarProps = {
  session: AISessionRecord;
};

/** Color for each permission mode chip. */
function getModeColor(mode: AIPermissionMode): string {
  switch (mode) {
    case "auto":
      return "#3d7a2a";
    case "acceptEdits":
      return "#b8860b";
    case "plan":
      return "#4a7fb5";
    case "bypassPermissions":
      return "#c75050";
    case "dontAsk":
      return "#8b5e3c";
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
 * Status bar displayed at the bottom of the AI terminal view.
 * Shows: provider badge + status + separator + permission mode dropdown.
 */
export function AIStatusBar({ session }: AIStatusBarProps): React.ReactElement {
  const statusColor = getStatusColor(session.status);
  const statusText = formatStatus(session.status);
  const setPermissionMode = useAISessionStore((s) => s.setPermissionMode);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentMode = session.permissionMode ?? "default";
  const modeColor = getModeColor(currentMode);
  const supportedModes = PROVIDER_PERMISSION_MODES[session.provider];

  const handleModeSelect = useCallback(
    (mode: AIPermissionMode) => {
      setDropdownOpen(false);
      if (mode !== currentMode) {
        void setPermissionMode(session.id, mode);
      }
    },
    [currentMode, session.id, setPermissionMode],
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

      {/* Separator */}
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
          {PERMISSION_MODE_LABELS[currentMode]}
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
            {supportedModes.map((mode) => {
              const isActive = mode === currentMode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleModeSelect(mode)}
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
                    color: isActive ? getModeColor(mode) : "#2c2c2c",
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
                      background: isActive ? getModeColor(mode) : "transparent",
                      flexShrink: 0,
                    }}
                  />
                  {PERMISSION_MODE_LABELS[mode]}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Spacer pushes nothing to the right — keeps layout consistent */}
      <span style={{ flex: 1 }} />
    </div>
  );
}
