import type { MagentaConfig } from "@magenta/shared/config";
import type { ConfigManager } from "../config/ConfigManager";

/**
 * ConfigApplicationService orchestrates config operations.
 */
export class ConfigApplicationService {
  constructor(private configManager: ConfigManager) {}

  getConfig() {
    return this.configManager.getConfig();
  }

  updateConfig(partial: Partial<MagentaConfig>) {
    return this.configManager.updateConfig(partial);
  }

  addWorkingDir(path: string) {
    return this.configManager.addWorkingDir(path);
  }

  removeWorkingDir(path: string) {
    return this.configManager.removeWorkingDir(path);
  }
}
