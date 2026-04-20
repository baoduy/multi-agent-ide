import esbuild from "esbuild";
import { copyFileSync } from "node:fs";

await esbuild.build({
  entryPoints: ["src/daemon-ipc-worker.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: "dist/daemon-ipc-worker.js",
  sourcemap: false,
  minify: true,
  // sql.js WASM is loaded at runtime from extraResources — keep it external
  // node-pty is a native addon — must be loaded from node_modules, not bundled.
  // strip-ansi v7 is ESM-only, so bundle it into this CJS output.
  external: ["node-pty"],
});

// Copy sql.js WASM next to the bundle so dev mode works. In production,
// MAGENTA_RESOURCES_PATH takes precedence and points to the extraResources
// copy placed by electron-builder — that path wins over this fallback.
copyFileSync(
  "node_modules/sql.js/dist/sql-wasm.wasm",
  "dist/sql-wasm.wasm",
);

console.log("daemon bundled ✓");
