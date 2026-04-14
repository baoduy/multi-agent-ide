/**
 * LogViewer — displays today's application log file with auto-scroll to bottom.
 * Supports periodic refresh and color-coded log levels.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { readLog } from "../../utils/ipc";
import { colors } from "../../utils/colors";

const LOG_LEVEL_COLORS: Record<string, string> = {
  ERROR: colors.error,
  CRASH: colors.error,
  WARN: colors.warningTextStrong,
  INFO: colors.textTertiary,
};

function getLineColor(line: string): string {
  for (const [level, color] of Object.entries(LOG_LEVEL_COLORS)) {
    if (line.includes(`[${level}]`)) return color;
  }
  return colors.textSecondary;
}

export function LogViewer(): React.ReactElement {
  const [content, setContent] = useState("");
  const [logPath, setLogPath] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const fetchLog = useCallback(async () => {
    const result = await readLog();
    setContent(result.content);
    setLogPath(result.path);
    setIsLoading(false);

    // Auto-scroll if user was at the bottom
    if (isAtBottomRef.current) {
      requestAnimationFrame(scrollToBottom);
    }
  }, [scrollToBottom]);

  // Initial load + periodic refresh every 5 seconds
  useEffect(() => {
    fetchLog();
    const interval = setInterval(fetchLog, 5000);
    return () => clearInterval(interval);
  }, [fetchLog]);

  // Track whether user is scrolled to the bottom
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 30;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  const lines = content ? content.split("\n") : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: colors.bgSurface }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 8px",
          borderBottom: `1px solid ${colors.border}`,
          fontSize: 11,
          color: colors.textTertiary,
          flexShrink: 0,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {logPath || "Application Log"}
        </span>
        <button
          type="button"
          onClick={() => { fetchLog(); requestAnimationFrame(scrollToBottom); }}
          title="Refresh log"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 6px",
            borderRadius: 3,
            border: "none",
            background: "transparent",
            color: colors.textTertiary,
            cursor: "pointer",
            fontSize: 11,
          }}
        >
          <RefreshCw size={11} />
          Refresh
        </button>
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflow: "auto",
          padding: "4px 8px",
          fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
          fontSize: 11,
          lineHeight: 1.5,
          whiteSpace: "pre",
          tabSize: 2,
        }}
      >
        {isLoading ? (
          <span style={{ color: colors.textTertiary }}>Loading log...</span>
        ) : lines.length === 0 ? (
          <span style={{ color: colors.textTertiary }}>No log entries for today.</span>
        ) : (
          lines.map((line, i) => (
            <div key={i} style={{ color: getLineColor(line), minHeight: "1em" }}>
              {line || "\u00A0"}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
