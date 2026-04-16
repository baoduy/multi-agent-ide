import React from "react";

import { colors } from "../../utils/colors";

type AutoSaveStatusProps = {
  saved: boolean;
  isDirty: boolean;
  errorText?: string | null;
  minHeight?: number;
  savedMessage?: string;
  dirtyMessage?: string;
};

/**
 * Inline helper text for autosave fields. Prioritizes error > saved > dirty hint.
 */
export function AutoSaveStatus({
  saved,
  isDirty,
  errorText = null,
  minHeight = 16,
  savedMessage = "Saved",
  dirtyMessage = "Press Enter or click away to save",
}: AutoSaveStatusProps): React.ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, minHeight }}>
      {errorText && (
        <span style={{ fontSize: 10, color: colors.errorDark, fontWeight: 500 }}>
          {errorText}
        </span>
      )}
      {!errorText && saved && (
        <span style={{ fontSize: 10, color: colors.success, fontWeight: 500 }}>
          {savedMessage}
        </span>
      )}
      {!errorText && isDirty && !saved && (
        <span style={{ fontSize: 10, color: colors.textTertiary }}>
          {dirtyMessage}
        </span>
      )}
    </div>
  );
}
