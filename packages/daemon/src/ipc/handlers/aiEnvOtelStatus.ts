import { OTEL_ENV_VAR_NAMES } from "@magenta/shared/aiObservability";
import { safeHandle } from "../createHandler";
import type { IPCBridge } from "../IPCBridge";

/**
 * Phase 7 — read-only handler powering the renderer Settings panel: returns
 * which of the 11 OTel env vars are present in the daemon's `process.env`.
 * The daemon is the authority because it's the parent of the spawned CLIs;
 * a renderer-side check would only see the renderer's own env, not what
 * actually reaches Copilot.
 */
export function registerAiEnvOtelStatus(bridge: IPCBridge): void {
  safeHandle(bridge, "ai:env:otel-status", async () => ({
    type: "ai:env:otel-status:result" as const,
    vars: OTEL_ENV_VAR_NAMES.map((name) => {
      const v = process.env[name];
      return { name, present: typeof v === "string" && v.length > 0 };
    }),
  }));
}
