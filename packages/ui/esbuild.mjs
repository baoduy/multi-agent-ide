import esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs";
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

/**
 * esbuild plugin: recursively inline `@import url("...")` statements inside
 * CSS files loaded via the `text` loader.
 *
 * Why: `".css": "text"` hands CSS to the renderer as a raw string which gets
 * injected into a `<style>` tag at runtime. Browsers cannot resolve
 * bare-module `@import` specifiers inside an inline stylesheet, so
 * `@blocknote/mantine/style.css` — which contains ~85 imports like
 * `@import url("@mantine/core/styles/Menu.css")` — ends up with none of
 * Mantine's component CSS actually applied. The slash menu, bubble toolbar,
 * and color picker render completely unstyled as a result.
 *
 * This plugin reads each CSS file at build time, resolves every `@import`
 * (relative paths via `path.resolve`, bare modules via Node resolver), and
 * splices the imported file's contents inline. Files with no `@import`s are
 * returned unchanged. Cycle-safe via the `seen` set.
 */
const cssImportInlinerPlugin = {
  name: "css-import-inliner",
  setup(build) {
    const importRe = /@import\s+(?:url\()?\s*["']([^"')]+)["']\s*\)?\s*;?/g;

    async function inline(filePath, seen) {
      if (seen.has(filePath)) return "";
      seen.add(filePath);
      const dir = path.dirname(filePath);
      // Under pnpm, public `node_modules/<pkg>` entries are symlinks into
      // `.pnpm/<pkg>@.../node_modules/<pkg>`. Node's `createRequire` follows
      // the symlink path for resolution — but `<pkg>`'s transitive deps
      // (e.g. `@mantine/core` imported by `@blocknote/mantine`) are only
      // reachable from the real `.pnpm/<pkg>@.../node_modules/` directory.
      // Realpath first so module resolution walks the right tree.
      const realFilePath = fs.realpathSync(filePath);
      const reqFromHere = createRequire(realFilePath);
      const raw = await fs.promises.readFile(filePath, "utf8");
      importRe.lastIndex = 0;
      const matches = [];
      let m;
      while ((m = importRe.exec(raw)) !== null) {
        matches.push({ full: m[0], spec: m[1], index: m.index });
      }
      if (matches.length === 0) return raw;
      let out = "";
      let cursor = 0;
      for (const { full, spec, index } of matches) {
        out += raw.slice(cursor, index);
        let resolved;
        try {
          if (spec.startsWith(".") || spec.startsWith("/")) {
            resolved = path.resolve(dir, spec);
          } else {
            resolved = reqFromHere.resolve(spec);
          }
          out += await inline(resolved, seen);
        } catch (err) {
          // Leave unresolved imports as-is; they'll fail at runtime but
          // the build stays green and the rest of the CSS still loads.
          console.warn(
            `[css-import-inliner] Could not resolve "${spec}" from ${filePath}: ${err.message}`,
          );
          out += full;
        }
        cursor = index + full.length;
      }
      out += raw.slice(cursor);
      return out;
    }

    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const seen = new Set();
      const contents = await inline(args.path, seen);
      const watchFiles = [...seen].filter((f) => f !== args.path);
      return { contents, loader: "text", watchFiles };
    });
  },
};

const watchMode = process.argv.includes("--watch");

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
  plugins: [cssImportInlinerPlugin],
  jsx: "automatic",
  minify: !watchMode,
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
    // Path alias for shadcn/ui components (@/components, @/lib, etc.)
    "@": path.join(__dirname, "src/renderer"),
  },
};

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
