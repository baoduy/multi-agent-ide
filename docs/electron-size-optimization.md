# Electron App Size Optimisation Analysis

> Generated: 2026-04-15  
> Codebase: multi-agent-ide (Electron 41.2.0 · esbuild · pnpm monorepo)

---

## Executive Summary

The packaged app currently ships unminified code, unnecessary compiled artefacts, and has suboptimal compression. The changes below are ranked by impact and are all safe to apply.

---

## 1. 🔴 Enable Minification — Missing Entirely

**Impact: HIGH** — JS size reduction of ~30–40%

Neither the UI renderer bundle nor the daemon bundle is minified in production.

### `packages/ui/esbuild.mjs`

```diff
 const config = {
   entryPoints: [path.join(__dirname, "src/renderer/index.tsx")],
   bundle: true,
   outfile: path.join(__dirname, "dist/bundle.js"),
   platform: "browser",
   target: "ES2020",
+  minify: true,           // add for production
   loader: { ... },
```

### `packages/daemon/build.mjs`

```diff
 await esbuild.build({
   entryPoints: ["src/daemon-ipc-worker.ts"],
   bundle: true,
   platform: "node",
   target: "node20",
   format: "cjs",
   outfile: "dist/daemon-ipc-worker.js",
-  sourcemap: true,        // sourcemap in production ships .map files
+  sourcemap: false,       // disable in production
+  minify: true,           // add for production
   external: ["node-pty"],
 });
```

> **Note:** If you want sourcemaps available for crash debugging but not shipped to users, use `sourcemap: "external"` and add `!**/*.js.map` to the electron-builder `files` exclusions.

---

## 2. 🔴 Daemon Dist — Ships All tsc Artefacts, Only Bundle Is Needed

**Impact: HIGH** — Removes dozens of unnecessary compiled files from the asar

The `electron-builder.yml` currently includes `packages/daemon/dist/**/*`, but the main process **only ever forks one file**:

```js
// packages/main/src/index.ts (compiled output)
const daemonEntryPath = path.resolve(__dirname, "..", "..", "daemon", "dist", "daemon-ipc-worker.js");
```

The build pipeline is `tsc && node build.mjs`. After a full production build, `esbuild` produces a **self-contained bundle** at `dist/daemon-ipc-worker.js`. The individually compiled `.js` files (DaemonContainer, migrations, handlers, services, etc.) exist only as intermediate tsc artefacts and are **not needed at runtime**.

> **Caveat:** The current `dist/` in this worktree reflects a `tsc`-only run (the bundle has relative `require()` calls). After `pnpm build`, the esbuild step replaces `daemon-ipc-worker.js` with a proper self-contained bundle. The recommendation below applies to the properly built output.

### `electron-builder.yml`

```diff
-  - packages/daemon/dist/**/*
+  - packages/daemon/dist/daemon-ipc-worker.js
```

---

## 3. 🔴 Compression — Set to `normal`, Should Be `maximum`

**Impact: HIGH** — Reduces installer/zip download size by ~10–20%

```diff
-compression: normal
+compression: maximum
```

This controls zlib compression for the ASAR archive and platform installers (DMG, NSIS, AppImage). `maximum` uses the highest zlib level (9) at the cost of slightly slower packaging — acceptable for CI release builds.

---

## 4. 🟡 Unused Heavy Dependencies in `packages/ui`

**Impact: MEDIUM** — Reduces `node_modules` install size; no impact on bundled app size since esbuild tree-shakes unused imports, but removing them prevents accidental future inclusion and speeds up installs.

| Package | On-disk size | Usage in source |
|---------|-------------|----------------|
| `antd` | 40 MB (`dist/`) | **Zero imports found** |
| `@lobehub/ui` | 10 MB | **Zero imports found** |

> Note: `@lobehub/icons` (separate package) IS used — only `Claude` and `GithubCopilot` SVG icons from `ProviderIcon.tsx`. Keep it.

### `packages/ui/package.json`

```diff
 "dependencies": {
-  "antd": "^6.3.5",
-  "@lobehub/ui": "^5.7.0",
   "@lobehub/icons": "^5.4.0",
   ...
 }
```

Also clean up the root `pnpm.packageExtensions` — these peer-dep overrides exist for packages that are now candidates for removal:

