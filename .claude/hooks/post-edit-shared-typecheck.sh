#!/usr/bin/env bash
# PostToolUse hook: when packages/shared/src/ipc.ts (or anything else under
# packages/shared/src/) is edited, run a workspace-wide typecheck. Shared is
# the IPC contract source — drift here is the #1 cause of daemon/renderer
# desync in this codebase.
#
# We deliberately do NOT run typecheck on every edit — only on shared edits.
# Other package edits are left to the user's manual verification flow per
# feedback_verification.md.

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

case "$file_path" in
  */packages/shared/src/*)
    ;;
  *)
    exit 0
    ;;
esac

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"

if ! command -v pnpm >/dev/null 2>&1; then
  exit 0
fi

# Run recursive typecheck. Capture output; only surface it on failure to keep
# the success path quiet.
if output="$(pnpm -r typecheck 2>&1)"; then
  echo "[hook] shared/ edit OK — pnpm -r typecheck passed"
  exit 0
else
  >&2 echo "[hook] shared/ edit triggered pnpm -r typecheck — FAILED"
  >&2 echo "$output" | tail -n 40
  exit 2
fi
