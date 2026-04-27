#!/usr/bin/env bash
# PreToolUse hook: block direct edits to lock files and node_modules.
# Reads the Claude Code hook JSON payload from stdin, extracts the file_path
# from tool_input, and exits with code 2 (blocking) if it points at a protected
# location.

set -euo pipefail

payload="$(cat)"

file_path="$(printf '%s' "$payload" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
ti = data.get("tool_input", {}) or {}
print(ti.get("file_path") or ti.get("path") or "", end="")
' 2>/dev/null || true)"

if [ -z "$file_path" ]; then
  exit 0
fi

basename="${file_path##*/}"

case "$basename" in
  pnpm-lock.yaml|package-lock.json|yarn.lock|bun.lockb|Cargo.lock|poetry.lock|uv.lock)
    >&2 echo "blocked: do not edit $basename by hand. Run the package manager (e.g. \`pnpm add\`, \`pnpm install\`) so native modules (node-pty, lmdb) get rebuilt for Electron's ABI."
    exit 2
    ;;
esac

case "$file_path" in
  *"/node_modules/"*)
    >&2 echo "blocked: refusing to edit files under node_modules ($file_path). Patch the source package or use a workspace override."
    exit 2
    ;;
esac

exit 0
