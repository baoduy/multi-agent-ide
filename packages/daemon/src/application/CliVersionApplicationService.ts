import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CLI_TOOLS,
  resolveCliToolSpec,
  type CliToolId,
  type CliToolStatus,
  type CliToolSpec,
} from "@magenta/shared/cliTools";
import { DEFAULT_SPECIFY_COMMAND } from "@magenta/shared/config";

import type { ConfigManager } from "../config/ConfigManager";
import { AppError } from "../errors/AppError";
import type { IPCBridge } from "../ipc/IPCBridge";
import { CliVersionProbe, isNewerVersion, normalizeReleaseTag } from "../infrastructure/CliVersionProbe";
import type { GitHubReleasesGateway } from "../infrastructure/GitHubReleasesGateway";
import type { NpmRegistryGateway } from "../infrastructure/NpmRegistryGateway";
import type { SpecifyExtensionApplicationService } from "./SpecifyExtensionApplicationService";

/**
 * Shell-metacharacter allowlist copied verbatim from OnboardApplicationService
 * so every CLI upgrade command we ship is guaranteed to pass the same
 * injection filter. If a command fails this check the daemon throws a
 * VALIDATION_ERROR — it never falls back to `shell: true`.
 */
const SAFE_TOKEN = /^[A-Za-z0-9_@:/.\-+=~,%]+$/;

function tokenizeSafely(command: string): string[] {
  const tokens = command
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  for (const token of tokens) {
    if (!SAFE_TOKEN.test(token)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `CLI upgrade command contains unsafe characters: ${JSON.stringify(token)}`,
      );
    }
  }
  if (tokens.length === 0) {
    throw new AppError("VALIDATION_ERROR", "CLI upgrade command is empty");
  }
  return tokens;
}

function countUpdates(tools: CliToolStatus[]): number {
  return tools.filter((t) => t.updateAvailable).length;
}

export class CliVersionApplicationService {
  private readonly probe = new CliVersionProbe();
  private readonly activeUpgrades = new Map<CliToolId, ChildProcess>();
  private lastStatus: CliToolStatus[] = (Object.keys(CLI_TOOLS) as CliToolId[]).map(
    (id) => initialStatus(id),
  );

  constructor(
    private readonly bridge: IPCBridge,
    private readonly releasesGateway: GitHubReleasesGateway,
    private readonly npmGateway: NpmRegistryGateway,
    private readonly configManager: ConfigManager,
    private readonly specifyExtensionService: SpecifyExtensionApplicationService,
  ) {}

  /**
   * Resolves a tool's spec by merging hardcoded defaults with the user's
   * `cliTools` overrides from `~/.magenta/config.json`. Called fresh on every
   * probe / upgrade so edits take effect without a daemon restart.
   */
  private specFor(tool: CliToolId): CliToolSpec {
    const overrides = this.configManager.getConfig().cliTools?.[tool];
    return resolveCliToolSpec(tool, overrides);
  }

