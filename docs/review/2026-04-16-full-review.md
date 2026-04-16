# Full Codebase Review — 2026-04-16

**Scope**: Architecture · Security · Code Quality · Dead Code Cleanup  
**Reviewed by**: arch.review agent  
**Date**: 2026-04-16

---

## Architecture Findings

### 🟢 Suggestion — ARCH
**File**: `packages/daemon/src/ipc/handlers/` (all handler files)  
**Issue**: Handler files are consistently thin — they call `safeHandle(bridge, type, ...)`, delegate to the relevant `ApplicationService`, and return a typed response. The pattern is correctly followed across all 11 handler modules.  
**Fix**: No change required. Mark as ✅ compliant.

---

### 🟢 Suggestion — ARCH
**File**: `packages/daemon/src/DaemonContainer.ts`  
**Issue**: `DaemonContainer` is a single composition root that wires all infrastructure, services, and IPC handlers together. All class constructors follow the class-first OOP discipline.  
**Fix**: No change required. Mark as ✅ compliant.

---

### 🟢 Suggestion — ARCH
**File**: `packages/ui/src/renderer/services/SessionCoordinator.ts`  
**Issue**: Cross-store operations (`selectRepo`, `selectSpec`, `restoreSession`, `validateSpecSelection`) are correctly delegated through `SessionCoordinator` instead of being scattered across individual stores or component event handlers. Only two stores (`repoStore`, `specStore`, `sessionStore`) are touched by coordinators — not raw Zustand `set` calls from multiple components.  
**Fix**: No change required. Mark as ✅ compliant.

---

### 🟡 Warning — ARCH
**File**: `packages/daemon/src/services/ScanQueue.ts` (line ~101)  
**Issue**: `ScanQueue.setSpecSyncService()` is a post-constructor setter used to break a circular dependency (`ScanQueue ↔ SpecSyncService`). While this solves the build-time problem, it creates a window where `ScanQueue` exists in a partially-initialised state — if `runScan` is called before `setSpecSyncService`, `this.specSyncService` is undefined and the guard inside `runScan` silently skips spec-sync.  
**Fix**: Extract a `ScanOrchestrator` class that receives both `ScanQueue` and `SpecSyncService` already fully constructed, or pass `SpecSyncService` as an optional constructor arg. Either approach removes the mutable setter.

---

### 🟡 Warning — ARCH
**File**: `packages/daemon/src/application/AISessionApplicationService.ts`  
**Issue**: `AISessionApplicationService` directly reads filesystem paths via `fs`, `os.homedir()`, and `path` to resolve working directories, rather than delegating to a `FileSystemGateway` or similar infrastructure seam. This means filesystem access can't easily be injected or mocked in tests.  
**Fix**: Extract filesystem path resolution into the existing `FileSystemGateway`, or add a `resolveSessionWorkDir()` method to `sessionCwdResolver.ts` that returns a path without reading the FS, so the service only calls `fs.mkdir` once the CWD is resolved.

---

### 🟡 Warning — ARCH
**File**: `packages/daemon/src/services/RepoRepository.ts`  
**Issue**: `RepoRepository.upsert()` does **not** call `flush()` — callers are responsible for flushing after every upsert. `ScanQueue` and `RepoApplicationService` both call `flush()` correctly, but any new caller could easily miss it. This is a footgun in the current design.  
**Fix**: Add a `upsertAndFlush()` convenience method (or always flush in `upsert()`), and audit every `upsert()` call site to confirm it is followed by `flush()`. A `// MUST call flush() after this` comment on the public `upsert()` signature at minimum.

---

## Security Findings

### 🟢 Suggestion — SECURITY
**File**: `packages/main/src/index.ts` (line ~172)  
**Issue**: `BrowserWindow` is created with `contextIsolation: true` and `nodeIntegration: false`. ✅  
**Fix**: No change required.

---

### 🟢 Suggestion — SECURITY
**File**: `packages/main/src/preload.ts`  
**Issue**: Preload exposes only a narrow, typed `magentaIpc` surface via `contextBridge`. No Node.js globals are leaked. All IPC calls are typed at the `IpcRequest`/`IpcResponse` level. ✅  
**Fix**: No change required.

---

### 🟢 Suggestion — SECURITY
**File**: `packages/shared/src/ipc.ts` (lines ~82–100)  
**Issue**: `aiAgent` parameters are restricted to `/^[a-z0-9_-]+$/` (no shell metacharacters). `gitfile:read` `ref` and `relativePath` are validated with regex and path-traversal guards respectively. ✅  
**Fix**: No change required.

---

### 🟢 Suggestion — SECURITY
**File**: `packages/daemon/src/domain/pathGuard.ts`  
**Issue**: `resolveAndAssert()` correctly canonicalises paths with `path.resolve()` and checks containment using `startsWith(root + path.sep)` — avoiding the `/work/repo-private` matching `/work/repo` prefix trap. ✅  
**Fix**: No change required.

