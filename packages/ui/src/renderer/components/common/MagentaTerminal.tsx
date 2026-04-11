import React, { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "lucide-react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import xtermCss from "@xterm/xterm/css/xterm.css";
import stripAnsi from "strip-ansi";
import { TERMINAL_THEMES } from "../../utils/terminalThemes";
import { useTerminalStore } from "../../store/terminalStore";

export type MagentaTerminalStatus = "idle" | "running" | "done" | "canceled" | "error";

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
}

// ── Dark theme (always) ──────────────────────────────────────────────────────
const THEME = TERMINAL_THEMES.dark;

// ── Pulse keyframe (shared by both branches) ────────────────────────────────

const PULSE_STYLE = `
  @keyframes magenta-terminal-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
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

// ── Interactive branch ───────────────────────────────────────────────────────

function MagentaTerminalInteractive({
  cwd,
  maxHeight = 300,
  fontSize = 9,
  fontFamily = "'SF Mono', 'Fira Code', ui-monospace, monospace",
  enableTabs = true,
}: MagentaTerminalProps): React.ReactElement {
  const spawn = useTerminalStore((s) => s.spawn);
  const write = useTerminalStore((s) => s.write);
  const resize = useTerminalStore((s) => s.resize);
  const close = useTerminalStore((s) => s.close);
  const sessions = useTerminalStore((s) => s.sessions);
  const initSubs = useTerminalStore((s) => s.initializeSubscriptions);

  const sessionIdRef = useRef<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastOutputLengthRef = useRef(0);
  const sessionClosedPrintedRef = useRef(false);
  const [menuState, setMenuState] = useState<{ open: boolean; x: number; y: number }>({
    open: false,
    x: 0,
    y: 0,
  });
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [tabList, setTabList] = useState<Array<{ id: string; label: string }>>(
    []
  );

  const session = sessionIdRef.current ? sessions[sessionIdRef.current] : undefined;

  const copySelection = useCallback(async () => {
    const term = xtermRef.current;
    const selected = term?.getSelection() ?? "";
    if (!selected) {
      return;
    }
    try {
      await navigator.clipboard.writeText(selected);
    } catch {
      // Clipboard may be unavailable in some environments.
    }
  }, []);

  const pasteClipboard = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        return;
      }
      void write(sessionId, text);
    } catch {
      // Clipboard may be unavailable in some environments.
    }
  }, [write]);

  const clearTerminal = useCallback(() => {
    xtermRef.current?.clear();
  }, []);

  // Tab management
  const createNewTab = useCallback(() => {
    if (!enableTabs) return;
    const tabId = `tab-${Date.now()}`;
    setTabList((prev) => [...prev, { id: tabId, label: `Terminal ${prev.length + 1}` }]);
    setActiveTabId(tabId);
  }, [enableTabs]);

  const switchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const closeTab = useCallback(
    (tabId: string) => {
      if (!enableTabs) return;
      setTabList((prev) => prev.filter((t) => t.id !== tabId));
      if (activeTabId === tabId) {
        const remaining = tabList.filter((t) => t.id !== tabId);
        setActiveTabId(remaining.length > 0 ? remaining[0].id : null);
      }
    },
    [enableTabs, activeTabId, tabList]
  );

  // Initialize first tab on mount if tabs enabled
  useEffect(() => {
    if (enableTabs && tabList.length === 0) {
      createNewTab();
    }
  }, [enableTabs, tabList.length, createNewTab]);

  // Initialize subscriptions and spawn session on mount
  useEffect(() => {
    ensureXtermStyles();
    initSubs();

    const term = new XTerm({
      convertEol: true,
      cursorBlink: true,
      fontFamily,
      fontSize,
      lineHeight: 1.45,
      theme: THEME,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    if (hostRef.current) {
      term.open(hostRef.current);
      fitAddon.fit();
      term.focus();
    }

    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") {
        return true;
      }

      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const mod = isMac ? event.metaKey : event.ctrlKey;

      // Cmd/Ctrl + K: clear terminal viewport
      if (mod && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        clearTerminal();
        return false;
      }

      // Cmd + C (macOS): copy only when a selection exists; otherwise allow SIGINT behavior
      if (isMac && event.metaKey && !event.shiftKey && event.key.toLowerCase() === "c") {
        if (term.hasSelection()) {
          event.preventDefault();
          void copySelection();
          return false;
        }
        return true;
      }

      // Cmd + V (macOS) OR Ctrl + Shift + V (Linux/Windows): paste
      if ((isMac && event.metaKey && event.key.toLowerCase() === "v") || (!isMac && event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "v")) {
        event.preventDefault();
        void pasteClipboard();
        return false;
      }

      return true;
    });

    term.write("Connecting...\r\n");

    const dataDisposable = term.onData((data) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return;
      }
      void write(sessionId, data);
    });

    const observer = new ResizeObserver(() => {
      const sessionId = sessionIdRef.current;
      const fit = fitAddonRef.current;
      if (!fit || !xtermRef.current) {
        return;
      }
      fit.fit();
      const cols = xtermRef.current.cols;
      const rows = xtermRef.current.rows;
      if (sessionId && cols > 0 && rows > 0) {
        void resize(sessionId, cols, rows);
      }
    });
    if (hostRef.current) {
      observer.observe(hostRef.current);
    }

    const resolvedCwd = cwd ?? "~";
    const initialCols = term.cols > 0 ? term.cols : 80;
    const initialRows = term.rows > 0 ? term.rows : 24;
    spawn(resolvedCwd, initialCols, initialRows).then((id) => {
      sessionIdRef.current = id;
    });

    return () => {
      observer.disconnect();
      dataDisposable.dispose();
      if (sessionIdRef.current) {
        void close(sessionIdRef.current);
      }
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!menuState.open) {
      return;
    }

    const close = () => setMenuState((prev) => ({ ...prev, open: false }));
    document.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
    };
  }, [menuState.open]);

  // Write only incremental output chunks to xterm
  useEffect(() => {
    const term = xtermRef.current;
    if (!term || !session) {
      return;
    }

    const next = session.output;
    const previousLength = lastOutputLengthRef.current;
    const chunk =
      next.length >= previousLength
        ? next.slice(previousLength)
        : next;

    if (chunk) {
      term.write(chunk);
    }

    lastOutputLengthRef.current = next.length;
  }, [session?.output]);

  // Reset incremental cursor when a new session appears
  useEffect(() => {
    lastOutputLengthRef.current = 0;
    sessionClosedPrintedRef.current = false;
  }, [session?.sessionId]);

  useEffect(() => {
    if (session?.status !== "closed" || sessionClosedPrintedRef.current) {
      return;
    }
    xtermRef.current?.write("\r\n[Session closed]\r\n");
    sessionClosedPrintedRef.current = true;
  }, [session?.status]);

  return (
    <div ref={frameRef} style={{ position: "relative" }}>
      {/* Tab bar (if enabled) */}
      {enableTabs && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            marginBottom: 8,
            borderBottom: `1px solid ${THEME.brightBlack}`,
            overflowX: "auto",
            paddingBottom: 0,
          }}
        >
          {tabList.map((tab) => (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                background: activeTabId === tab.id ? THEME.brightBlack : "transparent",
                color: activeTabId === tab.id ? THEME.foreground : THEME.brightBlack,
                border: "none",
                borderBottom: activeTabId === tab.id ? `2px solid ${THEME.cyan}` : "none",
                cursor: "pointer",
                fontSize: 12,
                fontFamily,
                whiteSpace: "nowrap",
                transition: "all 0.2s ease",
              }}
            >
              <Terminal size={10} />
              {tab.label}
              {tabList.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  style={{
                    marginLeft: 4,
                    background: "transparent",
                    border: "none",
                    color: "inherit",
                    cursor: "pointer",
                    fontSize: 12,
                    padding: 0,
                  }}
                >
                  ✕
                </button>
              )}
            </button>
          ))}
          <button
            onClick={createNewTab}
            style={{
              marginLeft: 8,
              padding: "6px 12px",
              background: "transparent",
              border: "none",
              color: THEME.green,
              cursor: "pointer",
              fontSize: 12,
              fontFamily,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
            title="New terminal"
          >
            +
          </button>
        </div>
      )}

      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <Terminal size={12} color="#9a958c" strokeWidth={2} />
        <span style={{ fontSize: 11, fontWeight: 600, color: "#6b6560" }}>Terminal</span>
        {session?.status === "active" && (
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#4ade80",
            }}
          />
        )}
      </div>

      {/* Unified terminal surface */}
      <div
        ref={hostRef}
        onClick={() => xtermRef.current?.focus()}
        onContextMenu={(event) => {
          event.preventDefault();
          const frame = frameRef.current;
          if (!frame) {
            return;
          }
          const rect = frame.getBoundingClientRect();
          setMenuState({
            open: true,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
          xtermRef.current?.focus();
        }}
        style={{
          background: "#1e1e1e",
          padding: 12,
          borderRadius: 8,
          maxHeight,
          overflowY: "auto",
          minHeight: 120,
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

      <style>{PULSE_STYLE}</style>
    </div>
  );
}

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

export function MagentaTerminal(props: MagentaTerminalProps): React.ReactElement {
  if (props.readonly) {
    return <MagentaTerminalReadonly {...props} />;
  }
  return <MagentaTerminalInteractive {...props} />;
}
