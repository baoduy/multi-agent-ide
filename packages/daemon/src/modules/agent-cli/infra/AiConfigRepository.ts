import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AiEditAction, AiEditConfig } from "@magenta/shared/ipc";
import type { AIProvider } from "@magenta/shared/aiTerminal";
import { AI_PROVIDERS } from "@magenta/shared/aiTerminal";
import { AppError } from "../../../core/errors/AppError";
import {
  BUILTIN_ACTIONS,
  parseActionFile,
  type ParsedAction,
} from "../core/aiActionTemplates";

/**
 * Default values used when neither repo nor global config supplies a field.
 * Kept alongside the resolver so the fallback chain is visible in one place.
 */
const DEFAULT_CONFIG: Omit<AiEditConfig, "sourceTrace" | "repoConfigPath" | "globalConfigPath"> = {
  provider: "claude",
  model: "sonnet",
  // 3 minutes default. Chat responses (especially first-token after a cold
  // CLI start) can take well over 60s. Users who need longer can override
  // via `.magenta/ai/config.json`. The main-process IPC budget is 5 min for
  // `ai-chat:*` requests, so anything up to ~290s will make it back intact.
  timeoutMs: 180_000,
  extraArgs: [],
};

const CONFIG_DIRNAME = ".magenta/ai";
const CONFIG_FILENAME = "config.json";
const ACTIONS_DIRNAME = "actions";

/**
 * Reads AI-editor config and actions from the filesystem.
 *
 * Lives in the infrastructure layer (per CLAUDE.md): this class owns direct
 * `fs` access to both `<repo>/.magenta/ai/` and `~/.magenta/ai/`. The global
 * path sits outside any repo allowlist, so we cannot route through
 * FileSystemGateway — this wrapper is the sanctioned boundary.
 */
export class AiConfigRepository {
  private readonly globalDir: string;

  constructor(globalDir?: string) {
    this.globalDir = globalDir ?? path.join(os.homedir(), CONFIG_DIRNAME);
  }

  getRepoConfigPath(repoPath: string): string {
    return path.join(repoPath, CONFIG_DIRNAME, CONFIG_FILENAME);
  }

  getGlobalConfigPath(): string {
    return path.join(this.globalDir, CONFIG_FILENAME);
  }

  /**
   * Load the resolved config for a repo. Order: repo → global → defaults.
   * `sourceTrace` records where each field came from so the UI can show it.
   * Never throws on "file missing" — only on malformed JSON.
   */
  loadConfig(repoPath: string): AiEditConfig {
    const repoConfigPath = this.getRepoConfigPath(repoPath);
    const globalConfigPath = this.getGlobalConfigPath();

    const repoRaw = readJsonIfExists(repoConfigPath);
    const globalRaw = readJsonIfExists(globalConfigPath);

    const sourceTrace: Record<string, string> = {};
    const provider = pickString(
      ["provider", repoRaw, globalRaw],
      DEFAULT_CONFIG.provider,
      sourceTrace,
      repoConfigPath,
      globalConfigPath,
    );
    if (!(AI_PROVIDERS as readonly string[]).includes(provider)) {
      throw new AppError(
        "AI_CONFIG_INVALID",
        `Unknown AI provider "${provider}". Allowed: ${AI_PROVIDERS.join(", ")}.`,
      );
    }
    const model = pickString(
      ["model", repoRaw, globalRaw],
      DEFAULT_CONFIG.model,
      sourceTrace,
      repoConfigPath,
      globalConfigPath,
    );
    const timeoutMs = pickNumber(
      ["timeoutMs", repoRaw, globalRaw],
      DEFAULT_CONFIG.timeoutMs,
      sourceTrace,
      repoConfigPath,
      globalConfigPath,
    );
    const extraArgs = pickStringArray(
      ["extraArgs", repoRaw, globalRaw],
      DEFAULT_CONFIG.extraArgs,
      sourceTrace,
      repoConfigPath,
      globalConfigPath,
    );

    return {
      provider: provider as AIProvider,
      model,
      timeoutMs,
      extraArgs,
      sourceTrace,
      repoConfigPath,
      globalConfigPath,
    };
  }

