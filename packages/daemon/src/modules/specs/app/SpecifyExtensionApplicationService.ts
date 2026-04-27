import { spawn, type ChildProcess } from "node:child_process";

import type { SpecifyExtension } from "@magenta/shared/config";
import { DEFAULT_SPECIFY_COMMAND } from "@magenta/shared/config";

import type { ConfigManager } from "../../../core/config/ConfigManager";
import type { GitHubReleasesGateway } from "../../repos/infra/GitHubReleasesGateway";
import { AppError } from "../../../core/errors/AppError";

/**
 * Shell-metacharacter allowlist for tokens we pass to `spawn`. Matches the
 * allowlist used by `OnboardApplicationService` / `CliVersionApplicationService`
 * — URLs, version specifiers, flags, and identifiers are fine; anything that
 * could influence a shell is rejected. Spawns always run with `shell: false`.
 */
const SAFE_TOKEN = /^[A-Za-z0-9_@:/.\-+=~,%]+$/;

export type ExtensionInstallEmit = (data: string) => void;

export interface ExtensionInstallSummary {
  total: number;
  installed: number;
  failed: number;
  /** Extensions that errored out (failed to resolve or non-zero exit). */
  failures: Array<{ extension: SpecifyExtension; error: string }>;
}

/**
 * Installs Specify CLI extensions declared in the user's config into a repo
 * that already has `.specify/` set up.
 *
 * The command is built by reusing the user's configured `specifyCommand`
 * template (everything up to and including the `specify` token is the
 * runner prefix) and appending `extension add <name> --from <zip-url>`.
 * The zip URL is always the latest GitHub release archive for the
 * extension's `repo`, so extensions stay current without manual version
 * bumps in Magenta's config.
 *
 * Invocations are best-effort: a single failing extension is logged and
 * counted in the returned summary but does not block the rest.
 */
export class SpecifyExtensionApplicationService {
  /** One active child per repoPath — supports cancellation. */
  private readonly activeProcesses = new Map<string, ChildProcess>();

  constructor(
    private readonly configManager: ConfigManager,
    private readonly releasesGateway: GitHubReleasesGateway,
  ) {}

  /**
   * Installs every configured extension in the given repo, sequentially.
   *
   * @param repoPath Logical repo key (matches OnboardApplicationService' cancel API).
   * @param targetPath Working directory for the spawn (may differ when
   *   onboarding into a worktree).
   * @param emit Called with each chunk of stdout/stderr from every install
   *   plus a small amount of framing ("$ command\n", "✓ installed\n", etc.)
   *   so both the onboard dialog and the CLI upgrade dialog can surface
   *   progress in their existing terminals.
   */
  async installExtensionsInRepo(
    repoPath: string,
    targetPath: string,
    emit: ExtensionInstallEmit,
  ): Promise<ExtensionInstallSummary> {
    const extensions = this.configManager.getConfig().specifyExtensions ?? [];
    const summary: ExtensionInstallSummary = {
      total: extensions.length,
      installed: 0,
      failed: 0,
      failures: [],
    };

    if (extensions.length === 0) return summary;

    emit(`\nInstalling ${extensions.length} Specify extension(s)…\n`);

    const prefix = this.resolveSpecifyPrefix();

    for (const ext of extensions) {
      const { ok, error } = await this.installOne(repoPath, targetPath, prefix, ext, emit);
      if (ok) {
        summary.installed += 1;
      } else {
        summary.failed += 1;
        summary.failures.push({ extension: ext, error: error ?? "unknown error" });
      }
    }

    return summary;
  }

