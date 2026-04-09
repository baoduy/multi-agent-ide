import esbuild from "esbuild";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
  entryPoints: [path.join(__dirname, "src/renderer/index.tsx")],
  bundle: true,
  outfile: path.join(__dirname, "dist/bundle.js"),
  platform: "browser",
  target: "ES2020",
  loader: {
    ".tsx": "tsx",
    ".ts": "ts",
    ".css": "text",
  },
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
};

const watchMode = process.argv.includes("--watch");

if (watchMode) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log("⌚ Watching for changes...");
} else {
  esbuild
    .build(config)
    .then(() => {
      console.log("✓ UI bundle built successfully");
    })
    .catch((error) => {
      console.error("✗ UI bundle build failed:", error);
      process.exit(1);
    });
}
