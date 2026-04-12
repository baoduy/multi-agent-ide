import React, { useCallback, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { useSpecStore } from "../../store/specStore";
import { useRepoStore } from "../../store/repoStore";
import { useAISessionStore } from "../../store/aiSessionStore";
import { SpecFileList } from "./SpecFileList";
import { ScrollableText } from "../common/ScrollableText";
import { MagentaTerminal, MagentaTerminalHandle } from "../common/MagentaTerminal";
import { ProviderIcon } from "../common/ProviderIcon";
import { getProviderName, type ProviderVariant } from "../common/providerConfig";

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
        padding: "14px 16px",
        borderBottom: "1px solid #e5e2da",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: children ? 10 : 0,
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
      {children}
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
          Running
        </span>
      )}
    </div>
  );
}

/* ── Main panel ── */

type ActivityPanelProps = {
  onOpenFile?: (filePath: string) => void;
};

export function ActivityPanel({ onOpenFile }: ActivityPanelProps): React.ReactElement {
  const selectedSpecPath = useSpecStore((state) => state.selectedSpecPath);
  const specs = useSpecStore((state) => state.specs);
  const activeRepoPath = useRepoStore((state) => state.activeRepoPath);
  const terminalRef = useRef<MagentaTerminalHandle>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);

  const sessions = useAISessionStore((state) => state.sessions);

  const selectedSpec = specs.find((s) => s.path === selectedSpecPath) ?? null;

  // Derive which providers have at least one actively running session
  const isClaudeRunning = useMemo(
    () => sessions.some((s) => s.provider === "claude" && (s.status === "running" || s.status === "waiting-input")),
    [sessions],
  );
  const isCopilotRunning = useMemo(
    () => sessions.some((s) => s.provider === "copilot" && (s.status === "running" || s.status === "waiting-input")),
    [sessions],
  );

  const handleAddTerminal = useCallback(() => {
    if (!terminalOpen) {
      // First click — mount the component (it auto-creates tab 1)
      setTerminalOpen(true);
    } else {
      // Already mounted — ask the terminal to add a new tab
      terminalRef.current?.createTab();
    }
  }, [terminalOpen]);

  const handleAllTabsClosed = useCallback(() => {
    setTerminalOpen(false);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Spec Files */}
      {selectedSpec ? (
        <Section title={selectedSpec.name} style={{ flex: 1, overflowY: "auto", borderBottom: "none" }}>
          <SpecFileList files={selectedSpec.files} onOpenFile={onOpenFile} />
        </Section>
      ) : activeRepoPath ? (
        <Section title="Files">
          <div style={{ fontSize: 11, color: "#9a958c" }}>Select a spec to view its files.</div>
        </Section>
      ) : (
        <Section title="Files">
          <div style={{ fontSize: 11, color: "#9a958c" }}>Select a repository and spec.</div>
        </Section>
      )}

      {/* Agent Status */}
      <Section title="Agents" style={{ flexShrink: 0, borderBottom: "none" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ProviderStatusItem provider="claude" active={isClaudeRunning} />
          <ProviderStatusItem provider="copilot" active={isCopilotRunning} />
        </div>
      </Section>

      {/* Terminal — "+" button lives in the section title bar */}
      <Section
        title="Terminal"
        style={{ flexShrink: 0, borderBottom: "none" }}
        action={
          <button
            type="button"
            onClick={handleAddTerminal}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "2px",
              background: "transparent",
              border: "none",
              color: "#3d7a2a",
              cursor: "pointer",
              borderRadius: 4,
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#50a14f")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#3d7a2a")}
            title="New terminal"
          >
            <Plus size={14} strokeWidth={2} />
          </button>
        }
      >
        {terminalOpen ? (
          <MagentaTerminal
            ref={terminalRef}
            readonly={false}
            cwd={activeRepoPath ?? undefined}
            maxHeight={200}
            fontSize={9}
            fontFamily="'SF Mono', 'Fira Code', ui-monospace, monospace"
            enableTabs={true}
            onAllTabsClosed={handleAllTabsClosed}
          />
        ) : undefined}
      </Section>

      <style>{`@keyframes provider-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
