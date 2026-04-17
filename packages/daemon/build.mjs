import esbuild from "esbuild";

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

console.log("daemon bundled ✓");
