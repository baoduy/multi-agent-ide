import type { IPCBridge } from "../../../core/ipc/IPCBridge";
import { safeHandle } from "../../../core/ipc/createHandler";
import type { AiPresetService } from "../app/AiPresetService";
import type { AIPreset } from "@magenta/shared/aiPresets";

type AiPresetHandlerContext = {
  bridge: IPCBridge;
  service: AiPresetService;
};

export function registerAiPresetHandlers({
  bridge,
  service,
}: AiPresetHandlerContext): void {
  safeHandle(bridge, "ai:presets:list", async () => ({
    type: "ai:presets:listed" as const,
    presets: service.list(),
  }));

  safeHandle(bridge, "ai:presets:create", async (req) => ({
    type: "ai:presets:created" as const,
    preset: service.create(req.preset as AIPreset),
  }));

  safeHandle(bridge, "ai:presets:update", async (req) => {
    service.update(req.id, req.patch);
    return { type: "ai:presets:updated" as const, id: req.id };
  });

  safeHandle(bridge, "ai:presets:delete", async (req) => {
    service.delete(req.id);
    return { type: "ai:presets:deleted" as const, id: req.id };
  });
}
