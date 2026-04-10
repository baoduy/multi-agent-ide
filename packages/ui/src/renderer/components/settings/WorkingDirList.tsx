import React, { useState } from "react";

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
          padding: 16,
          backgroundColor: "#f3f4f6",
          borderRadius: 6,
          border: "1px solid #e5e7eb",
          marginBottom: 16,
          textAlign: "center",
      }}
      >
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>No working directories added yet.</p>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {workingDirs.map((dir) => (
        <div
          key={dir}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 12px",
            backgroundColor: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: "#374151",
              fontFamily: "monospace",
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
              marginLeft: 12,
              padding: "4px 8px",
              fontSize: 12,
              fontWeight: 500,
              backgroundColor: "#fee2e2",
              color: "#991b1b",
              border: "1px solid #fecaca",
              borderRadius: 4,
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
