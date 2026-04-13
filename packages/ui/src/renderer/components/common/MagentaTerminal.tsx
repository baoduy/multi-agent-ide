import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { Terminal } from "lucide-react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import xtermCss from "@xterm/xterm/css/xterm.css";
import stripAnsi from "strip-ansi";
import { TERMINAL_THEMES } from "../../utils/terminalThemes";
import { useTerminalStore } from "../../store/terminalStore";
import { useAISessionStore } from "../../store/aiSessionStore";

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
  fontSize?: number; // Default: 11
  fontFamily?: string; // Default: "'SF Mono', 'Fira Code', ui-monospace, monospace"
  enableTabs?: boolean; // Default: false
  /** Called when the last tab is closed (all terminals gone). */
  onAllTabsClosed?: () => void;
  /** Ref for imperative handle */
  ref?: React.Ref<MagentaTerminalHandle>;
  /** Terminal mode: "shell" (default) or "ai-agent" */
  mode?: "shell" | "ai-agent";
  /** Session ID for ai-agent mode (required when mode="ai-agent") */
  aiSessionId?: string;
  /** Provider for ai-agent mode (required when mode="ai-agent") */
  aiProvider?: "claude" | "copilot";
  /** Whether this terminal's container is currently visible. Triggers re-fit on true. */
  isVisible?: boolean;
}

// ── Dark theme (always) ──────────────────────────────────────────────────────
const THEME = TERMINAL_THEMES.dark;
const THEME_BG = THEME.background; // #282a36 for Dracula

// ── Pulse keyframe (shared by both branches) ────────────────────────────────

const PULSE_STYLE = `
  @keyframes magenta-terminal-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
`;

/** Zero-gap xterm styles: fill 100% of parent, no padding/margin anywhere */
const XTERM_SCROLLBAR_STYLE = `
  .xterm {
    width: 100% !important;
    height: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
    background-color: ${THEME_BG} !important;
  }
  .xterm-viewport {
    width: 100% !important;
    height: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
    background-color: ${THEME_BG} !important;
  }
  .xterm-screen {
    width: 100% !important;
    height: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  .xterm-helpers {
    padding: 0 !important;
    margin: 0 !important;
  }
  .xterm .xterm-viewport::-webkit-scrollbar {
    width: 4px !important;
  }
  .xterm .xterm-viewport::-webkit-scrollbar-track {
    background: transparent !important;
  }
  .xterm .xterm-viewport::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12) !important;
    border-radius: 2px !important;
  }
  .xterm .xterm-viewport::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.25) !important;
  }
  .xterm .xterm-viewport {
    scrollbar-width: thin !important;
    scrollbar-color: rgba(255, 255, 255, 0.12) transparent !important;
  }
`;

let xtermStylesInjected = false;

function ensureXtermStyles(): void {
  if (xtermStylesInjected || typeof document === "undefined") {
    return;
  }
  const style = document.createElement("style");
  style.setAttribute("data-magenta-xterm", "true");
  style.textContent = xtermCss;
  document.head.appendChild(style);
  xtermStylesInjected = true;
}

// ── Readonly branch ──────────────────────────────────────────────────────────

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

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [output]);

  return (
    <div>
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <Terminal size={12} color={THEME.foreground} strokeWidth={2} style={{ opacity: 0.6 }} />
        {label && (
          <span style={{ fontSize: 11, fontWeight: 600, color: THEME.cyan }}>
            {label}
          </span>
        )}
        {status === "running" && (
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: THEME.magenta,
              animation: "magenta-terminal-pulse 1.2s infinite",
            }}
          />
        )}
      </div>

      {/* Output area */}
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

      <style>{PULSE_STYLE}</style>
    </div>
  );
}

// ── Per-tab state ───────────────────────────────────────────────────────────

/** Each tab owns its own xterm instance, DOM container, and daemon PTY session. */
interface TabState {
  id: string;
  label: string;
  sessionId: string | null;
  xterm: XTerm;
  fitAddon: FitAddon;
  /** The persistent DOM div this tab's xterm is rendered into. */
  hostEl: HTMLDivElement;
  /** Data disposable returned by xterm.onData (keyboard input) */
  dataDisposable: { dispose: () => void };
  /** Tracks how much output has already been written to xterm */
  lastOutputLength: number;
  /** Whether "[Session closed]" has already been printed */
  sessionClosedPrinted: boolean;
}

