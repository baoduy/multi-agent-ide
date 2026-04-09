import React, { useState } from "react";

import { useConfigStore } from "../../store/configStore";

type AddWorkingDirButtonProps = {
  onError?: (error: string | null) => void;
};

/**
 * Button to add a new working directory.
 */
export function AddWorkingDirButton({ onError }: AddWorkingDirButtonProps): React.ReactElement {
  const [isLoading, setIsLoading] = useState(false);
  const addWorkingDir = useConfigStore((state) => state.addWorkingDir);

  const handleClick = async (): Promise<void> => {
    // In a real app, we'd use a file picker dialog
    // For now, we'll use a prompt for simplicity
    const path = window.prompt("Enter path to working directory:", "");

    if (!path || path.trim() === "") {
      return;
    }

    onError?.(null);
    setIsLoading(true);

    try {
      await addWorkingDir(path);
      setIsLoading(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      onError?.(errorMessage);
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      style={{
        width: "100%",
        padding: "8px 12px",
        fontSize: 13,
        fontWeight: 500,
        backgroundColor: "#3b82f6",
        color: "#ffffff",
        border: "none",
        borderRadius: 6,
        cursor: isLoading ? "default" : "pointer",
        opacity: isLoading ? 0.7 : 1,
      }}
    >
        aria-label="Add new working directory"
        title="Add a new working directory to scan for repositories"
      {isLoading ? "Adding..." : "+ Add Working Directory"}
    </button>
  );
}
