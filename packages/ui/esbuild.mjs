import esbuild from "esbuild";
import * as path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Resolve a package to its real entry file so every library in the bundle
 * shares exactly ONE copy.  Without this, pnpm's nested node_modules can
 * cause esbuild to bundle two different versions of react (e.g. 19.2.4 and
 * 19.2.5), which breaks hooks and context (the classic "Cannot read
 * properties of null (reading 'useContext')" error).
 */
function singleCopy(pkg) {
  return path.dirname(require.resolve(`${pkg}/package.json`));
}

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
  alias: {
    // Force a single copy of React across all dependencies (lucide-react,
    // zustand, reactflow, etc.) to prevent the duplicate-React bug.
    "react": singleCopy("react"),
    "react-dom": singleCopy("react-dom"),
    "react/jsx-runtime": path.join(singleCopy("react"), "jsx-runtime"),
    "react/jsx-dev-runtime": path.join(singleCopy("react"), "jsx-dev-runtime"),
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