// ── Interactive branch ───────────────────────────────────────────────────────

const MagentaTerminalInteractive = forwardRef<MagentaTerminalHandle, MagentaTerminalProps>(function MagentaTerminalInteractive({
  cwd,
  maxHeight,
  fontSize = 9,
  fontFamily = "'SF Mono', 'Fira Code', ui-monospace, monospace",
  enableTabs = true,
  onAllTabsClosed,
  mode = "shell",
  aiSessionId: aiSessionIdProp,
  isVisible = true,
}, ref): React.ReactElement {
  const isAIMode = mode === "ai-agent";

  // ── Shell mode store bindings ──
  const shellSpawn = useTerminalStore((s) => s.spawn);
  const shellWrite = useTerminalStore((s) => s.write);
  const shellResize = useTerminalStore((s) => s.resize);
  const shellClose = useTerminalStore((s) => s.close);
  const shellSessions = useTerminalStore((s) => s.sessions);
  const shellInitSubs = useTerminalStore((s) => s.initializeSubscriptions);

  // ── AI agent mode store bindings ──
  const aiSendInput = useAISessionStore((s) => s.sendInput);
  const aiResize = useAISessionStore((s) => s.resize);
  const aiLiveOutput = useAISessionStore((s) => s.liveOutput);
  const aiSessions = useAISessionStore((s) => s.sessions);
  const aiInitSubs = useAISessionStore((s) => s.initializeSubscriptions);

  // ── Unified I/O callbacks (pick based on mode) ──
  const writeSession = useCallback(
    (sessionId: string, data: string) => {
      if (isAIMode) void aiSendInput(sessionId, data);
      else void shellWrite(sessionId, data);
    },
    [isAIMode, aiSendInput, shellWrite],
  );

  const resizeSession = useCallback(
    (sessionId: string, cols: number, rows: number) => {
      if (isAIMode) void aiResize(sessionId, cols, rows);
      else void shellResize(sessionId, cols, rows);
    },
    [isAIMode, aiResize, shellResize],
  );

  const frameRef = useRef<HTMLDivElement>(null);
  /** Parent container that holds all per-tab host divs. */
  const containerRef = useRef<HTMLDivElement>(null);
  /** All tab instances, keyed by tab id for O(1) lookup. */
  const tabsRef = useRef<Map<string, TabState>>(new Map());
  /** Counter for generating unique tab labels. */
  const tabCounterRef = useRef(0);

  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [tabIds, setTabIds] = useState<string[]>([]);
  const [menuState, setMenuState] = useState<{ open: boolean; x: number; y: number }>({
    open: false,
    x: 0,
    y: 0,
  });

  // Ensure xterm styles + subscriptions once
  useEffect(() => {
    ensureXtermStyles();
    if (isAIMode) aiInitSubs();
    else shellInitSubs();
  }, [isAIMode, aiInitSubs, shellInitSubs]);

  // ── Build a new tab (xterm + PTY) ─────────────────────────────

  const buildTab = useCallback((): TabState => {
    tabCounterRef.current += 1;
    const id = `tab-${Date.now()}-${tabCounterRef.current}`;
    const label = `Terminal ${tabCounterRef.current}`;

    // Create a persistent DOM host for this tab's xterm
    const hostEl = document.createElement("div");
    hostEl.setAttribute("data-tab-id", id);
    // Start hidden; the caller will show the active tab
    hostEl.style.display = "none";
    hostEl.style.flex = "1";
    hostEl.style.minHeight = "0";
    hostEl.style.padding = "0";
    hostEl.style.margin = "0";
    hostEl.style.overflow = "hidden";

    // Append to the shared container
    containerRef.current?.appendChild(hostEl);

    const xterm = new XTerm({
      convertEol: true,
      cursorBlink: true,
      fontFamily,
      fontSize,
      lineHeight: 1.45,
      theme: THEME,
    });
    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    // The tab object — declared here so the closures below can reference it.
    const tab: TabState = {
      id,
      label,
      sessionId: null,
      xterm,
      fitAddon,
      hostEl,
      dataDisposable: { dispose: () => {} }, // replaced below
      lastOutputLength: 0,
      sessionClosedPrinted: false,
    };

    // Keyboard shortcut handler
    xterm.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;

      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const mod = isMac ? event.metaKey : event.ctrlKey;

      // Cmd/Ctrl + K: clear
      if (mod && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        xterm.clear();
        return false;
      }

      // Cmd + C (macOS): copy when selection exists
      if (isMac && event.metaKey && !event.shiftKey && event.key.toLowerCase() === "c") {
        if (xterm.hasSelection()) {
          event.preventDefault();
          void navigator.clipboard.writeText(xterm.getSelection());
          return false;
        }
        return true;
      }

      // Cmd + V / Ctrl+Shift+V: paste
      if (
        (isMac && event.metaKey && event.key.toLowerCase() === "v") ||
        (!isMac && event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "v")
      ) {
        event.preventDefault();
        void navigator.clipboard.readText().then((text) => {
          if (text && tab.sessionId) {
            void writeSession(tab.sessionId, text);
          }
        });
        return false;
      }

      return true;
    });

    // Forward keyboard input to this tab's PTY
    tab.dataDisposable = xterm.onData((data) => {
      if (tab.sessionId) {
        void writeSession(tab.sessionId, data);
      }
    });

    // Open xterm into its persistent host element
    xterm.open(hostEl);

    // Connect to session — in AI mode use the provided sessionId,
    // in shell mode spawn a new daemon PTY
    if (isAIMode && aiSessionIdProp) {
      tab.sessionId = aiSessionIdProp;
    } else {
      const resolvedCwd = cwd ?? "~";
      const cols = xterm.cols > 0 ? xterm.cols : 80;
      const rows = xterm.rows > 0 ? xterm.rows : 24;
      shellSpawn(resolvedCwd, cols, rows).then((sessionId) => {
        tab.sessionId = sessionId;
      });
    }

    tabsRef.current.set(id, tab);
    return tab;
  }, [cwd, fontFamily, fontSize, isAIMode, aiSessionIdProp, shellSpawn, writeSession]);

  // ── Show / hide tabs via CSS display ─────────────────────────

  const showTab = useCallback((tabId: string) => {
    // Hide all tabs, show the target
    for (const tab of tabsRef.current.values()) {
      tab.hostEl.style.display = tab.id === tabId ? "flex" : "none";
    }
    // Fit + focus the newly shown tab
    const tab = tabsRef.current.get(tabId);
    if (tab) {
      tab.fitAddon.fit();
      tab.xterm.focus();
    }
  }, []);

  // ── Tab actions ──────────────────────────────────────────────────

  const createNewTab = useCallback(() => {
    const tab = buildTab();
    showTab(tab.id);
    setTabIds((prev) => [...prev, tab.id]);
    setActiveTabId(tab.id);
  }, [buildTab, showTab]);

  const switchTab = useCallback(
    (tabId: string) => {
      if (tabId === activeTabId) return;
      showTab(tabId);
      setActiveTabId(tabId);
    },
    [activeTabId, showTab],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      const tab = tabsRef.current.get(tabId);
      if (!tab) return;

      // Tear down PTY + xterm for this tab (only close shell PTYs — AI sessions persist)
      if (tab.sessionId && !isAIMode) {
        void shellClose(tab.sessionId);
      }
      tab.dataDisposable.dispose();
      tab.xterm.dispose();
      // Remove the DOM element
      tab.hostEl.parentNode?.removeChild(tab.hostEl);
      tabsRef.current.delete(tabId);

      setTabIds((prev) => {
        const next = prev.filter((id) => id !== tabId);

        if (next.length === 0) {
          // All tabs closed — notify parent
          setActiveTabId(null);
          onAllTabsClosed?.();
        } else if (activeTabId === tabId) {
          // Activate a neighbour tab
          const closedIdx = prev.indexOf(tabId);
          const nextActive = next[Math.max(0, closedIdx - 1)];
          showTab(nextActive);
          setActiveTabId(nextActive);
        }

        return next;
      });
    },
    [activeTabId, isAIMode, shellClose, showTab, onAllTabsClosed],
  );

  // ── Imperative handle for parent ────────────────────────────────

  useImperativeHandle(ref, () => ({
    createTab: createNewTab,
  }), [createNewTab]);

  // ── Auto-create first tab on mount ────────────────────────────

  const initializedRef = useRef(false);
  useEffect(() => {
    // Always create the first tab on mount — shell mode needs a PTY session,
    // AI mode needs to attach to the provided sessionId.
    if (tabIds.length === 0 && !initializedRef.current) {
      initializedRef.current = true;
      createNewTab();
    }
  }, [tabIds.length, createNewTab]);

  // ── Resize observer (debounced — resizes the active xterm when container changes) ──

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let timerId: ReturnType<typeof setTimeout> | null = null;
    let prevCols = 0;
    let prevRows = 0;

    const observer = new ResizeObserver(() => {
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(() => {
        if (!activeTabId) return;
        const tab = tabsRef.current.get(activeTabId);
        if (!tab) return;
        tab.fitAddon.fit();
        const cols = tab.xterm.cols;
        const rows = tab.xterm.rows;
        if (cols === prevCols && rows === prevRows) return;
        prevCols = cols;
        prevRows = rows;
        // Send resize IPC so the PTY / AI agent knows the new dimensions
        if (tab.sessionId && cols > 0 && rows > 0) {
          void resizeSession(tab.sessionId, cols, rows);
        }
      }, 150);
    });
    observer.observe(container);
    return () => {
      if (timerId) clearTimeout(timerId);
      observer.disconnect();
    };
  }, [activeTabId, resizeSession]);

  // ── Re-fit when the terminal becomes visible (tab switch in parent) ──

  useEffect(() => {
    if (!isVisible || !activeTabId) return;
    const tab = tabsRef.current.get(activeTabId);
    if (!tab) return;
    // Delay slightly to allow the DOM to lay out after visibility change
    const timerId = setTimeout(() => {
      tab.fitAddon.fit();
      tab.xterm.focus();
      // Only send resize IPC for shell terminals — AI sessions (Claude Code)
      // re-draw their output on resize which causes duplicate/garbled text.
      if (!isAIMode && tab.sessionId) {
        const cols = tab.xterm.cols;
        const rows = tab.xterm.rows;
        if (cols > 0 && rows > 0) {
          void resizeSession(tab.sessionId, cols, rows);
        }
      }
    }, 50);
    return () => clearTimeout(timerId);
  }, [isVisible, activeTabId, isAIMode, resizeSession]);

  // ── Stream store output → each tab's xterm ────────────────────

  useEffect(() => {
    for (const tab of tabsRef.current.values()) {
      if (!tab.sessionId) continue;

      let output: string;
      let ended: boolean;

      if (isAIMode) {
        output = aiLiveOutput[tab.sessionId] ?? "";
        const rec = aiSessions.find((s) => s.id === tab.sessionId);
        ended = rec?.status === "exited";
      } else {
        const session = shellSessions[tab.sessionId];
        if (!session) continue;
        output = session.output;
        ended = session.status === "closed";
      }

      // Incremental write
      const prev = tab.lastOutputLength;
      const chunk = output.length >= prev ? output.slice(prev) : output;
      if (chunk) {
        tab.xterm.write(chunk);
      }
      tab.lastOutputLength = output.length;

      // Session ended message
      if (ended && !tab.sessionClosedPrinted) {
        tab.xterm.write("\r\n[Session ended]\r\n");
        tab.sessionClosedPrinted = true;
      }
    }
  }, [isAIMode, shellSessions, aiLiveOutput, aiSessions]);

  // ── Cleanup all tabs on unmount ───────────────────────────────

  useEffect(() => {
    // Capture current mode in closure — stable for the component's lifetime
    const aiMode = isAIMode;
    return () => {
      for (const tab of tabsRef.current.values()) {
        // Only close shell PTYs — AI sessions persist outside this component
        if (tab.sessionId && !aiMode) {
          void shellClose(tab.sessionId);
        }
        tab.dataDisposable.dispose();
        tab.xterm.dispose();
        tab.hostEl.parentNode?.removeChild(tab.hostEl);
      }
      tabsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Context menu close on outside click ───────────────────────

  useEffect(() => {
    if (!menuState.open) return;
    const handler = () => setMenuState((prev) => ({ ...prev, open: false }));
    document.addEventListener("mousedown", handler);
    window.addEventListener("blur", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("blur", handler);
    };
  }, [menuState.open]);

  // ── Render ────────────────────────────────────────────────────

  const activeTab = activeTabId ? tabsRef.current.get(activeTabId) : undefined;

  const copySelection = useCallback(async () => {
    const selected = activeTab?.xterm.getSelection() ?? "";
    if (!selected) return;
    try { await navigator.clipboard.writeText(selected); } catch { /* noop */ }
  }, [activeTab]);

  const pasteClipboard = useCallback(async () => {
    if (!activeTab?.sessionId) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) void writeSession(activeTab.sessionId, text);
    } catch { /* noop */ }
  }, [activeTab, writeSession]);

  const clearTerminal = useCallback(() => {
    activeTab?.xterm.clear();
  }, [activeTab]);

  return (
    <div ref={frameRef} style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, height: "100%", minHeight: 0 }}>
      {/* Tab bar (if enabled and tabs exist) */}
      {enableTabs && tabIds.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            marginBottom: 4,
            borderBottom: "1px solid #e5e2da",
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
                    activeTabId === tabId
                      ? "rgba(193, 95, 60, 0.08)"
                      : "transparent",
                  borderBottom: activeTabId === tabId ? "2px solid #c15f3c" : "none",
                  borderRight: index < tabIds.length - 1 ? "1px solid #e5e2da" : "none",
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
                    color: activeTabId === tabId ? "#383a42" : "#9a958c",
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
                    color: "#9a958c",
                    cursor: "pointer",
                    fontSize: 8,
                    display: "flex",
                    alignItems: "center",
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#d1cec6")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#9a958c")}
                  title="Close tab"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/*
        Container that holds ALL per-tab xterm host divs.
        Each tab's hostEl is appended here imperatively.
        Only the active tab has display:block; the rest are display:none.
        This keeps every xterm's DOM intact so sessions continue running.
      */}
      <div
        ref={containerRef}
        onClick={() => activeTab?.xterm.focus()}
        onContextMenu={(event) => {
          event.preventDefault();
          const frame = frameRef.current;
          if (!frame) return;
          const rect = frame.getBoundingClientRect();
          setMenuState({
            open: true,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
          activeTab?.xterm.focus();
        }}
        style={{
          display: "flex",
          flexDirection: "column",
          background: THEME_BG,
          padding: 0,
          borderRadius: enableTabs ? 8 : 0,
          ...(maxHeight != null ? { maxHeight } : {}),
          overflow: "hidden",
          minHeight: 0,
          flex: 1,
          margin: 0,
        }}
      />

      {menuState.open && (
        <div
          style={{
            position: "absolute",
            top: menuState.y,
            left: menuState.x,
            zIndex: 20,
            minWidth: 140,
            background: "#252526",
            border: "1px solid #3c3c3c",
            borderRadius: 6,
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
            padding: 4,
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              void copySelection();
              setMenuState({ open: false, x: 0, y: 0 });
            }}
            style={menuButtonStyle}
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => {
              void pasteClipboard();
              setMenuState({ open: false, x: 0, y: 0 });
            }}
            style={menuButtonStyle}
          >
            Paste
          </button>
          <button
            type="button"
            onClick={() => {
              clearTerminal();
              setMenuState({ open: false, x: 0, y: 0 });
            }}
            style={menuButtonStyle}
          >
            Clear
          </button>
        </div>
      )}

      <style>{PULSE_STYLE}{XTERM_SCROLLBAR_STYLE}</style>
    </div>
  );
});

const menuButtonStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  borderRadius: 4,
  background: "transparent",
  color: "#d4d4d4",
  textAlign: "left",
  padding: "6px 8px",
  fontSize: 12,
  cursor: "pointer",
};

// ── Public dispatcher ────────────────────────────────────────────────────────

export const MagentaTerminal = forwardRef<MagentaTerminalHandle, MagentaTerminalProps>(
  function MagentaTerminal(props, ref): React.ReactElement {
    if (props.readonly) {
      return <MagentaTerminalReadonly {...props} />;
    }
    return <MagentaTerminalInteractive {...props} ref={ref} />;
  },
);
