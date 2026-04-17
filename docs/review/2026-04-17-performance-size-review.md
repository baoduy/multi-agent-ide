# Performance & Published App Size Review — 2026-04-17

**Scope**: React renderer performance · Electron bundle size · Published app optimization  
**Reviewed by**: arch.review agent  
**Date**: 2026-04-17

> **Note**: The [2026-04-16 size optimization doc](../electron-size-optimization.md) already covers minification, compression, and electron-builder exclusions. This review focuses on **what remains unimplemented from that doc** plus **new findings** specific to React runtime performance and bundle composition.

---

## 🔴 Critical Findings

### 1. Minification Still Disabled in Both Bundles [SIZE]
**File**: [packages/ui/esbuild.mjs](../../packages/ui/esbuild.mjs) · [packages/daemon/build.mjs](../../packages/daemon/build.mjs)  
**Issue**: Neither `esbuild.mjs` config sets `minify: true`. The UI bundle and daemon bundle ship unminified, typically 30–40% larger than necessary.  
**Fix**:
```js
// packages/ui/esbuild.mjs
const config = {
  ...
  minify: true,
};
```
```js
// packages/daemon/build.mjs
await esbuild.build({
  ...
  minify: true,
  sourcemap: false, // or "external" — see item 2
});
```

---

### 2. Daemon Sourcemap Ships in Production [SIZE]
**File**: [packages/daemon/build.mjs](../../packages/daemon/build.mjs#L11)  
**Issue**: `sourcemap: true` generates `daemon-ipc-worker.js.map` which gets packaged into the asar. Source maps can be > 1 MB and have no user-facing value in production.  
**Fix**: Change to `sourcemap: false` (or `sourcemap: "external"` with `!**/*.js.map` in electron-builder exclusions).

---

### 3. Electron-Builder Ships All Daemon tsc Artefacts [SIZE]
**File**: [electron-builder.yml](../../electron-builder.yml#L27)  
**Issue**: `packages/daemon/dist/**/*` includes all individually-compiled `.js` files from `tsc` plus the esbuild bundle. Only `daemon-ipc-worker.js` is forked at runtime.  
**Fix**:
```yaml
- packages/daemon/dist/daemon-ipc-worker.js
```

---

### 4. `@iconify-json/vscode-icons` Entire Icon Set Bundled [SIZE]
**File**: [packages/ui/package.json](../../packages/ui/package.json#L20) · [fileIcons.tsx](../../packages/ui/src/renderer/components/common/fileIcons.tsx)  
**Issue**: `@iconify/react` auto-discovers and bundles the `@iconify-json/vscode-icons` package (~68 MB on disk, ~1.5–3 MB in the bundled JS after esbuild). The app only uses ~40 specific icon names from the `vscode-icons` set. The `<Icon>` component from `@iconify/react` loads the full icon set JSON at import time.  
**Fix**: Replace `@iconify/react` + `@iconify-json/vscode-icons` with **static inline SVGs** for the ~40 icons actually used (same pattern already applied for Claude and GitHub Copilot icons in `ProviderIcon.tsx`). This removes ~1–3 MB from the bundle and eliminates the runtime JSON parse overhead.

Alternatively, use `@iconify/react/offline` with `addIcon()` calls for only the needed icons:
```ts
import { Icon, addIcon } from "@iconify/react/offline";
import tsIcon from "@iconify-icons/vscode-icons/file-type-typescript-official";
addIcon("vscode-icons:file-type-typescript-official", tsIcon);
```
This approach keeps the `<Icon>` API but only includes icons that are explicitly imported.

---

### 5. `compression: normal` in Electron-Builder [SIZE]
**File**: [electron-builder.yml](../../electron-builder.yml#L77)  
**Issue**: Uses zlib default level instead of maximum. Switching to `maximum` reduces installer/archive size by ~10–20% at the cost of slower CI packaging.  
**Fix**:
```yaml
compression: maximum
```

---

## 🟡 Warning Findings

### 6. Five Unused Dependencies in `packages/ui/package.json` [SIZE]
**File**: [packages/ui/package.json](../../packages/ui/package.json)  
**Issue**: These packages have zero `from "..."` imports in any source file under `packages/ui/src/`:

| Package | Approx Size | Import Count |
|---------|------------|--------------|
| `antd` | ~40 MB | 0 |
| `@dnd-kit/core` | ~350 KB | 0 |
| `@dnd-kit/sortable` | ~150 KB | 0 |
| `@dnd-kit/utilities` | ~50 KB | 0 |
| `allotment` | ~200 KB | 0 |
| `radix-ui` | ~2 MB | 0 |

While esbuild tree-shakes unused imports from the final bundle, these still bloat `pnpm install` time, `node_modules` size, and risk accidental future inclusion.  
**Fix**: Remove all six from `dependencies` in `packages/ui/package.json`.

---

### 7. Orphaned `pnpm.packageExtensions` for Removed Packages [SIZE]
**File**: [package.json](../../package.json#L10-L22)  
**Issue**: `@emoji-mart/react@1.1.1` and `react-avatar-editor@13.0.2` peer-dep overrides remain in `pnpm.packageExtensions`, but neither package is imported anywhere in source. These are likely left over from an earlier version.  
**Fix**: Remove both entries from `pnpm.packageExtensions`.

---

### 8. Missing `.d.ts` / `.map` / `.md` Exclusions in Electron-Builder [SIZE]
**File**: [electron-builder.yml](../../electron-builder.yml#L37-L46)  
**Issue**: `.d.ts`, `.d.ts.map`, `.js.map`, `README.md`, and `CHANGELOG.md` files from `packages/shared/dist/` and `packages/main/dist/` ship inside the asar archive. These are build-time artefacts with no runtime purpose.  
**Fix**: Add to the `files` exclusion block:
```yaml
- "!**/*.d.ts"
- "!**/*.d.ts.map"
- "!**/*.js.map"
- "!**/README*"
- "!**/CHANGELOG*"
```

---

### 9. Unused `asarUnpack` for `sql.js` [SIZE]
**File**: [electron-builder.yml](../../electron-builder.yml#L72-L74)  
**Issue**: `"**/sql.js/**"` in `asarUnpack` is redundant — the daemon esbuild bundle inlines the sql.js JavaScript, and the WASM binary is correctly placed via `extraResources`. There is no `sql.js/` directory inside the asar to unpack.  
**Fix**: Remove `- "**/sql.js/**"` from `asarUnpack`.

---

### 10. `DockMainPage` Component Is a Re-render Hotspot [PERF]
**File**: [packages/ui/src/renderer/pages/DockMainPage.tsx](../../packages/ui/src/renderer/pages/DockMainPage.tsx)  
**Issue**: `DockMainPage` subscribes to **23+ individual Zustand selectors** across 5 stores (layout, session, repo, spec, worktree, config, AI sessions). Each selector that returns a new reference triggers a re-render of the *entire* 730-line component, including all its child props recomputation.

Key problem selectors:
- `useLayoutStore((s) => s.layout.center.tabs)` — returns the raw array; any tab open/close/reorder creates a new array reference, re-rendering the whole page.
- `useRepoStore((s) => s.pinnedPaths)` — returns a `Set`, which is always a new reference after any toggle.
- `useLayoutStore((s) => s.layout.activityBar.groups.find(...))` — inline `.find()` in selector returns new object refs.

**Fix**:
1. **Split into sub-components**: Extract `DockNavigation`, `DockSnapshotManager`, and `DockTabHandler` as separate components with their own targeted store subscriptions.
2. **Stabilize selectors**: For array/object selectors, use `zustand/shallow` or create stable selector functions:
   ```ts
   // Before (re-renders on any tab change)
   const centerTabs = useLayoutStore((s) => s.layout.center.tabs);
   
   // After (only re-renders when tab count changes)
   const centerTabCount = useLayoutStore((s) => s.layout.center.tabs.length);
   ```
3. **Use `useShallow`** from `zustand/react/shallow` for object selectors that destructure:
   ```ts
   import { useShallow } from "zustand/react/shallow";
   const { leftCollapsed, rightCollapsed } = useLayoutStore(
     useShallow((s) => ({
       leftCollapsed: s.layout.left.collapsed,
       rightCollapsed: s.layout.right.collapsed,
     }))
   );
   ```

---

### 11. `viewProps` Object Recreated Every Render [PERF]
**File**: [packages/ui/src/renderer/pages/DockMainPage.tsx](../../packages/ui/src/renderer/pages/DockMainPage.tsx#L650-L690)  
**Issue**: The `viewProps` record is constructed inline in the render body. Every re-render of `DockMainPage` creates a new object for every view's props, which causes all dock views to receive new props and re-render even when their specific data hasn't changed.  
**Fix**: Wrap `viewProps` in `useMemo` with appropriate dependencies:
```ts
const viewProps = useMemo(() => ({
  "repo-changes": {
    repoPath: activeRepoPath ?? undefined,
    worktreePath: worktreePathForChanges,
    onOpenFile: handleOpenFile,
    onOpenDiff: handleOpenDiff,
  },
  // ... other views
}), [activeRepoPath, worktreePathForChanges, handleOpenFile, handleOpenDiff, ...]);
```

---

### 12. No Code Splitting — Entire App in Single Bundle [PERF/SIZE]
**File**: [packages/ui/esbuild.mjs](../../packages/ui/esbuild.mjs)  
**Issue**: esbuild produces a single `bundle.js` with no code splitting. Heavy libraries like `reactflow` (~250 KB min), `react-codemirror-merge` + all CodeMirror language packs (~300 KB min), `@uiw/react-md-editor` (~200 KB min), and `mermaid` (~800 KB min) are all in the initial bundle. The `await import("mermaid")` in `MermaidDiagram.tsx` is correctly written as a dynamic import, but without `splitting: true` in esbuild, it gets statically bundled anyway.  
**Fix**: Enable code splitting in esbuild:
```js
const config = {
  entryPoints: [path.join(__dirname, "src/renderer/index.tsx")],
  bundle: true,
  outdir: path.join(__dirname, "dist"),    // outdir instead of outfile
  platform: "browser",
  target: "ES2020",
  splitting: true,
  format: "esm",
  // ...
};
```
Then update `packages/main/renderer/index.html`:
```html
<script type="module" src="../../ui/dist/index.js"></script>
```
**Impact**: Defers ~1.5 MB of JS parsing from startup to first use of each feature (diff viewer, flow diagram, mermaid diagrams).

> ⚠️ This requires testing that the Electron renderer's CSP and `contextIsolation` allow ESM module loading.

---

### 13. `FileIconBadge` Creates Inline Style Objects on Every Render [PERF]
**File**: [packages/ui/src/renderer/components/common/fileIcons.tsx](../../packages/ui/src/renderer/components/common/fileIcons.tsx#L165-L180)  
**Issue**: `FileIconBadge` creates a new `style` object literal every render. This component is rendered for every file in every file tree, file tab, and file list. The style object is static.  
**Fix**: Hoist the style object to module scope:
```ts
const FILE_ICON_BADGE_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  flexShrink: 0,
};
```

---

### 14. `MagentaTerminalReadonly` Uses Inline Styles Throughout [PERF]
**File**: [packages/ui/src/renderer/components/common/MagentaTerminal.tsx](../../packages/ui/src/renderer/components/common/MagentaTerminal.tsx#L45-L110)  
**Issue**: The readonly terminal branch creates 4+ inline style object literals on every render. Since terminal output updates frequently (streaming), this generates unnecessary GC pressure.  
**Fix**: Hoist static styles to module-level constants. For the `<pre>` style that depends on `maxHeight`/`fontSize`/`fontFamily`, either use CSS classes or memoize:
```ts
const TERMINAL_HEADER_STYLE: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, marginBottom: 8 };
```

---

### 15. Layout Store Persists on Every State Change [PERF]
**File**: [packages/ui/src/renderer/components/dock/layoutStore.ts](../../packages/ui/src/renderer/components/dock/layoutStore.ts#L354-L362)  
**Issue**: The `useLayoutStore.subscribe()` callback fires on *every* state change and serializes the entire layout tree to `localStorage`. During drag-resize operations (which call `setSectionSize` or `setRegionWidth` at ~60 fps via mousemove), this triggers 60 `JSON.stringify()` + `localStorage.setItem()` calls per second (debounced at 500ms, but the `clearTimeout`/`setTimeout` churn is still overhead).  
**Fix**: The 500ms debounce is reasonable but consider using a `requestIdleCallback` wrapper instead of `setTimeout` to avoid blocking the main thread during resize:
```ts
useLayoutStore.subscribe((state) => {
  if (persistTimer) cancelIdleCallback(persistTimer);
  persistTimer = requestIdleCallback(() => {
    try {
      localStorage.setItem("magenta:dock-layout", JSON.stringify(state.layout));
    } catch { /* ignore */ }
  }, { timeout: 1000 });
});
```

---

### 16. Daemon Build Targets `node20` But Runs on Node 22 [SIZE]
**File**: [packages/daemon/build.mjs](../../packages/daemon/build.mjs#L6)  
**Issue**: `target: "node20"` causes esbuild to include compatibility transforms that aren't needed since the daemon runs inside Electron 41 (Node.js 22).  
**Fix**: Change to `target: "node22"`.

---

## 🟢 Suggestions

### 17. `strip-ansi` Duplicated Across UI and Daemon [SIZE]
**File**: [packages/ui/package.json](../../packages/ui/package.json) · [packages/daemon/package.json](../../packages/daemon/package.json)  
**Issue**: `strip-ansi@^7.2.0` is declared in both packages. The daemon bundles it into `daemon-ipc-worker.js` (correct — it's ESM-only). The UI bundles it into `bundle.js`. This is expected behavior but worth noting: the UI only uses it in `MagentaTerminalReadonly` for display purposes, which is a lightweight use.  
**Fix**: No action needed unless you adopt code splitting (item 12), in which case `strip-ansi` should end up in the terminal chunk.

---

### 18. `FlowDiagram` Injects CSS via DOM Manipulation [PERF]
**File**: [packages/ui/src/renderer/components/flow/FlowDiagram.tsx](../../packages/ui/src/renderer/components/flow/FlowDiagram.tsx#L26-L33)  
**Issue**: Every mount of `FlowDiagram` runs `document.createElement("style")` and appends reactflow CSS to `<head>`. The guard (`if (!document.getElementById(id))`) prevents duplicates, but this is a side effect in render that React doesn't track.  
**Fix**: Move the CSS injection to the esbuild build step or to a top-level `useEffect` in the app root. Since esbuild loads `.css` as text, you could add it alongside `styles.css` in the Tailwind build, or inject once in `index.tsx`.

---

### 19. Consider `React.memo` for Frequently-Rendered List Items [PERF]
**Files**: Various components in `sidebar/`, `ai-terminal/`, `activity/`  
**Issue**: List items rendered inside `.map()` loops (e.g., `SpecTree` entries, `UnifiedSessionTree` rows, `RepoFileChanges` file rows) are plain function components. When the parent re-renders, all list items re-render even if their specific props haven't changed.  
**Fix**: Wrap high-frequency list item components in `React.memo()`:
```ts
const SessionRow = React.memo(function SessionRow({ session, ... }: Props) { ... });
```
Priority targets:
- File change rows in `RepoFileChanges`
- Session rows in `UnifiedSessionTree`
- Spec entries in `SpecTree`

---

### 20. `MermaidDiagram` Uses `innerHTML` for SVG Injection [PERF/SEC]
**File**: [packages/ui/src/renderer/components/main/MermaidDiagram.tsx](../../packages/ui/src/renderer/components/main/MermaidDiagram.tsx#L29)  
**Issue**: `containerRef.current.innerHTML = svg` bypasses React's virtual DOM. While `securityLevel: "strict"` in mermaid config provides some protection, `innerHTML` is a known XSS vector if the mermaid input comes from untrusted markdown files.  
**Fix**: Use `dangerouslySetInnerHTML` (makes the intent explicit to React) or use DOMPurify to sanitize the SVG before injection:
```ts
containerRef.current.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true } });
```

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 5 |
| 🟡 Warning | 11 |
| 🟢 Suggestion | 4 |

### Top 3 Recommended Actions (Highest Impact / Lowest Effort)

1. **Enable `minify: true` in both esbuild configs + set `compression: maximum`** (items 1, 2, 5) — 5 minutes, immediate 30–40% JS size reduction + 10–20% installer reduction.

2. **Remove 6 unused dependencies + orphaned packageExtensions + narrow daemon dist** (items 3, 6, 7, 8, 9) — 10 minutes, cleans up ~45 MB from `node_modules`, reduces asar size, faster installs.

3. **Replace `@iconify/react` + `@iconify-json/vscode-icons` with static SVGs or offline mode** (item 4) — 1–2 hours, removes ~1–3 MB from the JS bundle and eliminates a large JSON parse at startup.

### Follow-Up Reviews Recommended

- **Bundle analysis**: Run `esbuild --analyze` or `esbuild-visualizer` after enabling minification to get exact per-library bundle sizes and identify the next wave of optimizations.
- **React DevTools Profiler session**: Record a profiler trace while switching tabs/repos to measure actual re-render frequency and identify the worst offenders in items 10–11.
- **Code splitting feasibility**: Test ESM splitting (item 12) in an Electron sandbox to confirm CSP compatibility before committing to the refactor.
