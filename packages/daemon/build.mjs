import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/daemon-ipc-worker.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/daemon-ipc-worker.js",
  sourcemap: true,
  // sql.js WASM is loaded at runtime from extraResources — keep it external
  // sql.js WASM is loaded at runtime from extraResources — keep it external.
  // node-pty is a native addon — must be loaded from node_modules, not bundled.
  // strip-ansi v6 CJS — keep external so require() finds it in node_modules.
  external: ["better-sqlite3", "node-pty", "strip-ansi"],
});

console.log("daemon bundled ✓");
