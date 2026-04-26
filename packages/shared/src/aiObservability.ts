import { z } from "zod";
import { TokenUsageSchema } from "./aiStreamEvent";

/**
 * Phase 7 — observability event payloads emitted as IPC push events from the
 * daemon. Each variant maps 1:1 to a parsed `AIStreamEvent` from the Phase 2
 * stream-json reducer; see `streamJsonParser.ts` for the upstream source.
 */

export const PluginInstallStatusSchema = z.enum([
  "started",
  "installed",
  "failed",
  "completed",
]);
export type PluginInstallStatus = z.infer<typeof PluginInstallStatusSchema>;

export const RetryEventSchema = z.object({
  sessionId: z.string(),
  attempt: z.number().int().positive(),
  max: z.number().int().positive(),
  delayMs: z.number().int().nonnegative(),
  category: z.string(),
  status: z.number().int().optional(),
});
export type RetryEvent = z.infer<typeof RetryEventSchema>;

export const SessionInitEventSchema = z.object({
  sessionId: z.string(),
  model: z.string(),
  tools: z.array(z.string()),
  mcpServers: z.array(z.string()),
  pluginErrors: z
    .array(z.object({ name: z.string(), message: z.string() }))
    .optional(),
});
export type SessionInitEvent = z.infer<typeof SessionInitEventSchema>;

export const PluginInstallEventSchema = z.object({
  sessionId: z.string(),
  plugin: z.string(),
  status: PluginInstallStatusSchema,
  message: z.string().optional(),
});
export type PluginInstallEvent = z.infer<typeof PluginInstallEventSchema>;

export const CostUpdateEventSchema = z.object({
  sessionId: z.string(),
  tokenUsage: TokenUsageSchema,
  costUsd: z.number().nonnegative(),
  retryCount: z.number().int().nonnegative(),
});
export type CostUpdateEvent = z.infer<typeof CostUpdateEventSchema>;

export const DebugLogChunkSchema = z.object({
  sessionId: z.string(),
  seq: z.number().int().nonnegative(),
  bytes: z.string(),
});
export type DebugLogChunk = z.infer<typeof DebugLogChunkSchema>;

/**
 * The 11 OpenTelemetry environment variables Copilot honours. Documented in
 * the renderer Settings panel so users opt in at the shell level; the daemon
 * forwards whichever are present at spawn time.
 */
export const OTEL_ENV_VAR_NAMES = [
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "OTEL_EXPORTER_OTLP_PROTOCOL",
  "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
  "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
  "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
  "OTEL_RESOURCE_ATTRIBUTES",
  "OTEL_SERVICE_NAME",
  "OTEL_LOG_LEVEL",
  "OTEL_METRIC_EXPORT_INTERVAL",
  "COPILOT_OTEL_ENABLED",
] as const;
export type OTelEnvVarName = (typeof OTEL_ENV_VAR_NAMES)[number];
