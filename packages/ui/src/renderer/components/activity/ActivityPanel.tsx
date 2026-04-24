import React from "react";
import { Sparkles } from "lucide-react";

import { colors } from "../../utils/colors";
import { useSpecStore } from "../../store/specStore";
import { useAiSpecChatStore } from "../../store/aiSpecChatStore";
import { SpecFileList } from "./SpecFileList";
import { ScrollableText } from "../common/ScrollableText";
import { SpecChatBubble } from "../main/aiChat/SpecChatBubble";

import type { BuiltinTabId } from "../main/TabBar";

/* ── Section wrapper ── */

function Section({
  title,
  children,
  action,
  style,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "8px 12px",
        borderBottom: `1px solid ${colors.border}`,
        minHeight: 0,
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: children ? 10 : 0,
          flexShrink: 0,
        }}
      >
        <ScrollableText
          style={{
            //fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: colors.textTertiary,
          }}
          title={title}
        >
          {title}
        </ScrollableText>
        {action}
      </div>
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

/* ── Main panel ── */

type ActivityPanelProps = {
  onOpenFile?: (filePath: string) => void;
  /** The currently active builtin tab id (e.g. "specs", "ai", "worktrees", "workflow"). */
  activeBuiltinTab?: BuiltinTabId | null;
};

export function ActivityPanel({ onOpenFile, activeBuiltinTab }: ActivityPanelProps): React.ReactElement {
  const selectedSpecPath = useSpecStore((state) => state.selectedSpecPath);
  const specs = useSpecStore((state) => state.specs);

  const selectedSpec = specs.find((s) => s.path === selectedSpecPath) ?? null;

  // Derive the spec-folder path relative to the repo root for the agent's
  // system prompt. Falls back to the folder name if the spec record is
  // missing a repoPath (shouldn't happen in practice).
  const specRelPath = selectedSpec
    ? selectedSpec.repoPath && selectedSpec.path.startsWith(selectedSpec.repoPath)
      ? selectedSpec.path.slice(selectedSpec.repoPath.length).replace(/^[\\/]+/, "")
      : selectedSpec.name
    : "";

  const openSpecChat = useAiSpecChatStore((s) => s.setOpen);

  return (
    // `position: relative` so the floating SpecChatBubble anchors to the
    // ActivityPanel's visible area rather than the outer app.
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* Spec Files (only shown when a spec is selected) */}
      {selectedSpec && selectedSpec.files.length > 0 && (
        <Section
          title={selectedSpec.name}
          style={{ flex: 1, borderBottom: "none" }}
          action={
            <button
              type="button"
              title="Chat about this spec"
              onClick={() => openSpecChat(selectedSpec.path, true)}
              style={{
                width: 22,
                height: 22,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                color: colors.primary,
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <Sparkles size={12} strokeWidth={2} />
            </button>
          }
        >
          <SpecFileList files={selectedSpec.files} onOpenFile={onOpenFile} />
        </Section>
      )}

      {/* Spacer — when no file section is shown */}
      {!(selectedSpec && selectedSpec.files.length > 0) && (
        <div style={{ flex: 1 }} />
      )}

      {/* Floating spec-chat bubble — pinned bottom-right of the panel. */}
      {selectedSpec && (
        <SpecChatBubble
          specPath={selectedSpec.path}
          specName={selectedSpec.name}
          specRelPath={specRelPath}
          repoPath={selectedSpec.repoPath}
          isCurrentBranch={selectedSpec.isCurrentBranch ?? true}
        />
      )}
    </div>
  );
}
