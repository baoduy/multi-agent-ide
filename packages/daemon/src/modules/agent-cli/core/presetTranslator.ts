import type { AIPreset } from "@magenta/shared/aiPresets";
import type { AIProvider } from "@magenta/shared/aiTerminal";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";

/**
 * Render an `AIPreset` for a single provider.
 *
 * Built-in presets are authored explicitly per provider — no syntax
 * translation happens here. The pattern translator (`toolPatternTranslator.ts`)
 * exists for *user-authored* presets that opt-in to single-source authoring;
 * those are produced by future preset CRUD UI work and not by this Phase 4.
 */
export function renderPresetForProvider(
  preset: AIPreset,
  provider: AIProvider,
): Partial<AISpawnOptions> {
  return provider === "claude" ? preset.claude : preset.copilot;
}
