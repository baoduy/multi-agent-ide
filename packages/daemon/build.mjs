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
  external: ["better-sqlite3"],
});

console.log("daemon bundled ✓");