```diff
 "pnpm": {
   "packageExtensions": {
-    "@emoji-mart/react@1.1.1": { ... },    // check if actually used
-    "react-avatar-editor@13.0.2": { ... }  // zero imports found in source
   }
 }
```

> **Verify first:** Run `grep -r "emoji-mart\|AvatarEditor" packages/ui/src` before removing — both showed zero hits during this audit.

---

## 5. 🟡 Ship Type Declaration and Source Map Files Unnecessarily

**Impact: MEDIUM** — `.d.ts`, `.d.ts.map`, and `.js.map` files have no runtime purpose

The `packages/shared/dist/` directory ships 10 `.d.ts` / `.d.ts.map` files. `packages/main/dist/` ships `.d.ts` files. These are consumed by the TypeScript compiler at build time only.

### `electron-builder.yml` — add to the `files` exclusions block

```diff
   - "!**/src/**"
   - "!**/.git"
   - "!**/docs/**"
   - "!**/specs/**"
   - "!**/test/**"
   - "!**/tests/**"
   - "!**/.github/**"
+  - "!**/*.d.ts"
+  - "!**/*.d.ts.map"
+  - "!**/*.js.map"
+  - "!**/README*"
+  - "!**/CHANGELOG*"
+  - "!**/*.md"
```

---

## 6. 🟡 Unnecessary `asarUnpack` Pattern for `sql.js`

**Impact: SMALL** — Removes a redundant unpack rule

The daemon build (esbuild with `bundle: true`) **inlines sql.js JS** into `daemon-ipc-worker.js`. The WASM binary is already handled correctly via `extraResources`. There is no sql.js directory inside the asar to unpack.

### `electron-builder.yml`

```diff
 asarUnpack:
   - "**/*.node"
-  - "**/sql.js/**"
```

---

## 7. 🟢 Code Splitting for Large UI Libraries

**Impact: MEDIUM (startup time)** — Defers parsing of large libraries until needed

`mermaid` (74 MB source, ~2 MB bundled) is already imported with `await import("mermaid")` in `FileViewer.tsx` — this is the correct pattern. However, without `splitting: true` in esbuild, it is still bundled into `bundle.js` eagerly.

To actually defer it:

### `packages/ui/esbuild.mjs`

```diff
 const config = {
   entryPoints: [path.join(__dirname, "src/renderer/index.tsx")],
   bundle: true,
-  outfile: path.join(__dirname, "dist/bundle.js"),
+  outdir: path.join(__dirname, "dist"),
   platform: "browser",
   target: "ES2020",
+  splitting: true,
+  format: "esm",          // splitting requires ESM
   ...
 };
```

> **Breaking change warning:** Switching to ESM format + `outdir` requires updating `packages/main/renderer/index.html` to load `dist/bundle.js` as `type="module"`, and verifying the Electron renderer's `webPreferences.contextIsolation` / CSP allow ESM. Test carefully before applying.

---

## 8. 🟢 Target the Correct Electron Node Version in Daemon Build

**Impact: MINOR** — Better dead-code elimination

The daemon build targets `node20` but runs inside Electron 41 which ships Node.js 22. Using a closer target lets esbuild omit more polyfills.

```diff
-  target: "node20",
+  target: "node22",
```

---

## Recommended Implementation Order

| Priority | Change | File(s) | Effort |
|----------|--------|---------|--------|
| 1 | Enable `minify: true` in both bundles | `packages/ui/esbuild.mjs`, `packages/daemon/build.mjs` | 5 min |
| 2 | Change `compression: normal` → `maximum` | `electron-builder.yml` | 1 min |
| 3 | Remove `antd` and `@lobehub/ui` | `packages/ui/package.json` | 5 min + reinstall |
| 4 | Narrow daemon dist to bundle only | `electron-builder.yml` | 2 min |
| 5 | Add `.d.ts` / `.map` exclusions | `electron-builder.yml` | 2 min |
| 6 | Remove unused `asarUnpack` sql.js | `electron-builder.yml` | 1 min |
| 7 | Remove sourcemap from daemon build | `packages/daemon/build.mjs` | 1 min |
| 8 | Update daemon node target to `node22` | `packages/daemon/build.mjs` | 1 min |
| 9 | Code splitting (mermaid/reactflow) | `packages/ui/esbuild.mjs` + HTML | 1–2 hours, test carefully |

Items 1–8 are low-risk and can be done in a single commit. Item 9 requires renderer testing.
