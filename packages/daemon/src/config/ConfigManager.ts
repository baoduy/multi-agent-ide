import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  MagentaConfigSchema,
  type MagentaConfig,
  normalizeWorkingDirs,
  type WorkingDirEntry,
} from "@magenta/shared/config";
import { AppError } from "../errors/AppError";

export class ConfigManager {
  private static instance: ConfigManager | null = null;

  private readonly configDir: string;
  private readonly configPath: string;
  private config: MagentaConfig;

  private constructor(configPath?: string) {
    this.configDir = path.join(os.homedir(), ".magenta");
    this.configPath = configPath ?? path.join(this.configDir, "config.json");

    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    this.config = this.loadConfig();
  }

  static getInstance(configPath?: string): ConfigManager {
    if (ConfigManager.instance === null) {
      ConfigManager.instance = new ConfigManager(configPath);
    }

    return ConfigManager.instance;
  }

  static resetInstanceForTesting(): void {
    ConfigManager.instance = null;
  }

  getConfig(): MagentaConfig {
    return {
      ...this.config,
      workingDirs: this.workingDirEntries().map((e) => ({ ...e })),
    };
  }

  /**
   * Returns just the absolute paths — used by `PathAllowlistProvider`
   * consumers that don't care about per-dir reproducibility metadata.
   */
  getAllowedRoots(): readonly string[] {
    return this.workingDirEntries().map((e) => e.path);
  }

  /** Returns the entry object for a working-dir path, or undefined. */
  getWorkingDirEntry(workingDirPath: string): WorkingDirEntry | undefined {
    const normalized = this.normalizePath(workingDirPath);
    return this.workingDirEntries().find((e) => e.path === normalized);
  }

  /**
   * Patches a single working-dir entry. `patch` keys explicitly set to
   * `undefined` are deleted from the entry; absent keys are left alone.
   * Throws CONFIG_ERROR if the path is not registered.
   */
  updateWorkingDir(
    workingDirPath: string,
    patch: Partial<Omit<WorkingDirEntry, "path">>,
  ): MagentaConfig {
    const normalized = this.normalizePath(workingDirPath);
    const entries = this.workingDirEntries();
    const idx = entries.findIndex((e) => e.path === normalized);
    if (idx === -1) {
      throw new AppError(
        "CONFIG_ERROR",
        `${workingDirPath} is not a registered working dir`,
      );
    }
    const current = entries[idx];
    const next: WorkingDirEntry = { path: current.path };
    const promptTemplatesPath =
      "promptTemplatesPath" in patch
        ? patch.promptTemplatesPath
        : current.promptTemplatesPath;
    const mcpConfigJson =
      "mcpConfigJson" in patch ? patch.mcpConfigJson : current.mcpConfigJson;
    if (promptTemplatesPath !== undefined)
      next.promptTemplatesPath = promptTemplatesPath;
    if (mcpConfigJson !== undefined) next.mcpConfigJson = mcpConfigJson;
    entries[idx] = next;
    this.config = { ...this.config, workingDirs: entries };
    this.writeConfig(this.config);
    return this.getConfig();
  }

  /**
   * Merges partial config updates into the current config and persists.
   */
  updateConfig(partial: Partial<MagentaConfig>): MagentaConfig {
    const merged: MagentaConfig = { ...this.config, ...partial };
    if (partial.workingDirs !== undefined) {
      merged.workingDirs = normalizeWorkingDirs(partial.workingDirs);
    }
    this.config = merged;
    this.writeConfig(this.config);
    return this.getConfig();
  }

  addWorkingDir(dirPath: string): MagentaConfig {
    const normalizedPath = this.normalizePath(dirPath);
    const entries = this.workingDirEntries();
    if (!entries.some((e) => e.path === normalizedPath)) {
      entries.push({ path: normalizedPath });
      this.config = { ...this.config, workingDirs: entries };
      this.writeConfig(this.config);
    }
    return this.getConfig();
  }

  removeWorkingDir(dirPath: string): MagentaConfig {
    const normalizedPath = this.normalizePath(dirPath);
    const entries = this.workingDirEntries().filter(
      (e) => e.path !== normalizedPath,
    );
    this.config = { ...this.config, workingDirs: entries };
    this.writeConfig(this.config);
    return this.getConfig();
  }

  /** Normalized internal view of `workingDirs`. */
  private workingDirEntries(): WorkingDirEntry[] {
    return normalizeWorkingDirs(this.config.workingDirs).map((e) => ({
      ...e,
      path: this.normalizePath(e.path),
    }));
  }

  private normalizePath(inputPath: string): string {
    if (inputPath.startsWith("~/")) {
      return path.join(os.homedir(), inputPath.slice(2));
    }

    if (inputPath === "~") {
      return os.homedir();
    }

    return inputPath;
  }

  private loadConfig(): MagentaConfig {
    const defaults = MagentaConfigSchema.parse({});

    if (!fs.existsSync(this.configPath)) {
      this.writeConfig(defaults);
      return defaults;
    }

    try {
      const raw = fs.readFileSync(this.configPath, "utf-8");
      const parsed = JSON.parse(raw);
      const validated = MagentaConfigSchema.parse(parsed);
      const normalized = normalizeWorkingDirs(validated.workingDirs).map(
        (e) => ({ ...e, path: this.normalizePath(e.path) }),
      );
      return { ...validated, workingDirs: normalized };
    } catch {
      this.writeConfig(defaults);
      return defaults;
    }
  }

  private writeConfig(config: MagentaConfig): void {
    const tempPath = `${this.configPath}.tmp`;
    const serialized = JSON.stringify(config, null, 2);

    fs.writeFileSync(tempPath, serialized, "utf-8");
    fs.renameSync(tempPath, this.configPath);

    this.config = config;
  }
}
