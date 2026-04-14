import React, { useState } from "react";

import { colors } from "../../utils/colors";
import { useConfigStore } from "../../store/configStore";
import { selectFolder } from "../../utils/ipc";

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
    const path = await selectFolder();

    if (!path) {
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
      aria-label="Add new working directory"
      title="Add a new working directory to scan for repositories"
      style={{
        width: "100%",
        padding: "8px 12px",
        fontSize: 13,
        fontWeight: 500,
        backgroundColor: colors.info,
        color: colors.textWhite,
        border: "none",
        borderRadius: 6,
        cursor: isLoading ? "default" : "pointer",
        opacity: isLoading ? 0.7 : 1,
      }}
    >
      {isLoading ? "Adding..." : "+ Add Working Directory"}
    </button>
  );
}
