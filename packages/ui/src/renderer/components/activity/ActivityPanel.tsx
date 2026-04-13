import React, { useCallback, useMemo, useState } from "react";

import { useSpecStore } from "../../store/specStore";
import { useAISessionStore } from "../../store/aiSessionStore";
import { useRepoStore } from "../../store/repoStore";
import { SpecFileList } from "./SpecFileList";
import { RepoFileChanges } from "./RepoFileChanges";
import { ScrollableText } from "../common/ScrollableText";
import { ProviderIcon } from "../common/ProviderIcon";
import { getProviderName, type ProviderVariant } from "../common/providerConfig";

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
        borderBottom: "1px solid #e5e2da",
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
            color: "#9a958c",
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

/* ── Provider status item ── */

function ProviderStatusItem({
  provider,
  active,
}: {
  provider: ProviderVariant;
  active: boolean;
}): React.ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          display: "inline-flex",
          opacity: active ? 1 : 0.3,
          animation: active ? "provider-pulse 2s ease-in-out infinite" : "none",
        }}
      >
        <ProviderIcon provider={provider} size={16} />
      </span>
      <span style={{ fontSize: 11, color: active ? "#2c2c2c" : "#9a958c", fontWeight: active ? 500 : 400 }}>
        {getProviderName(provider)}
      </span>
      {active && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "#3d7a2a",
            background: "#e4f0df",
            padding: "1px 6px",
            borderRadius: 8,
            lineHeight: "14px",
          }}
        >
          Active
        </span>
      )}
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

  const sessions = useAISessionStore((state) => state.sessions);
  const activeRepoPath = useRepoStore((state) => state.activeRepoPath);

  const selectedSpec = specs.find((s) => s.path === selectedSpecPath) ?? null;

  const isAITab = activeBuiltinTab === "ai";

  const [fileChangeCount, setFileChangeCount] = useState<number | null>(null);
  const handleFileCountChange = useCallback((count: number) => {
    setFileChangeCount(count);
  }, []);

  const changesSectionTitle = fileChangeCount != null ? `Changes (${fileChangeCount})` : "Changes";

  // Derive which providers have at least one actively running session
  const isClaudeRunning = useMemo(
    () => sessions.some((s) => s.provider === "claude" && (s.status === "active" || s.status === "waiting-input")),
    [sessions],
  );
  const isCopilotRunning = useMemo(
    () => sessions.some((s) => s.provider === "copilot" && (s.status === "active" || s.status === "waiting-input")),
    [sessions],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* AI Tab → show git file changes for the active repo */}
      {isAITab && activeRepoPath && (
        <Section title={changesSectionTitle} style={{ flex: 1, borderBottom: "none" }}>
          <RepoFileChanges
            repoPath={activeRepoPath}
            onOpenFile={onOpenFile}
            onFileCountChange={handleFileCountChange}
          />
        </Section>
      )}

      {/* Non-AI tabs → Spec Files (only shown when a spec is selected) */}
      {!isAITab && selectedSpec && selectedSpec.files.length > 0 && (
        <Section title={selectedSpec.name} style={{ flex: 1, borderBottom: "none" }}>
          <SpecFileList files={selectedSpec.files} onOpenFile={onOpenFile} />
        </Section>
      )}

      {/* Spacer — pushes Agents to the bottom when no file section is shown */}
      {!(isAITab && activeRepoPath) && !(!isAITab && selectedSpec && selectedSpec.files.length > 0) && (
        <div style={{ flex: 1 }} />
      )}

      {/* Agent Status — always pinned at the bottom */}
      <Section title="Agents" style={{ flexShrink: 0, borderBottom: "none", borderTop: "1px solid #e5e2da" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ProviderStatusItem provider="claude" active={isClaudeRunning} />
          <ProviderStatusItem provider="copilot" active={isCopilotRunning} />
        </div>
      </Section>

      <style>{`@keyframes provider-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
