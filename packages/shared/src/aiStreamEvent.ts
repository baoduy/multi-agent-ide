import { z } from "zod";

export const TokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheCreationInputTokens: z.number().int().nonnegative().optional(),
  cacheReadInputTokens: z.number().int().nonnegative().optional(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

const PluginErrorSchema = z.object({
  name: z.string(),
  message: z.string(),
});
export type PluginError = z.infer<typeof PluginErrorSchema>;

const Base = {
  sessionId: z.string(),
  seq: z.number().int().nonnegative(),
  timestamp: z.number().int().nonnegative(),
};

/**
 * Provider-neutral typed event derived from a structured CLI output stream
 * (Claude `--output-format stream-json` today; future providers may emit a
 * subset). Every variant carries `{sessionId, seq, timestamp}` so consumers
 * can order, dedupe, and key UI updates uniformly. Spec §8.2 (FR-5.1).
 */
export const AIStreamEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("session-init"),
    ...Base,
    model: z.string(),
    tools: z.array(z.string()),
    mcpServers: z.array(z.string()),
    pluginErrors: z.array(PluginErrorSchema).optional(),
  }),
  z.object({
    kind: z.literal("plugin-install"),
    ...Base,
    plugin: z.string(),
    status: z.enum(["started", "installed", "failed", "completed"]),
    error: z.string().optional(),
  }),
  z.object({
    kind: z.literal("assistant-text"),
    ...Base,
    text: z.string(),
    partial: z.boolean(),
  }),
  z.object({
    kind: z.literal("assistant-think"),
    ...Base,
    text: z.string(),
  }),
  z.object({
    kind: z.literal("tool-use"),
    ...Base,
    tool: z.string(),
    summary: z.string(),
    id: z.string(),
  }),
  z.object({
    kind: z.literal("tool-result"),
    ...Base,
    id: z.string(),
    ok: z.boolean(),
    summary: z.string().optional(),
  }),
  z.object({
    kind: z.literal("permission-request"),
    ...Base,
    tool: z.string(),
    scope: z.string(),
    id: z.string(),
  }),
  z.object({
    kind: z.literal("retry"),
    ...Base,
    attempt: z.number().int().positive(),
    max: z.number().int().positive(),
    delayMs: z.number().int().nonnegative(),
    category: z.string(),
    status: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal("result"),
    ...Base,
    ok: z.boolean(),
    output: z.unknown().optional(),
    tokenUsage: TokenUsageSchema.optional(),
    costUsd: z.number().nonnegative().optional(),
    /** Set when the provider terminated due to a budget/turn cap. */
    capExceeded: z.enum(["budget", "turns"]).optional(),
  }),
  z.object({
    kind: z.literal("raw-pty"),
    ...Base,
    bytes: z.string(),
  }),
]);
export type AIStreamEvent = z.infer<typeof AIStreamEventSchema>;