  /**
   * Resolve the full action list for a repo. For each action id, the first
   * match wins in order: repo `.magenta/ai/actions/<id>.md` → global → built-in.
   * Returns the UI-facing metadata shape.
   */
  listActions(repoPath: string): AiEditAction[] {
    const resolved = this.resolveActionsMap(repoPath);
    return Array.from(resolved.values()).map((entry) => ({
      id: entry.action.id,
      label: entry.action.label,
      icon: entry.action.icon,
      scope: entry.action.scope,
      source: entry.source,
    }));
  }

  /**
   * Load the full parsed body for a single action, applying the same
   * repo → global → built-in fallback chain. Returns `null` if unknown.
   */
  loadAction(repoPath: string, actionId: string): ParsedAction | null {
    const resolved = this.resolveActionsMap(repoPath);
    return resolved.get(actionId)?.action ?? null;
  }

  private resolveActionsMap(
    repoPath: string,
  ): Map<string, { action: ParsedAction; source: "builtin" | "global" | "repo" }> {
    const result = new Map<string, { action: ParsedAction; source: "builtin" | "global" | "repo" }>();

    for (const builtin of BUILTIN_ACTIONS) {
      result.set(builtin.id, { action: builtin, source: "builtin" });
    }

    const globalActionsDir = path.join(this.globalDir, ACTIONS_DIRNAME);
    for (const action of readActionsDir(globalActionsDir)) {
      result.set(action.id, { action, source: "global" });
    }

    const repoActionsDir = path.join(repoPath, CONFIG_DIRNAME, ACTIONS_DIRNAME);
    for (const action of readActionsDir(repoActionsDir)) {
      result.set(action.id, { action, source: "repo" });
    }

    return result;
  }
}

function readJsonIfExists(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    throw new AppError(
      "AI_CONFIG_INVALID",
      `Failed to read ${filePath}: ${(err as Error).message}`,
    );
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("expected a JSON object");
  } catch (err) {
    throw new AppError(
      "AI_CONFIG_INVALID",
      `Invalid JSON in ${filePath}: ${(err as Error).message}`,
    );
  }
}

/**
 * Walk the fallback chain for a string field and record the winning source
 * into `sourceTrace`. Chain order: repo → global → default.
 */
function pickString(
  [key, repo, global]: [string, Record<string, unknown> | null, Record<string, unknown> | null],
  fallback: string,
  trace: Record<string, string>,
  repoPath: string,
  globalPath: string,
): string {
  if (repo && typeof repo[key] === "string") {
    trace[key] = repoPath;
    return repo[key] as string;
  }
  if (global && typeof global[key] === "string") {
    trace[key] = globalPath;
    return global[key] as string;
  }
  trace[key] = "built-in default";
  return fallback;
}

function pickNumber(
  [key, repo, global]: [string, Record<string, unknown> | null, Record<string, unknown> | null],
  fallback: number,
  trace: Record<string, string>,
  repoPath: string,
  globalPath: string,
): number {
  if (repo && typeof repo[key] === "number") {
    trace[key] = repoPath;
    return repo[key] as number;
  }
  if (global && typeof global[key] === "number") {
    trace[key] = globalPath;
    return global[key] as number;
  }
  trace[key] = "built-in default";
  return fallback;
}

function pickStringArray(
  [key, repo, global]: [string, Record<string, unknown> | null, Record<string, unknown> | null],
  fallback: string[],
  trace: Record<string, string>,
  repoPath: string,
  globalPath: string,
): string[] {
  if (repo && Array.isArray(repo[key]) && (repo[key] as unknown[]).every((v) => typeof v === "string")) {
    trace[key] = repoPath;
    return repo[key] as string[];
  }
  if (
    global &&
    Array.isArray(global[key]) &&
    (global[key] as unknown[]).every((v) => typeof v === "string")
  ) {
    trace[key] = globalPath;
    return global[key] as string[];
  }
  trace[key] = "built-in default";
  return fallback;
}

/**
 * Read every `*.md` file in the given actions directory. Silently returns an
 * empty list if the directory doesn't exist; malformed individual files are
 * skipped (we don't want a single broken action to hide the entire folder).
 */
function readActionsDir(dirPath: string): ParsedAction[] {
  if (!fs.existsSync(dirPath)) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const actions: ParsedAction[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".md")) continue;
    const full = path.join(dirPath, entry.name);
    let text: string;
    try {
      text = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    const defaultId = entry.name.replace(/\.md$/i, "");
    try {
      actions.push(parseActionFile(text, defaultId));
    } catch {
      // Skip malformed files; caller doesn't need to know about broken extras.
    }
  }
  return actions;
}
