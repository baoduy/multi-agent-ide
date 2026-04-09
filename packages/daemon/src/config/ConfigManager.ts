import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { MagentaConfigSchema, type MagentaConfig } from "@magenta/shared/config";

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
    return { ...this.config, workingDirs: [...this.config.workingDirs] };
  }

  addWorkingDir(dirPath: string): MagentaConfig {
    const normalizedPath = this.normalizePath(dirPath);

    if (!this.config.workingDirs.includes(normalizedPath)) {
      this.config.workingDirs = [...this.config.workingDirs, normalizedPath];
      this.writeConfig(this.config);
    }

    return this.getConfig();
  }

  removeWorkingDir(dirPath: string): MagentaConfig {
    const normalizedPath = this.normalizePath(dirPath);

    this.config.workingDirs = this.config.workingDirs.filter((workingDir) => workingDir !== normalizedPath);
    this.writeConfig(this.config);

    return this.getConfig();
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
      return { ...validated, workingDirs: validated.workingDirs.map((workingDir) => this.normalizePath(workingDir)) };
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
