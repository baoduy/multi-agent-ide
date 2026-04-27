## Security Findings

### 🔴 Critical / SECURITY
**File**: packages/main/src/index.ts (line 413)
**Issue**: The main process forwards all renderer IPC requests through `magenta:ipc` without validating sender context (`_event` is unused). If renderer-side script execution is compromised, attacker code can invoke the full daemon IPC surface.
**Fix**: Validate sender before forwarding: check `event.sender.id` against the trusted BrowserWindow `webContents.id` and verify `event.senderFrame.url` matches expected app origin/path.

### 🟡 Warning / SECURITY
**File**: packages/e2e/scripts/debug-electron.ts (line 169)
**Issue**: Debug command path executes arbitrary expressions with `new Function(...)`. This is test tooling, but still a high-risk primitive if accidentally exposed or reused outside local-only workflows.
**Fix**: Keep `eval` command disabled by default, gate behind explicit env flag + local auth token, and prefer a strict command whitelist over arbitrary evaluation.

### 🟢 Suggestion / SECURITY
**File**: packages/ui/src/renderer/components/main/MermaidDiagram.tsx (line 36)
**Issue**: Rendered SVG is assigned via `wrapper.innerHTML = svg`. Mermaid strict mode reduces risk, but direct HTML assignment remains a sensitive sink.
**Fix**: Keep `securityLevel: "strict"`, and add a defense-in-depth sanitization step or explicit allowlist validation before assigning SVG to `innerHTML`.

## Architecture Findings

### 🟡 Warning / ARCH
**File**: packages/daemon/src/ipc/registerHandlers.ts (line 164)
**Issue**: IPC registration still constructs infrastructure gateways (`GitOperationsGateway`, `GitCloneGateway`, `GitHistoryGateway`, `GitStashRemoteGateway`) inside the handler registration module. This increases adapter-layer coupling and weakens composition-root ownership.
**Fix**: Construct gateways/services in the daemon composition root and inject them via `HandlerContext`, keeping `registerHandlers` as thin wiring only.

## Cleanup Findings

### 🟢 Suggestion / CLEANUP
**File**: packages/ui/src/renderer/components/main/MarkdownTableOfContents.tsx (line 2)
**Issue**: File is explicitly marked orphaned and contains only `export {}`.
**Fix**: Delete the file and keep `MarkdownTocPanel` as the single TOC implementation.

## Summary
1. Total findings by severity: 1 critical, 2 warnings, 2 suggestions.
2. Top 3 recommended actions:
   - Add sender/frame validation to `magenta:ipc` in main process first.
   - Move gateway construction out of `registerHandlers` into the composition root.
   - Disable or strongly gate debug `eval` command in e2e tooling.
3. Follow-up reviews recommended:
   - Focused Electron hardening pass after IPC sender checks are added.
   - Dead-code cleanup pass for deprecated UI files in renderer components.