  /**
   * Sends SIGTERM to the active install for a repo; SIGKILL after 2s if alive.
   * Matches the pattern used by OnboardApplicationService.cancel.
   */
  cancel(repoPath: string): void {
    const child = this.activeProcesses.get(repoPath);
    if (!child) return;
    child.kill("SIGTERM");
    setTimeout(() => {
      if (this.activeProcesses.get(repoPath) !== child) return;
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill("SIGKILL");
        } catch {
          // already dead
        }
      }
      this.activeProcesses.delete(repoPath);
    }, 2_000);
  }

  /**
   * Returns tokens for `<runner> specify` — everything from the
   * `specifyCommand` template up to and including `specify`. This is the
   * same prefix extraction used by `OnboardApplicationService.buildSwitchCommand`
   * so a user who customises the template (e.g. pins a spec-kit fork)
   * automatically gets extensions installed through that fork too.
   */
  private resolveSpecifyPrefix(): string[] {
    const template =
      this.configManager.getConfig().specifyCommand || DEFAULT_SPECIFY_COMMAND;
    const tokens = template.replace(/\s+/g, " ").trim().split(" ");
    const specifyIdx = tokens.indexOf("specify");
    return specifyIdx >= 0 ? tokens.slice(0, specifyIdx + 1) : tokens.slice(0, 1);
  }

  private async installOne(
    repoPath: string,
    targetPath: string,
    prefix: string[],
    ext: SpecifyExtension,
    emit: ExtensionInstallEmit,
  ): Promise<{ ok: boolean; error?: string }> {
    emit(`\n→ ${ext.name} (${ext.repo})\n`);

    const release = await this.releasesGateway.getLatestRelease(ext.repo);
    if (!release) {
      const msg = `Could not resolve latest release for ${ext.repo}`;
      emit(`  ${msg}\n`);
      return { ok: false, error: msg };
    }

    const zipUrl = buildReleaseArchiveUrl(ext.repo, release.tagName);
    const argv = [...prefix, "extension", "add", ext.name, "--from", zipUrl];

    for (const token of argv) {
      if (!SAFE_TOKEN.test(token)) {
        const msg = `extension command contains unsafe token ${JSON.stringify(token)}`;
        emit(`  ${msg}\n`);
        return { ok: false, error: msg };
      }
    }

    emit(`  $ ${argv.join(" ")}\n`);

    return this.spawnAndWait(repoPath, targetPath, argv, emit);
  }

  private spawnAndWait(
    repoPath: string,
    cwd: string,
    argv: string[],
    emit: ExtensionInstallEmit,
  ): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      const [command, ...args] = argv;
      let child: ChildProcess;
      try {
        child = spawn(command, args, {
          cwd,
          shell: false,
          env: { ...process.env },
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        emit(`  spawn failed: ${msg}\n`);
        resolve({ ok: false, error: msg });
        return;
      }

      this.activeProcesses.set(repoPath, child);

      child.stdout?.on("data", (data: Buffer) => emit(data.toString("utf-8")));
      child.stderr?.on("data", (data: Buffer) => emit(data.toString("utf-8")));

      child.on("close", (code) => {
        if (this.activeProcesses.get(repoPath) === child) {
          this.activeProcesses.delete(repoPath);
        }
        if (code === 0) {
          emit(`  ✓ installed\n`);
          resolve({ ok: true });
        } else {
          const msg = `process exited with code ${code}`;
          emit(`  ✗ ${msg}\n`);
          resolve({ ok: false, error: msg });
        }
      });

      child.on("error", (err) => {
        if (this.activeProcesses.get(repoPath) === child) {
          this.activeProcesses.delete(repoPath);
        }
        emit(`  ✗ ${err.message}\n`);
        resolve({ ok: false, error: err.message });
      });
    });
  }
}

/**
 * Builds the canonical "Download source code (zip)" URL GitHub auto-generates
 * for every release tag. Verified against
 * https://github.com/dango85/spec-kit-worktree-parallel/archive/refs/tags/v1.3.1.zip.
 */
function buildReleaseArchiveUrl(repo: string, tag: string): string {
  if (!/^[A-Za-z0-9_.\-]+\/[A-Za-z0-9_.\-]+$/.test(repo)) {
    throw new AppError("VALIDATION_ERROR", `Invalid extension repo: ${repo}`);
  }
  return `https://github.com/${repo}/archive/refs/tags/${tag}.zip`;
}
