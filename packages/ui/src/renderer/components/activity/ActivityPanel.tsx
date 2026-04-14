import React from "react";

import { colors } from "../../utils/colors";
import { useSpecStore } from "../../store/specStore";
import { SpecFileList } from "./SpecFileList";
import { ScrollableText } from "../common/ScrollableText";

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
        padding: "14px 16px",
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
            fontSize: 10,
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Spec Files (only shown when a spec is selected) */}
      {selectedSpec && selectedSpec.files.length > 0 && (
        <Section title={selectedSpec.name} style={{ flex: 1, borderBottom: "none" }}>
          <SpecFileList files={selectedSpec.files} onOpenFile={onOpenFile} />
        </Section>
      )}

      {/* Spacer — when no file section is shown */}
      {!(selectedSpec && selectedSpec.files.length > 0) && (
        <div style={{ flex: 1 }} />
      )}
    </div>
  );
}
