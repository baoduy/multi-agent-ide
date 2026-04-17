import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CLI_TOOLS,
  type CliToolId,
  type CliToolStatus,
  type CliToolSpec,
} from "@magenta/shared/cliTools";

import { AppError } from "../errors/AppError";
import type { IPCBridge } from "../ipc/IPCBridge";
import { CliVersionProbe, isNewerVersion, normalizeReleaseTag } from "../infrastructure/CliVersionProbe";
import type { GitHubReleasesGateway } from "../infrastructure/GitHubReleasesGateway";
import type { NpmRegistryGateway } from "../infrastructure/NpmRegistryGateway";

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
  ) {}

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
    const spec = CLI_TOOLS[tool];
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
    const spec = CLI_TOOLS[tool];
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
