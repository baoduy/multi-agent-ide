import React, { useState } from "react";

import { colors } from "../../utils/colors";
import { useConfigStore } from "../../store/configStore";

/**
 * List of working directories with remove buttons.
 */
export function WorkingDirList(): React.ReactElement {
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const workingDirs = useConfigStore((state) => state.workingDirs);
  const isLoading = useConfigStore((state) => state.isLoading);
  const removeWorkingDir = useConfigStore((state) => state.removeWorkingDir);

  const handleRemove = async (path: string): Promise<void> => {
    if (!window.confirm(`Remove "${path}" from working directories?`)) {
      return;
    }

    setDeletingPath(path);

    try {
      await removeWorkingDir(path);
      setDeletingPath(null);
    } catch (error) {
      console.error("Failed to remove working directory:", error);
      setDeletingPath(null);
    }
  };

  if (workingDirs.length === 0) {
    return (
      <div
        style={{
          padding: 10,
          backgroundColor: colors.bgMuted,
          borderRadius: 4,
          border: `1px solid ${colors.border}`,
          marginBottom: 10,
          textAlign: "center",
      }}
      >
        <p style={{ margin: 0, fontSize: 11, color: colors.textMuted }}>No working directories added yet.</p>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 10 }}>
      {workingDirs.map((dir) => (
        <div
          key={dir}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 8px",
            backgroundColor: colors.bgMuted,
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: colors.textStrong,
              fontFamily: "var(--font-mono)",
              wordBreak: "break-all",
            }}
          >
            {dir}
          </span>
          <button
            type="button"
            onClick={() => handleRemove(dir)}
            disabled={isLoading || deletingPath === dir}
            style={{
              marginLeft: 8,
              padding: "2px 6px",
              fontSize: 10,
              fontWeight: 500,
              backgroundColor: colors.errorSoft,
              color: colors.errorDark,
              border: `1px solid ${colors.errorSoftBorder}`,
              borderRadius: 3,
              cursor: isLoading || deletingPath === dir ? "default" : "pointer",
              opacity: isLoading || deletingPath === dir ? 0.7 : 1,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {deletingPath === dir ? "Removing..." : "Remove"}
          </button>
        </div>
      ))}
    </div>
  );
}