  /**
   * Builds the actual shell command for an upgrade. For `specify` this
   * substitutes `{agent}` in the `specifyCommand` template with the agent
   * read from `<repoPath>/.specify/init-options.json`, and pins the spawn
   * cwd to the repo so `--here` resolves correctly. All other tools use
   * their resolved `upgradeCommand` as-is in the daemon's default cwd.
   */
  private resolveUpgradeCommand(
    tool: CliToolId,
    repoPath?: string,
  ): { command: string; cwd?: string } {
    if (tool === "specify") {
      if (!repoPath) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Upgrading the Specify template requires a repo context",
        );
      }
      const agent = readSpecifyAgent(repoPath);
      if (!agent) {
        throw new AppError(
          "VALIDATION_ERROR",
          `Cannot determine AI agent for Specify upgrade — missing or invalid ${join(repoPath, ".specify", "init-options.json")}`,
        );
      }
      const template =
        this.configManager.getConfig().specifyCommand || DEFAULT_SPECIFY_COMMAND;
      const command = template.replace(/\{agent\}/g, agent).replace(/\s+/g, " ").trim();
      return { command, cwd: repoPath };
    }
    return { command: this.specFor(tool).upgradeCommand };
  }

  /**
   * Returns the last computed status without hitting the network. The
   * renderer calls this on dialog open to render a skeleton immediately
   * while `refresh()` fetches fresh numbers.
   */
  getStatus(): CliToolStatus[] {
    return this.lastStatus;
  }

  /**
   * Probes every tool and queries its version source, then emits the
   * resulting snapshot. Called on demand when the user opens the upgrade
   * dialog — there is no automatic background cadence.
   *
   * `repoPath` (optional) is used only for Specify: when present, the
   * service reads `<repoPath>/.specify/init-options.json`'s
   * `speckit_version` instead of spawning `specify --version`.
   */
  async refresh(repoPath?: string): Promise<CliToolStatus[]> {
    const statuses = await Promise.all(
      (Object.keys(CLI_TOOLS) as CliToolId[]).map((id) => this.checkOne(id, repoPath)),
    );
    this.lastStatus = statuses;
    this.emitStatus(statuses);
    return statuses;
  }

  /**
   * Re-probes a single tool after an upgrade completes so the UI can
   * update the displayed current version in place without a full refresh.
   */
  async refreshOne(tool: CliToolId, repoPath?: string): Promise<CliToolStatus> {
    const status = await this.checkOne(tool, repoPath);
    this.lastStatus = this.lastStatus.map((s) => (s.tool === tool ? status : s));
    this.emitStatus(this.lastStatus);
    return status;
  }

  private async checkOne(tool: CliToolId, repoPath?: string): Promise<CliToolStatus> {
    const spec = this.specFor(tool);
    const probe = await this.probeCurrentVersion(tool, repoPath);

    if (!probe.installed) {
      return {
        tool,
        installed: false,
        currentVersion: null,
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: spec.infoUrl,
        checkedAt: Date.now(),
        checkError: probe.error,
      };
    }

    const latestInfo = await this.fetchLatest(spec);
    const latest = latestInfo ? normalizeReleaseTag(latestInfo.version) : null;
    const updateAvailable = isNewerVersion(probe.version, latest);

    return {
      tool,
      installed: true,
      currentVersion: probe.version,
      latestVersion: latest,
      updateAvailable,
      releaseUrl: latestInfo?.url ?? spec.infoUrl,
      checkedAt: Date.now(),
      checkError: latestInfo ? null : "unable to fetch latest version",
    };
  }

  /**
   * Resolves the locally-installed version of a tool.
   *
   * For Specify, the version lives in the repo's `.specify/init-options.json`
   * (the `speckit_version` field written by `specify init`). Reading it
   * from disk is cheaper and more accurate than spawning the CLI, which
   * needs `uvx` resolution and may report a different version than what's
   * actually initialised in the repo. Falls back to the normal spawn probe
   * if no `repoPath` was supplied or the file isn't present.
   */
  private async probeCurrentVersion(
    tool: CliToolId,
    repoPath?: string,
  ) {
    const spec = this.specFor(tool);
    if (tool === "specify" && repoPath) {
      const version = readSpeckitVersion(repoPath);
      if (version) {
        return { installed: true, version, error: null };
      }
    }
    return this.probe.probe(spec.binary, spec.versionArgs);
  }

  private async fetchLatest(
    spec: CliToolSpec,
  ): Promise<{ version: string; url: string } | null> {
    if (spec.source.kind === "github") {
      const release = await this.releasesGateway.getLatestRelease(spec.source.repo);
      return release ? { version: release.tagName, url: release.htmlUrl } : null;
    }
    const info = await this.npmGateway.getLatestVersion(spec.source.package);
    return info ? { version: info.version, url: info.htmlUrl } : null;
  }

  private emitStatus(tools: CliToolStatus[]): void {
    this.bridge.emit({
      type: "cli:version-status-changed",
      tools,
      updateCount: countUpdates(tools),
    });
  }

  /**
   * Spawns the upgrade command for a tool. Streams stdout+stderr via
   * `cli:upgrade:output` events; emits `cli:upgrade:complete` on exit.
   *
   * For `specify` the "upgrade" action re-runs the spec template init
   * command (`specifyCommand` template) in the given repo — this refreshes
   * the repo's spec-kit scaffold rather than upgrading a global CLI.
   * A `repoPath` is required in that case so the command can run with
   * `cwd: <repo>` and resolve `--here` correctly.
   *
   * Single-flight per tool — a second `upgrade(tool)` while the first is
   * still running throws VALIDATION_ERROR.
   */
  startUpgrade(tool: CliToolId, repoPath?: string): void {
    if (this.activeUpgrades.has(tool)) {
      throw new AppError("VALIDATION_ERROR", `An upgrade for ${tool} is already running`);
    }

    const { command: commandString, cwd } = this.resolveUpgradeCommand(tool, repoPath);
    const argv = tokenizeSafely(commandString);
    const [command, ...args] = argv;

    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.activeUpgrades.set(tool, child);

    const emitOutput = (data: Buffer) => {
      this.bridge.emit({ type: "cli:upgrade:output", tool, data: data.toString("utf-8") });
    };
    child.stdout?.on("data", emitOutput);
    child.stderr?.on("data", emitOutput);

    child.on("close", (code) => {
      this.activeUpgrades.delete(tool);
      const success = code === 0;
      console.log(`[cli-version] Upgrade finished for ${tool} (exit ${code})`);

      // The Specify "upgrade" is really a template refresh (`specify init
      // --here --force`) inside the repo. Immediately follow it with the
      // user-configured extensions so they survive the refresh — any spec-kit
      // assets overwritten by `init --force` are replaced by a known-good
      // extension set. For other tools this block is skipped.
      if (success && tool === "specify" && cwd) {
        void this.specifyExtensionService
          .installExtensionsInRepo(cwd, cwd, (data) =>
            this.bridge.emit({ type: "cli:upgrade:output", tool, data }),
          )
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[cli-version] Extension install after ${tool} upgrade failed: ${msg}`);
            this.bridge.emit({
              type: "cli:upgrade:output",
              tool,
              data: `\nextension install failed: ${msg}\n`,
            });
          })
          .finally(() => this.finalizeUpgrade(tool, success, cwd, code));
        return;
      }

      this.finalizeUpgrade(tool, success, cwd, code);
    });

    child.on("error", (err) => {
      this.activeUpgrades.delete(tool);
      console.error(`[cli-version] Spawn error for ${tool}:`, err.message);
      this.bridge.emit({
        type: "cli:upgrade:complete",
        tool,
        success: false,
        error: err.message,
      });
    });
  }

  /**
   * Emits the `cli:upgrade:complete` event and kicks off a post-upgrade
   * refresh. Split out so the close handler can defer it until the
   * post-upgrade extension install (Specify only) finishes streaming.
   */
  private finalizeUpgrade(
    tool: CliToolId,
    success: boolean,
    repoPath: string | undefined,
    code: number | null,
  ): void {
    this.bridge.emit({
      type: "cli:upgrade:complete",
      tool,
      success,
      error: success ? undefined : `Process exited with code ${code}`,
    });
    if (success) {
      void this.refreshOne(tool, repoPath).catch((err) => {
        console.warn(`[cli-version] Post-upgrade refresh for ${tool} failed:`, err);
      });
    }
  }

  /**
   * Sends SIGTERM to the active upgrade for a tool, then SIGKILL after 5s
   * if the process is still alive.
   */
  cancelUpgrade(tool: CliToolId): void {
    const child = this.activeUpgrades.get(tool);
    if (!child) return;
    child.kill("SIGTERM");
    setTimeout(() => {
      if (this.activeUpgrades.get(tool) === child && !child.killed) {
        child.kill("SIGKILL");
      }
    }, 5_000);
  }
}

function initialStatus(tool: CliToolId): CliToolStatus {
  return {
    tool,
    installed: false,
    currentVersion: null,
    latestVersion: null,
    updateAvailable: false,
    releaseUrl: CLI_TOOLS[tool].infoUrl,
    checkedAt: null,
    checkError: null,
  };
}

/**
 * Reads the `speckit_version` field from `<repoPath>/.specify/init-options.json`.
 * Returns `null` when the file is missing, malformed, or the field is absent.
 */
function readSpeckitVersion(repoPath: string): string | null {
  const optionsPath = join(repoPath, ".specify", "init-options.json");
  try {
    if (!existsSync(optionsPath)) return null;
    const content = readFileSync(optionsPath, "utf-8");
    const data = JSON.parse(content) as Record<string, unknown>;
    return typeof data.speckit_version === "string" ? data.speckit_version : null;
  } catch (err) {
    console.warn(`[cli-version] Could not read init-options.json: ${err}`);
    return null;
  }
}

/**
 * Reads the `ai` field from `<repoPath>/.specify/init-options.json`. This
 * is the agent the repo was initialised with (e.g. "claude" or "copilot")
 * and is the right value to substitute into the `specifyCommand` template
 * for a non-destructive template refresh.
 */
function readSpecifyAgent(repoPath: string): string | null {
  const optionsPath = join(repoPath, ".specify", "init-options.json");
  try {
    if (!existsSync(optionsPath)) return null;
    const content = readFileSync(optionsPath, "utf-8");
    const data = JSON.parse(content) as Record<string, unknown>;
    return typeof data.ai === "string" && data.ai.length > 0 ? data.ai : null;
  } catch (err) {
    console.warn(`[cli-version] Could not read init-options.json for agent: ${err}`);
    return null;
  }
}
