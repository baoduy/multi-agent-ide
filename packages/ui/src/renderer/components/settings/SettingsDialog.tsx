import React, { useState, useEffect } from "react";

import { useConfigStore } from "../../store/configStore";
import { AddWorkingDirButton } from "./AddWorkingDirButton";
import { WorkingDirList } from "./WorkingDirList";

type SettingsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

/**
 * Settings dialog for managing working directories.
 */
export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps): React.ReactElement | null {
  const [localError, setLocalError] = useState<string | null>(null);
  const storeError = useConfigStore((state) => state.error);

  const error = localError || storeError;

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 8,
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
          padding: 24,
          maxWidth: 500,
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <h2 id="settings-title" style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#1f2937" }}>
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings dialog"
            title="Close (Esc)"
            style={{
              background: "none",
              border: "none",
              fontSize: 24,
              cursor: "pointer",
              padding: 0,
              color: "#6b7280",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 600, color: "#374151" }}>
            Working Directories
          </h3>
          <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
            Magenta IDE will scan these directories for git repositories. You can add multiple directories.
          </p>

          <WorkingDirList />

          <AddWorkingDirButton onError={setLocalError} />
        </div>

        {error && (
          <div
            style={{
              backgroundColor: "#fee2e2",
              border: "1px solid #fecaca",
              borderRadius: 6,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: "#991b1b" }}>{error}</p>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 500,
              backgroundColor: "#e5e7eb",
              color: "#374151",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
