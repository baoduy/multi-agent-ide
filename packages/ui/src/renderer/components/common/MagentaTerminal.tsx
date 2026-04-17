import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef, useMemo } from "react";
import { Terminal, Copy, ClipboardPaste, Eraser } from "lucide-react";
import stripAnsi from "strip-ansi";
import { TERMINAL_THEMES } from "../../utils/terminalThemes";
import { useTerminalStore } from "../../store/terminalStore";
import { useAISessionStore } from "../../store/aiSessionStore";
import { TerminalHub } from "../../terminal/TerminalHub";
import { ContextMenu, useContextMenu } from "./ContextMenu";
import type { ContextMenuAction } from "./ContextMenu";

export type MagentaTerminalStatus = "idle" | "running" | "done" | "canceled" | "error";

/** Imperative handle exposed to parent via ref. */
export interface MagentaTerminalHandle {
  createTab: () => void;
}

export interface MagentaTerminalProps {
  readonly: boolean;
  output?: string;
  status?: MagentaTerminalStatus;
  successMessage?: string;
  errorMessage?: string;
  cwd?: string;
  label?: string;
  maxHeight?: number;
  fontSize?: number;
  fontFamily?: string;
  enableTabs?: boolean;
  onAllTabsClosed?: () => void;
  ref?: React.Ref<MagentaTerminalHandle>;
  mode?: "shell" | "ai-agent";
  aiSessionId?: string;
  aiProvider?: "claude" | "copilot";
  isVisible?: boolean;
}

// Runtime theme: terminals are always dark regardless of app theme.
const THEME = TERMINAL_THEMES.dark;
const THEME_BG = THEME.background;

// ── Readonly branch (batch output viewer) ────────────────────────────────────

function MagentaTerminalReadonly({
  output = "",
  status = "idle",
  successMessage,
  errorMessage,
  label,
  maxHeight = 300,
  fontSize = 9,
  fontFamily = "'SF Mono', 'Fira Code', ui-monospace, monospace",
}: MagentaTerminalProps): React.ReactElement {
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [output]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Terminal size={12} color={THEME.foreground} strokeWidth={2} style={{ opacity: 0.6 }} />
        {label && <span style={{ fontSize: 11, fontWeight: 600, color: THEME.cyan }}>{label}</span>}
        {status === "running" && (
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: THEME.magenta,
            }}
          />
        )}
      </div>
      <pre
        ref={preRef}
        style={{
          background: THEME.background,
          color: THEME.foreground,
          padding: 12,
          borderRadius: 8,
          fontSize,
          fontFamily,
          lineHeight: 1.6,
          maxHeight,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          margin: 0,
        }}
      >
        {stripAnsi(output || (status === "running" ? "Starting...\n" : ""))}
        {status === "done" && !errorMessage && successMessage && (
          <span style={{ color: THEME.green }}>{"\n"}{successMessage}</span>
        )}
        {status === "done" && errorMessage && (
          <span style={{ color: THEME.red }}>{"\n"}Error: {errorMessage}</span>
        )}
        {status === "canceled" && (
          <span style={{ color: THEME.yellow }}>{"\n"}Canceled</span>
        )}
      </pre>
    </div>
  );
}

// ── Interactive branch ───────────────────────────────────────────────────────

/**
 * Tab bookkeeping. Every tab maps 1:1 to a hub session; the hub owns the
 * xterm, this component just tells the hub where to mount it.
 */
interface TabRecord {
  id: string;
  label: string;
  sessionId: string | null;
  mode: "shell" | "ai-agent";
}

