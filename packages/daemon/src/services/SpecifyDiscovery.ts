import * as fs from "fs";
import * as path from "path";

const MAX_DEPTH = 3;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".worktrees",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "out",
  "coverage",
]);

const TAG = "[SpecifyDiscovery]";

export interface SpecifyLocation {
  /** Absolute path of the directory containing `.specify/`. */
  dir: string;
  /** Detected AI agent, or null if not readable. */
  agent: string | null;
}

/**
 * Walks up to 3 levels below `repoPath` looking for a `.specify` directory.
 * Returns the parent directory of the first match. Logs a warning if a second
 * match is found (user constraint: one per repo).
 */
export function findSpecifyRoot(repoPath: string): SpecifyLocation | null {
  const matches: string[] = [];
  walk(repoPath, 0, matches);

  if (matches.length === 0) return null;
  if (matches.length > 1) {
    console.warn(
      `${TAG} Multiple .specify folders found under ${repoPath}; using ${matches[0]} and ignoring ${matches.slice(1).join(", ")}`,
    );
  }

  const dir = matches[0];
  return { dir, agent: readSpecifyAgent(dir) };
}

function walk(dir: string, depth: number, matches: string[]): void {
  if (depth > MAX_DEPTH) return;

  const specifyDir = path.join(dir, ".specify");
  if (fs.existsSync(specifyDir)) {
    matches.push(dir);
    // Keep walking so we can warn on duplicates, but only to MAX_DEPTH.
  }

  if (depth === MAX_DEPTH) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (name === ".specify") continue;
    if (name.startsWith(".") && name !== ".specify") continue;
    if (SKIP_DIRS.has(name)) continue;
    walk(path.join(dir, name), depth + 1, matches);
  }
}

/**
 * Reads the configured AI agent for a Specify-initialized directory.
 * Checks `.specify/integration.json` first (canonical after `specify integration switch`),
 * then `.specify/init-options.json`. Returns null if neither is present or parseable.
 */
export function readSpecifyAgent(specifyParentDir: string): string | null {
  const specifyDir = path.join(specifyParentDir, ".specify");

  const integration = tryReadJson(path.join(specifyDir, "integration.json"));
  if (integration && typeof integration.integration === "string") {
    return integration.integration;
  }

  const initOptions = tryReadJson(path.join(specifyDir, "init-options.json"));
  if (initOptions && typeof initOptions.ai === "string") {
    return initOptions.ai;
  }

  return null;
}

function tryReadJson(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    console.warn(`${TAG} Could not read ${filePath}: ${err}`);
    return null;
  }
}
