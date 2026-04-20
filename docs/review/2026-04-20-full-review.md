# Full Architecture Review — 2026-04-20

## Security Findings

### 🔴 Critical / SECURITY — No `sandbox: true` on BrowserWindow

**File**: [packages/main/src/index.ts](../packages/main/src/index.ts#L155-L165)
**Issue**: The `BrowserWindow` is created with `contextIsolation: true` and `nodeIntegration: false` (good), but `sandbox: true` is not set. Without sandboxing, a renderer exploit can still access some Node.js primitives through the V8 context. Electron's security checklist explicitly recommends enabling the sandbox.
**Fix**:
```ts
webPreferences: {
  preload: path.join(__dirname, "preload.js"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,  // ← add this
},
```
Test that the preload script still works under sandbox mode (it should, since it only uses `contextBridge` and `ipcRenderer`).

---

### 🔴 Critical / SECURITY — No Content Security Policy

**File**: [packages/main/src/index.ts](../packages/main/src/index.ts#L168)
**Issue**: No CSP header or meta tag is set for the renderer page. This means if an attacker achieves XSS (e.g., via rendered markdown or mermaid diagrams), they can load arbitrary remote scripts, exfiltrate data, or execute inline JS.
**Fix**: Set a CSP via `session.defaultSession.webRequest.onHeadersReceived`:
```ts
const { session } = require("electron");

app.on("ready", () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'"
        ],
      },
    });
  });
  // ... rest of ready handler
});
```
Adjust as needed if mermaid requires `blob:` for SVG rendering.

---

### 🟡 Warning / SECURITY — No `will-navigate` / `new-window` handler

**File**: [packages/main/src/index.ts](../packages/main/src/index.ts#L155-L180)
**Issue**: The renderer's `webContents` has no `will-navigate` or `setWindowOpenHandler` guard. If rendered markdown contains a malicious link and the user clicks it, it could navigate the main window away from the app or open an attacker-controlled URL inside a new Electron window with full preload access.
**Fix**:
```ts
mainWindow.webContents.on("will-navigate", (event, url) => {
  // Block all in-window navigation — the app is an SPA
  event.preventDefault();
});

mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  // Open external links in the system browser
  if (url.startsWith("https://") || url.startsWith("http://")) {
    shell.openExternal(url);
  }
  return { action: "deny" };
});
```

---

### 🟡 Warning / SECURITY — `dangerouslySetInnerHTML` in inline markdown renderer

**File**: [packages/ui/src/renderer/components/main/notionEditor/inlineMarkdown.tsx](../packages/ui/src/renderer/components/main/notionEditor/inlineMarkdown.tsx#L50)
**Issue**: The `renderInline()` function HTML-escapes first and then regex-replaces markdown patterns to HTML. The escape → transform order is correct, **but** the link handler uses `encodeURI(url)` which does not escape `javascript:` protocol URLs. A markdown link like `[click](javascript:alert(1))` would produce a clickable XSS vector.
**Fix**: Add protocol validation before generating the `<a>` tag:
```ts
// Inside the link regex replacement:
(_m, label, url) => {
  const normalized = url.trim().toLowerCase();
  if (normalized.startsWith("javascript:") || normalized.startsWith("data:")) {
    return label; // strip dangerous links
  }
  return `<a href="${encodeURI(url)}" target="_blank" rel="noreferrer" class="nm-link">${label}</a>`;
}
```

---

### 🟡 Warning / SECURITY — DevTools not restricted to dev mode

**File**: [packages/main/src/index.ts](../packages/main/src/index.ts)
**Issue**: There is no explicit `webContents.openDevTools()` call (good), but also no `mainWindow.webContents.on("devtools-opened")` guard. In production builds, users can open DevTools via keyboard shortcuts (Cmd+Opt+I) and interact with the preload bridge directly. While `contextIsolation` helps, consider disabling DevTools in production.
**Fix** (optional hardening):
```ts
if (app.isPackaged) {
  mainWindow.webContents.on("devtools-opened", () => {
    mainWindow?.webContents.closeDevTools();
  });
}
```

---

## Architecture Findings

### 🟡 Warning / ARCH — Main process index.ts is a ~840-line monolith

**File**: [packages/main/src/index.ts](../packages/main/src/index.ts)
**Issue**: The entire Electron main process — window creation, IPC relay, daemon lifecycle, logging, crash-loop protection — lives in a single file. This makes it hard to test individual concerns and increases merge-conflict risk.
**Fix**: Extract into focused modules:
- `packages/main/src/logger.ts` — `writeLog()`, `cleanOldLogs()`, `getLogFilePath()`
- `packages/main/src/daemonManager.ts` — `startDaemon()`, `stopDaemon()`, `restartDaemon()`, crash-loop state
- `packages/main/src/ipcRelay.ts` — `registerIpcHandler()` and all `ipcMain.handle()` registrations
- `packages/main/src/window.ts` — `createWindow()`, close interception

---

### 🟡 Warning / ARCH — `flush()` is a no-op after LMDB migration

**File**: [packages/daemon/src/services/RepoRepository.ts](../packages/daemon/src/services/RepoRepository.ts#L39-L41)
**Issue**: `RepoRepository.flush()` is an explicit no-op (`// intentional no-op`) because LMDB commits on transaction boundary. Yet 12+ call sites across the codebase still invoke `.flush()`. This creates confusion for future contributors who may think flush is doing something important, or worse, someone might remove the no-op thinking it's dead code and break things if the DB backend changes again.
**Fix**: Either:
1. Remove all `.flush()` calls and the method (clean break), or
2. Add a one-line JSDoc on the method: `/** @deprecated No-op — LMDB commits on write. Retained for source compatibility. */`

Option 1 is cleaner since the migration is complete.

---

### 🟢 Suggestion / ARCH — No `SessionCoordinator` for cross-store operations

**File**: Multiple UI stores
**Issue**: The instructions specify "cross-store ops via SessionCoordinator," but no `SessionCoordinator` class exists. Each store independently calls IPC. This is fine while stores are genuinely independent, but if two stores ever need to coordinate (e.g., creating an AI session should auto-select the repo), the lack of a coordinator will lead to ad-hoc cross-store imports.
**Fix**: No immediate action needed — note for future when cross-store coordination becomes necessary.

---

## Code Quality Findings

### 🟡 Warning / QUALITY — Heavy console.log in daemon production code

**File**: [packages/daemon/src/daemon-ipc-worker.ts](../packages/daemon/src/daemon-ipc-worker.ts) (30+ instances)
**Issue**: The daemon-ipc-worker has 25+ `console.log()` statements for routine operations (every IPC request/response, every event emit). In production these go to the main process's stdout pipe and get written to the log file via stderr. The volume of logging for routine operations (every IPC request, every event forward) adds noise and I/O overhead.
**Fix**: Introduce a log-level mechanism. At minimum, wrap verbose request/response logging in a `DEBUG` guard:
```ts
const DEBUG = process.env.MAGENTA_DEBUG === "1";
if (DEBUG) console.log(`[daemon-worker] Received request #${id}: ${type}`);
```

---

### 🟡 Warning / QUALITY — `strip-ansi` declared in both daemon and UI

**File**: [packages/daemon/package.json](../packages/daemon/package.json), [packages/ui/package.json](../packages/ui/package.json)
**Issue**: `strip-ansi@^7.2.0` is listed as a dependency in both `@magenta/daemon` and `@magenta/ui`. v7 is ESM-only, but daemon is CJS (`daemon-ipc-worker.js` is built by esbuild). The project instructions note `strip-ansi@6.0.1 (CJS v6, not ESM v7+)` for daemon. Verify that the daemon build actually resolves v6 at runtime and not v7.
**Fix**: Pin daemon's dependency to `"strip-ansi": "^6.0.1"` explicitly, or verify the esbuild bundle resolves correctly.

---

### 🟢 Suggestion / QUALITY — esbuild config has `minify: true` always

**File**: [packages/ui/esbuild.mjs](../packages/ui/esbuild.mjs#L34)
**Issue**: `minify: true` is always on, even in watch/dev mode. This makes dev-mode debugging harder (stack traces point to minified code) and slows down rebuilds.
**Fix**:
```js
minify: !watchMode,
```

---

### 🟢 Suggestion / QUALITY — Redundant `electron` in @magenta/main dependencies

**File**: [packages/main/package.json](../packages/main/package.json#L14)
**Issue**: `electron` is listed as both a root `devDependency` (for `electron-builder`) and as a `dependency` in `@magenta/main`. Electron should only be a `devDependency` — it's never bundled into the app; electron-builder provides its own runtime.
**Fix**: Move `electron` from `dependencies` to `devDependencies` in `packages/main/package.json`.

---

## Cleanup Findings

### 🟡 Warning / CLEANUP — `_tmp_*` files in workspace root

**File**: Workspace root (10 `_tmp_*` files)
**Issue**: There are 10 temporary files (`_tmp_12213_*`, `_tmp_7844_*`, etc.) in the project root. These appear to be leftover from build/test processes and should not be committed.
**Fix**: Delete them and add `_tmp_*` to `.gitignore`.

---

### 🟢 Suggestion / CLEANUP — Lint/test scripts are no-ops

**File**: [packages/daemon/package.json](../packages/daemon/package.json#L9-L10), [packages/ui/package.json](../packages/ui/package.json#L10-L11), [packages/main/package.json](../packages/main/package.json#L9-L10)
**Issue**: Every sub-package has `"lint": "echo 'No linter configured'"` and `"test": "echo 'No tests configured'"`. The root `pnpm lint` and `pnpm test` scripts call `pnpm -r lint/test`, which silently succeeds. This gives a false sense of CI coverage.
**Fix**: Either configure ESLint + Vitest, or replace the echo scripts with `exit 0` and add a TODO comment. At minimum, running `pnpm lint` in CI should not silently pass if no linting actually runs.

---

### 🟢 Suggestion / CLEANUP — `apps/web/` directory exists but appears unused

**File**: [apps/web/](../apps/web/)
**Issue**: There is an `apps/web/src/` directory but it's not referenced in `pnpm-workspace.yaml`, `electron-builder.yml`, or any import. Likely a leftover from an earlier architecture.
**Fix**: Verify it's unused and remove it.

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 2 |
| 🟡 Warning | 6 |
| 🟢 Suggestion | 5 |
| **Total** | **13** |

### Top 3 Recommended Actions

1. **Add `sandbox: true` + CSP headers** (🔴 Security) — Highest-impact security improvement. Both are straightforward one-line/block additions in `packages/main/src/index.ts`. Test preload still works under sandbox.

2. **Add `will-navigate` + `setWindowOpenHandler` guards + fix `javascript:` link XSS** (🟡 Security) — Prevents navigation hijacking and XSS via rendered markdown links. Two small code additions.

3. **Clean up `_tmp_*` files and add to `.gitignore`** (🟡 Cleanup) — Quick hygiene win. Prevents accidental data leaks from temp files being committed.

### Follow-up Reviews Recommended

- **Bundle size audit** — `mermaid` (~2MB) and `reactflow` are heavy; consider lazy-loading them to improve startup time.
- **Dependency audit** — Run `pnpm audit` to check for known vulnerabilities in transitive dependencies.
- **E2E coverage review** — Verify Playwright tests cover the critical IPC paths (ai-session:create, terminal:spawn, file:write) to prevent regressions.
