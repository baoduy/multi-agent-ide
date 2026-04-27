import {
  AIPresetSchema,
  BUILTIN_PRESETS,
  BUILTIN_PRESET_IDS,
  type AIPreset,
} from "@magenta/shared/aiPresets";
import type { AIProvider } from "@magenta/shared/aiTerminal";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import { AppError } from "../../../core/errors/AppError";
import type { AiPresetRepository } from "../persistence/AiPresetRepository";
import { renderPresetForProvider } from "../core/presetTranslator";

export class AiPresetService {
  constructor(private readonly repo: AiPresetRepository) {}

  list(): AIPreset[] {
    return [...BUILTIN_PRESETS, ...this.repo.list()];
  }

  create(input: AIPreset): AIPreset {
    const parsed = AIPresetSchema.parse({ ...input, builtin: false });
    if (BUILTIN_PRESET_IDS.includes(parsed.id)) {
      throw new AppError(
        "BUILTIN_PRESET_READONLY",
        `Cannot create preset with built-in id: ${parsed.id}`,
      );
    }
    this.repo.create(parsed, Date.now());
    return parsed;
  }

  update(id: string, patch: Partial<AIPreset>): void {
    if (BUILTIN_PRESET_IDS.includes(id)) {
      throw new AppError(
        "BUILTIN_PRESET_READONLY",
        `Built-in preset is read-only: ${id}`,
      );
    }
    if (!this.repo.findById(id)) {
      throw new AppError("PRESET_NOT_FOUND", `Preset not found: ${id}`);
    }
    this.repo.update(id, patch, Date.now());
  }

  delete(id: string): void {
    if (BUILTIN_PRESET_IDS.includes(id)) {
      throw new AppError(
        "BUILTIN_PRESET_READONLY",
        `Built-in preset is read-only: ${id}`,
      );
    }
    this.repo.delete(id);
  }

  resolveForProvider(
    id: string,
    provider: AIProvider,
  ): Partial<AISpawnOptions> {
    const found = this.list().find((p) => p.id === id);
    if (!found) {
      throw new AppError("PRESET_NOT_FOUND", `Preset not found: ${id}`);
    }
    return renderPresetForProvider(found, provider);
  }
}