const MagentaTerminalInteractive = forwardRef<MagentaTerminalHandle, MagentaTerminalProps>(function MagentaTerminalInteractive(
  {
    cwd,
    maxHeight,
    fontFamily = "'SF Mono', 'Fira Code', ui-monospace, monospace",
    enableTabs = true,
    onAllTabsClosed,
    mode = "shell",
    aiSessionId: aiSessionIdProp,
    isVisible = true,
  },
  ref,
): React.ReactElement {
  const isAIMode = mode === "ai-agent";

  const shellSpawn = useTerminalStore((s) => s.spawn);
  const shellClose = useTerminalStore((s) => s.close);

  const frameRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);

  const tabsRef = useRef<Map<string, TabRecord>>(new Map());
  const tabCounterRef = useRef(0);

  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [tabIds, setTabIds] = useState<string[]>([]);
  const { contextMenu: terminalMenu, openContextMenu: openTerminalMenu, closeContextMenu: closeTerminalMenu } = useContextMenu();

  // ─── Build a new tab ──────────────────────────────────────────

  const buildTab = useCallback(async (): Promise<TabRecord> => {
    tabCounterRef.current += 1;
    const id = `tab-${Date.now()}-${tabCounterRef.current}`;
    const label = `Terminal ${tabCounterRef.current}`;
    const tab: TabRecord = { id, label, sessionId: null, mode: isAIMode ? "ai-agent" : "shell" };

    if (isAIMode && aiSessionIdProp) {
      tab.sessionId = aiSessionIdProp;
    } else {
      const resolvedCwd = cwd ?? "~";
      // Initial cols/rows are provisional — the hub re-fits on mount.
      tab.sessionId = await shellSpawn(resolvedCwd, 80, 24);
    }

    tabsRef.current.set(id, tab);
    return tab;
  }, [cwd, isAIMode, aiSessionIdProp, shellSpawn]);

  // ─── Show / hide tabs by attaching the active session to the mount div ──

  const showTab = useCallback((tabId: string) => {
    const tab = tabsRef.current.get(tabId);
    const mount = mountRef.current;
    if (!tab || !mount || !tab.sessionId) return;
    // The hub moves the xterm's persistent DOM into the mount div.
    // Previously-mounted terminals are implicitly detached by the hub.
    TerminalHub.attach(tab.sessionId, tab.mode, mount);
    TerminalHub.focus(tab.sessionId);
  }, []);

  const createNewTab = useCallback(async () => {
    const tab = await buildTab();
    setTabIds((prev) => [...prev, tab.id]);
    setActiveTabId(tab.id);
    showTab(tab.id);
  }, [buildTab, showTab]);

  const switchTab = useCallback(
    (tabId: string) => {
      if (tabId === activeTabId) return;
      setActiveTabId(tabId);
      showTab(tabId);
    },
    [activeTabId, showTab],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      const tab = tabsRef.current.get(tabId);
      if (!tab) return;

      if (tab.sessionId) {
        if (!isAIMode) {
          void shellClose(tab.sessionId);
          TerminalHub.dispose(tab.sessionId);
        } else {
          // If the AI session is actively processing, just detach so it
          // continues in the background.  Otherwise end it.
          const session = useAISessionStore.getState().sessions.find((s) => s.id === tab.sessionId);
          if (session?.status === "active") {
            TerminalHub.detach(tab.sessionId);
          } else {
            void useAISessionStore.getState().stopSession(tab.sessionId);
            TerminalHub.detach(tab.sessionId);
          }
        }
      }
      tabsRef.current.delete(tabId);

      setTabIds((prev) => {
        const next = prev.filter((id) => id !== tabId);
        if (next.length === 0) {
          setActiveTabId(null);
          onAllTabsClosed?.();
        } else if (activeTabId === tabId) {
          const closedIdx = prev.indexOf(tabId);
          const nextActive = next[Math.max(0, closedIdx - 1)];
          setActiveTabId(nextActive);
          showTab(nextActive);
        }
        return next;
      });
    },
    [activeTabId, isAIMode, shellClose, showTab, onAllTabsClosed],
  );

  useImperativeHandle(ref, () => ({ createTab: () => { void createNewTab(); } }), [createNewTab]);

  // ─── Auto-create first tab on mount ───────────────────────────

  const initializedRef = useRef(false);
  useEffect(() => {
    if (tabIds.length === 0 && !initializedRef.current) {
      initializedRef.current = true;
      void createNewTab();
    }
  }, [tabIds.length, createNewTab]);

  // ─── Re-fit on visibility change ──────────────────────────────

  useEffect(() => {
    if (!isVisible || !activeTabId) return;
    const tab = tabsRef.current.get(activeTabId);
    if (!tab?.sessionId) return;
    const sessionId = tab.sessionId;
    const timerId = setTimeout(() => {
      TerminalHub.refitAll();
      TerminalHub.focus(sessionId);
    }, 50);
    return () => clearTimeout(timerId);
  }, [isVisible, activeTabId]);

  // ─── Cleanup on unmount ───────────────────────────────────────

  useEffect(() => {
    const aiMode = isAIMode;
    return () => {
      for (const tab of tabsRef.current.values()) {
        if (!tab.sessionId) continue;
        if (!aiMode) {
          void shellClose(tab.sessionId);
          TerminalHub.dispose(tab.sessionId);
        } else {
          // AI sessions outlive this component — just unmount the DOM.
          TerminalHub.detach(tab.sessionId);
        }
      }
      tabsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeTab = activeTabId ? tabsRef.current.get(activeTabId) : undefined;

  const copySelection = useCallback(async () => {
    if (!activeTab?.sessionId) return;
    const selected = TerminalHub.getSelection(activeTab.sessionId);
    if (!selected) return;
    try { await navigator.clipboard.writeText(selected); } catch { /* noop */ }
  }, [activeTab]);

  const pasteClipboard = useCallback(async () => {
    if (!activeTab?.sessionId) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) TerminalHub.writeInput(activeTab.sessionId, text);
    } catch { /* noop */ }
  }, [activeTab]);

  const clearTerminal = useCallback(() => {
    if (!activeTab?.sessionId) return;
    TerminalHub.clear(activeTab.sessionId);
  }, [activeTab]);

  const terminalMenuItems: ContextMenuAction[] = useMemo(() => [
    { label: "Copy", Icon: Copy, action: () => void copySelection() },
    { label: "Paste", Icon: ClipboardPaste, action: () => void pasteClipboard() },
    { label: "Clear", Icon: Eraser, separator: true, action: () => clearTerminal() },
  ], [copySelection, pasteClipboard, clearTerminal]);

  return (
    <div ref={frameRef} style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, height: "100%", minHeight: 0 }}>
      {enableTabs && tabIds.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            marginBottom: 4,
            borderBottom: "1px solid var(--color-border)",
            overflowX: "auto",
            paddingBottom: 0,
          }}
        >
          {tabIds.map((tabId, index) => {
            const tab = tabsRef.current.get(tabId);
            if (!tab) return null;
            return (
              <div
                key={tabId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  background:
                    activeTabId === tabId ? "var(--color-primary-soft)" : "transparent",
                  borderBottom: activeTabId === tabId ? "2px solid var(--color-primary)" : "none",
                  borderRight: index < tabIds.length - 1 ? "1px solid var(--color-border)" : "none",
                }}
              >
                <button
                  onClick={() => switchTab(tabId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    padding: "3px 6px",
                    background: "transparent",
                    color: activeTabId === tabId ? "var(--color-foreground-strong)" : "var(--color-foreground-muted)",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 9,
                    fontFamily,
                    fontWeight: activeTabId === tabId ? 500 : 400,
                    whiteSpace: "nowrap",
                    transition: "all 0.15s ease",
                  }}
                >
                  <Terminal size={6} strokeWidth={2} />
                  {tab.label}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tabId);
                  }}
                  style={{
                    padding: "2px 4px",
                    background: "transparent",
                    border: "none",
                    color: "var(--color-foreground-muted)",
                    cursor: "pointer",
                    fontSize: 8,
                    display: "flex",
                    alignItems: "center",
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-border)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-foreground-muted)")}
                  title="Close tab"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div
        ref={mountRef}
        className="magenta-terminal-xterm"
        onClick={() => { if (activeTab?.sessionId) TerminalHub.focus(activeTab.sessionId); }}
        onContextMenu={(event) => {
          openTerminalMenu(event);
          if (activeTab?.sessionId) TerminalHub.focus(activeTab.sessionId);
        }}
        style={{
          display: "flex",
          flexDirection: "column",
          background: THEME_BG,
          "--magenta-terminal-bg": THEME_BG,
          padding: 0,
          borderRadius: enableTabs ? 8 : 0,
          ...(maxHeight != null ? { maxHeight } : {}),
          overflow: "hidden",
          minHeight: 0,
          flex: 1,
          margin: 0,
        } as React.CSSProperties}
      />

      {terminalMenu && (
        <ContextMenu
          position={terminalMenu}
          items={terminalMenuItems}
          onClose={closeTerminalMenu}
        />
      )}
    </div>
  );
});

export const MagentaTerminal = forwardRef<MagentaTerminalHandle, MagentaTerminalProps>(
  function MagentaTerminal(props, ref): React.ReactElement {
    if (props.readonly) {
      return <MagentaTerminalReadonly {...props} />;
    }
    return <MagentaTerminalInteractive {...props} ref={ref} />;
  },
);
