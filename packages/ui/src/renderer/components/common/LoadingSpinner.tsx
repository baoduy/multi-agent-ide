import React from "react";
import { colors } from "../../utils/colors";

type LoadingSpinnerProps = {
  message?: string;
};

/**
 * Loading spinner component shown during initialization.
 */
export function LoadingSpinner({ message = "Loading..." }: LoadingSpinnerProps): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: colors.bgSurface,
        gap: 8,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          border: `2px solid ${colors.border}`,
          borderTopColor: colors.primary,
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      />
      <p style={{ 
        //fontSize: 11, 
        color: colors.textSecondary, 
        margin: 0 
      }}>{message}</p>
    </div>
  );
}
