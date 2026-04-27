import { AppError } from "../../../core/errors/AppError";

export interface ForkArgvInput {
  parentResumeToken: string;
  childCanonicalId: string;
  capability: {
    supportsForkSession: boolean;
    supportsExplicitSessionId: boolean;
    provider: "claude" | "copilot";
  };
}

/**
 * Pure builder for the argv suffix that translates a fork operation into
 * provider-specific flags.
 *
 * Claude:  `--resume <parent> --fork-session --session-id <child>`
 * Copilot: not supported — raises `UNSUPPORTED_SPAWN_OPTION` per FR-7.7.
 */
export function buildForkArgv({
  parentResumeToken,
  childCanonicalId,
  capability,
}: ForkArgvInput): string[] {
  if (!capability.supportsForkSession) {
    throw new AppError(
      "UNSUPPORTED_SPAWN_OPTION",
      `Provider '${capability.provider}' does not support --fork-session`,
    );
  }
  const argv = ["--resume", parentResumeToken, "--fork-session"];
  if (capability.supportsExplicitSessionId) {
    argv.push("--session-id", childCanonicalId);
  }
  return argv;
}
