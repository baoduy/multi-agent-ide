import type { DatabaseService } from "../../../core/db/DatabaseService";
import type { LmdbDatabase } from "../../../core/db/LmdbStore";
import type { AIPreset } from "@magenta/shared/aiPresets";

/**
 * LMDB-backed repository for user-authored AI tool presets.
 *
 * Sub-db layout:
 *   ai_presets:
 *     preset:${id} → { preset: AIPreset, createdAt: number, updatedAt: number }
 *
 * Built-in presets are not stored here — they live in shared/aiPresets.ts.
 * This sub-db only persists user CRUD. The repository deliberately stores
 * `builtin: false` rows; see AiPresetService for the merge with built-ins.
 */
type PresetRow = {
  preset: AIPreset;
  createdAt: number;
  updatedAt: number;
};

export class AiPresetRepository {
  private readonly db: LmdbDatabase<PresetRow>;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getDb<PresetRow>("ai_presets");
  }

  list(): AIPreset[] {
    const out: AIPreset[] = [];
    for (const entry of this.db.range({ prefix: "preset:" })) {
      out.push(entry.value.preset);
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  findById(id: string): AIPreset | undefined {
    const row = this.db.get(`preset:${id}`);
    return row?.preset;
  }

  create(preset: AIPreset, now: number): void {
    this.databaseService.transactionSync(() => {
      this.db.putSync(`preset:${preset.id}`, {
        preset,
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  update(id: string, patch: Partial<AIPreset>, now: number): void {
    const existing = this.db.get(`preset:${id}`);
    if (!existing) return;
    const next: AIPreset = { ...existing.preset, ...patch, id, builtin: false };
    this.databaseService.transactionSync(() => {
      this.db.putSync(`preset:${id}`, {
        preset: next,
        createdAt: existing.createdAt,
        updatedAt: now,
      });
    });
  }

  delete(id: string): void {
    this.databaseService.transactionSync(() => {
      this.db.removeSync(`preset:${id}`);
    });
  }
}
