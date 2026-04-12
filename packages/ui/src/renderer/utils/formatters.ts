/**
 * Formats a timestamp to relative time (e.g. "just now", "5m ago", "2h ago", "3d ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - timestamp);

  if (diff < 60 * 1000) return "just now";

  if (diff < 60 * 60 * 1000) {
    const mins = Math.floor(diff / (60 * 1000));
    return `${mins}m ago`;
  }

  if (diff < 24 * 60 * 60 * 1000) {
    const hrs = Math.floor(diff / (60 * 60 * 1000));
    return `${hrs}h ago`;
  }

  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  return `${days}d ago`;
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

/**
 * Extracts a short display name from a file path.
 * "/Users/steven/_CODE/GIT/multi-agent-ide" -> "multi-agent-ide"
 * "-Users-steven--CODE-GIT-multi-agent-ide" -> "multi-agent-ide"
 */
export function extractDisplayName(pathStr: string): string {
  if (pathStr === "unknown") return "Other Sessions";

  // Handle Claude Code project dir names (hyphenated paths)
  if (pathStr.startsWith("-")) {
    const parts = pathStr.split("--");
    return parts[parts.length - 1].replace(/-/g, " ").trim() || pathStr;
  }

  // Normal file path - take last segment
  const segments = pathStr.replace(/\\/g, "/").split("/").filter(Boolean);
  return segments[segments.length - 1] || pathStr;
}
