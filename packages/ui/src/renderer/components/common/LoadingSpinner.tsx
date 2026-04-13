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
        gap: 16,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          border: `3px solid ${colors.border}`,
          borderTopColor: colors.primary,
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      />
      <p style={{ fontSize: 14, color: colors.textSecondary, margin: 0 }}>{message}</p>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