---

### 🔴 Critical — SECURITY
**File**: `packages/main/renderer/index.html` (line 8)  
**Issue**: No `Content-Security-Policy` meta tag is present. The renderer loads all scripts, styles, and web content without a CSP. Any XSS in rendered content (e.g., markdown-rendered spec files via `react-markdown`) has no browser-level policy preventing exfiltration or IPC abuse.  
**Fix**: Add a `<meta http-equiv="Content-Security-Policy">` with at minimum:
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  connect-src 'none';
  object-src 'none';
">
```
Note: `unsafe-inline` for scripts is required by the inline theme-detection snippet (line 8–15). To harden further, extract that snippet into a separate `.js` file and remove `unsafe-inline`.

---

### 🔴 Critical — SECURITY
**File**: `packages/main/src/index.ts`  
**Issue**: `sandbox: true` is not explicitly set in `webPreferences`. Without sandboxing, the renderer process has access to Chromium's native APIs beyond the normal renderer sandbox. Electron docs recommend `sandbox: true` combined with a preload.  
**Fix**: Add `sandbox: true` to the `webPreferences` block:
```typescript
webPreferences: {
  preload: path.join(__dirname, "preload.js"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
},
```
Verify the preload doesn't rely on Node.js APIs directly — if it does, those calls must be forwarded to the main process.

---

### 🟡 Warning — SECURITY
**File**: `packages/main/src/index.ts` (line ~250)  
**Issue**: DevTools are not explicitly restricted to development mode. Currently no `openDevTools()` call exists, which is fine, but there is no explicit guard preventing `mainWindow.webContents.openDevTools()` from being callable in a packaged build.  
**Fix**: Add a guard to prevent devTools in production if you ever add debugging shortcuts:
```typescript
if (!app.isPackaged) {
  mainWindow.webContents.openDevTools();
}
```

---

### 🟡 Warning — SECURITY
**File**: `packages/main/src/index.ts` (line ~450 in `registerIpcHandler`)  
**Issue**: The `magenta:ipc` handler passes `request` from the renderer to the daemon without validating it is an object first (`request?.type ?? "unknown"` suggests it might not be). Malformed payloads (e.g., `null`, an array, a string) flow into `IPCBridge.invoke()` which does call `IpcRequestSchema.parse()` — but there is no early reject before forwarding to the daemon child process.  
**Fix**: Add an early guard:
```typescript
ipcMain.handle("magenta:ipc", async (_event, request) => {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return { type: "error", message: "Invalid IPC request shape" };
  }
  // ...
});
```

---

### 🟡 Warning — SECURITY
**File**: `packages/main/renderer/index.html` (line 8–15)  
**Issue**: An inline `<script>` block runs before page load to detect theme preference. This is a deliberate pattern, but it prevents a strict CSP (because `unsafe-inline` must be allowed for scripts). Theme preference is stored in `localStorage` which is renderer-accessible.  
**Fix**: Move the inline script to a separate `theme-init.js` file and load it with a `nonce` or `sha256` hash in the CSP, or simply allow the minimal FOUC that occurs without it — the trade-off depends on product priorities.

---

## Code Quality Findings

### 🔴 Critical — QUALITY (build risk)
**File**: `packages/ui/package.json`  
**Issue**: `strip-ansi` is declared as `^7.2.0` (ESM-only). The `copilot-instructions.md` documents that **`strip-ansi@6.0.1` must be used (CJS)** because the daemon runs in a Node.js/Electron context. The UI also imports `strip-ansi` in `MagentaTerminal.tsx` — if the renderer bundle resolves v7 it is fine (esbuild handles ESM), but the version mismatch between declared versions is a maintenance hazard.  
**Fix**: Pin UI to `"strip-ansi": "6.0.1"` to stay consistent with the project's documented requirement:
```json
"strip-ansi": "6.0.1"
```

---

### 🟡 Warning — QUALITY
**File**: `packages/ui/src/renderer/components/common/ButtonGroup.tsx`  
**File**: `packages/ui/src/renderer/components/ui/button-group.tsx`  
**Issue**: Two separate `ButtonGroup` components exist in the same package:
- `components/common/ButtonGroup.tsx` — a segmented toggle group with controlled `value`/`onChange` (used by `NewSessionDialog`)
- `components/ui/button-group.tsx` — a shadcn-style layout container (used by `TitleBar`)

These serve different purposes (selection control vs layout container) but share the same name, which creates confusion for developers adding new UI. The `components/ui/button-group.tsx` has no export of `ButtonGroupOption` type, so the two cannot be trivially merged, but the naming is ambiguous.  
**Fix**: Rename `components/common/ButtonGroup.tsx` to `SegmentedControl.tsx` (or `ToggleButtonGroup.tsx`) to clearly differentiate the controlled toggle behaviour from the layout container in `ui/button-group.tsx`.

---

### 🟡 Warning — QUALITY
**File**: `packages/ui/package.json`  
**Issue**: The following dependencies are declared but have **zero import statements** in `packages/ui/src/`:
- `antd` — no `from "antd"` anywhere in source
- `allotment` — no `from "allotment"` anywhere in source
- `radix-ui` / `@radix-ui/*` — no imports found (shadcn components use inline primitives)
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` — no imports; the drag hook comment notes "we'll integrate later"

These add weight to the bundle and create attack surface.  
**Fix**: Remove the unused dependencies:
```diff
- "antd": "^6.3.5",
- "allotment": "^1.20.5",
- "radix-ui": "^1.4.3",
- "@dnd-kit/core": "^6.3.1",
- "@dnd-kit/sortable": "^10.0.0",
- "@dnd-kit/utilities": "^3.2.2",
```

---

### 🟡 Warning — QUALITY
**File**: `packages/ui/src/renderer/utils/ipc.ts` (line ~21)  
**Issue**: `selectFolder()` contains a `window.prompt()` fallback for non-Electron environments. `window.prompt()` is a deprecated synchronous blocking API that most browsers suppress in modern contexts (it's a no-op in many). This path can never legitimately succeed in production.  
**Fix**: Remove the `window.prompt()` fallback entirely and return `null` with a log warning instead:
```typescript
if (!ipcAvailable() || typeof window.magentaIpc.selectFolder !== "function") {
  console.warn("[ipc] selectFolder not available — running outside Electron");
  return null;
}
```

---

### 🟢 Suggestion — QUALITY
**File**: `packages/ui/src/renderer/store/viewSearchStore.ts`  
**Issue**: `useViewSearchStore` stores per-view search queries in a `Record<string, string>`. It is used correctly across UI components. No orphaned slices detected.  
**Fix**: No change required. ✅

---

### 🟢 Suggestion — QUALITY
**File**: `packages/daemon/src/application/TerminalApplicationService.ts` (lines 1–14)  
**Issue**: `buildPtyEnv()` is a module-level function (not a class method), which is a mild deviation from the class-first OOP guideline. However, it is a pure utility with no external dependencies and is only used inside `TerminalApplicationService`, so this is a very minor pattern divergence.  
**Fix**: Move `buildPtyEnv()` to a private static method on `TerminalApplicationService` for strict OOP compliance:
```typescript
private static buildPtyEnv(): Record<string, string> { ... }
```

---

### 🟢 Suggestion — QUALITY
**File**: `packages/daemon/src/ipc/createHandler.ts` (line ~35)  
**Issue**: `createHandler.ts` re-declares a local `interface IPCBridge` at the bottom of the file (instead of importing from `./IPCBridge`), likely to avoid a circular import. This can cause type drift if the real `IPCBridge.handle()` signature changes.  
**Fix**: Import the type directly:
```typescript
import type { IPCBridge } from "./IPCBridge";
```
If there's a circular import risk, restructure the `safeHandle` helper to accept a `handle` function callback instead.

---

## Summary

| Severity | Count | Category |
|----------|-------|----------|
| 🔴 Critical | 3 | 1 Security (CSP absent), 1 Security (no sandbox), 1 Quality (strip-ansi version) |
| 🟡 Warning | 7 | 2 Architecture, 3 Security, 2 Quality |
| 🟢 Suggestion | 7 | 4 Architecture (compliant), 2 Quality, 1 Security (compliant) |

### Top 3 Recommended Actions

1. **🔴 Add Content-Security-Policy** (`packages/main/renderer/index.html`)  
   Highest impact, low effort. A missing CSP is the most exploitable Electron renderer misconfiguration. Inline script in the HTML is the only blocker — extract it or use `unsafe-inline` as a first step.

2. **🔴 Enable `sandbox: true`** (`packages/main/src/index.ts`)  
   One-line addition to `webPreferences`. Activates Chromium's full process sandbox for the renderer. Verify preload does not use direct Node APIs (it currently doesn't).

3. **🟡 Remove unused `package.json` dependencies** (`packages/ui/package.json`)  
   `antd`, `allotment`, `radix-ui`, `@dnd-kit/*` have no imports in source. Removing them reduces bundle size, eliminates maintenance burden, and removes potential future CVE exposure. Low effort, clear win.

### Follow-up Reviews Recommended

- **Performance review**: React memoisation coverage in `AISessionsView` and `UnifiedSessionTree`, which re-render on every session update
- **Test coverage review**: No test framework is configured in `packages/ui` or `packages/daemon` (`"test": "echo 'No tests configured'"`) — establishing a test baseline is a high-priority architectural gap
- **Dependency audit**: Run `pnpm audit` across all workspaces to check for known CVEs in current dependency versions
