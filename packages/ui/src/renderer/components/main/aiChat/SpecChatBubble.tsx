import React from "react";
import { Sparkles, X } from "lucide-react";
import { colors } from "../../../utils/colors";
import { useAiSpecChatStore } from "../../../store/aiSpecChatStore";
import { SpecChatPanel } from "./SpecChatPanel";

export interface SpecChatBubbleProps {
  specPath: string;
  specName: string;
  specRelPath: string;
  repoPath: string;
  isCurrentBranch: boolean;
}

/**
 * Floating AI bubble anchored to the bottom-right of the ActivityPanel.
 * Opens `SpecChatPanel` — a read-only review chat scoped to one spec
 * folder. Disabled for specs loaded from another branch (`gitref://…`
 * paths) because the daemon currently can only run `claude` against
 * files on disk.
 */
export function SpecChatBubble({
  specPath,
  specName,
  specRelPath,
  repoPath,
  isCurrentBranch,
}: SpecChatBubbleProps): React.ReactElement {
  const open = useAiSpecChatStore((s) => s.threadsBySpec[specPath]?.open ?? false);
  const setOpen = useAiSpecChatStore((s) => s.setOpen);

  const disabled = !isCurrentBranch;

  return (
    <>
      {open && !disabled && (
        <SpecChatPanel
          specPath={specPath}
          specName={specName}
          specRelPath={specRelPath}
          repoPath={repoPath}
          onClose={() => setOpen(specPath, false)}
        />
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(specPath, !open)}
        title={
          disabled
            ? "Chat only supports specs on the current branch."
            : open
              ? "Close spec chat"
              : "Chat about this spec"
        }
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: disabled ? colors.bgMuted : open ? colors.bgSurface : colors.primary,
          color: disabled ? colors.textTertiary : open ? colors.text : "white",
          border: open ? `1px solid ${colors.border}` : "none",
          boxShadow: disabled ? "none" : "0 4px 14px rgba(0, 0, 0, 0.2)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.55 : 1,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 900,
        }}
      >
        {open ? <X size={18} strokeWidth={2} /> : <Sparkles size={18} strokeWidth={2} />}
      </button>
    </>
  );
}
