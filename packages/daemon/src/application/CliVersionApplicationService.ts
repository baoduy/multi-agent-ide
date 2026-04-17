import { spawn, type ChildProcess } from "node:child_process";

import {
  CLI_TOOLS,
  CLI_VERSION_CHECK_CACHE_MS,
  type CliToolId,
  type CliToolStatus,
} from "@magenta/shared/cliTools";

import type { ConfigManager } from "../config/ConfigManager";
import { AppError } from "../errors/AppError";
import type { IPCBridge } from "../ipc/IPCBridge";
import { CliVersionProbe, isNewerVersion, normalizeReleaseTag } from "../infrastructure/CliVersionProbe";
import type { GitHubReleasesGateway } from "../infrastructure/GitHubReleasesGateway";

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

  constructor(
    private readonly bridge: IPCBridge,
    private readonly configManager: ConfigManager,
    private readonly releasesGateway: GitHubReleasesGateway,
  ) {}

  /**
   * Returns the last-known cached status. Used by the renderer on mount so
   * that the bell badge populates even before the first fresh check lands.
   * If no cache exists the list is returned with all tools marked
   * `installed: false, updateAvailable: false`.
   */
  getStatus(): CliToolStatus[] {
    const cached = this.configManager.getConfig().cliVersions;
    if (cached && Array.isArray(cached.tools) && cached.tools.length > 0) {
      return cached.tools;
    }
    return (Object.keys(CLI_TOOLS) as CliToolId[]).map((id) => ({
      tool: id,
      installed: false,
      currentVersion: null,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      checkedAt: null,
      checkError: null,
    }));
  }

  /**
   * Runs the startup check. Short-circuits to the cached snapshot when it
   * was taken within the last 24h — restarting the app repeatedly shouldn't
   * hammer the releases API.
   */
  async runStartupCheck(): Promise<void> {
    const cached = this.configManager.getConfig().cliVersions;
    const now = Date.now();
    if (cached && now - cached.checkedAt < CLI_VERSION_CHECK_CACHE_MS) {
      console.log(
        `[cli-version] Using cached snapshot from ${new Date(cached.checkedAt).toISOString()} (age ${Math.round((now - cached.checkedAt) / 1000)}s)`,
      );
      this.emitStatus(cached.tools);
      return;
    }
    await this.refresh();
  }

  /**
   * Forces a fresh check bypassing the 24h cache. Triggered by `cli:recheck`.
   */
  async refresh(): Promise<CliToolStatus[]> {
    const statuses = await Promise.all(
      (Object.keys(CLI_TOOLS) as CliToolId[]).map((id) => this.checkOne(id)),
    );

    const checkedAt = Date.now();
    this.configManager.updateConfig({ cliVersions: { checkedAt, tools: statuses } });
    this.emitStatus(statuses);
    return statuses;
  }

  /**
   * Re-probes a single tool after an upgrade completes so the UI can update
   * the displayed current version in place.
   */
  async refreshOne(tool: CliToolId): Promise<CliToolStatus> {
    const status = await this.checkOne(tool);
    const current = this.getStatus();
    const merged = current.map((s) => (s.tool === tool ? status : s));
    this.configManager.updateConfig({ cliVersions: { checkedAt: Date.now(), tools: merged } });
    this.emitStatus(merged);
    return status;
  }

  private async checkOne(tool: CliToolId): Promise<CliToolStatus> {
    const spec = CLI_TOOLS[tool];
    const probe = await this.probe.probe(spec.binary, spec.versionArgs);

    if (!probe.installed) {
      return {
        tool,
        installed: false,
        currentVersion: null,
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: spec.releaseUrl,
        checkedAt: Date.now(),
        checkError: probe.error,
      };
    }

    const release = await this.releasesGateway.getLatestRelease(spec.githubRepo);
    const latest = release ? normalizeReleaseTag(release.tagName) : null;
    const updateAvailable = isNewerVersion(probe.version, latest);

    return {
      tool,
      installed: true,
      currentVersion: probe.version,
      latestVersion: latest,
      updateAvailable,
      releaseUrl: release?.htmlUrl ?? spec.releaseUrl,
      checkedAt: Date.now(),
      checkError: release ? null : "unable to fetch latest release",
    };
  }

  private emitStatus(tools: CliToolStatus[]): void {
    this.bridge.emit({
      type: "cli:version-status-changed",
      tools,
      updateCount: countUpdates(tools),
    });
  }

  /**
   * Spawns the hardcoded upgrade command for a tool. Streams stdout+stderr
   * via `cli:upgrade:output` events; emits `cli:upgrade:complete` on exit.
   *
   * Single-flight per tool — a second `upgrade(tool)` while the first is
   * still running throws VALIDATION_ERROR.
   */
  startUpgrade(tool: CliToolId): void {
    if (this.activeUpgrades.has(tool)) {
      throw new AppError("VALIDATION_ERROR", `An upgrade for ${tool} is already running`);
    }

    const spec = CLI_TOOLS[tool];
    const argv = tokenizeSafely(spec.upgradeCommand);
    const [command, ...args] = argv;

    const child = spawn(command, args, {
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
      this.bridge.emit({
        type: "cli:upgrade:complete",
        tool,
        success,
        error: success ? undefined : `Process exited with code ${code}`,
      });
      if (success) {
        void this.refreshOne(tool).catch((err) => {
          console.warn(`[cli-version] Post-upgrade refresh for ${tool} failed:`, err);
        });
      }
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
