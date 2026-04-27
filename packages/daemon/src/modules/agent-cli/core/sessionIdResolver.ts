import { AppError } from "../../../core/errors/AppError";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ResolveSessionIdInput {
  callerProvided: string | undefined;
  generate: () => string;
}

/**
 * Pure resolver for the canonical Magenta session UUID per spec §4 Phase 5
 * "Session ID precedence rule" / FR-7.1.
 *
 * 1. Caller provides → use verbatim.
 * 2. Caller absent → call `generate` (UUID v4 generator injected by caller).
 *
 * Throws `VALIDATION_ERROR` if a caller-provided ID is not a UUID v4. The
 * generated path is trusted — we cannot validate generator output here without
 * coupling this pure function to crypto.
 */
export function resolveSessionId({ callerProvided, generate }: ResolveSessionIdInput): string {
  if (callerProvided !== undefined) {
    if (!UUID_V4_RE.test(callerProvided)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `sessionId must be a UUID v4, got: ${callerProvided}`,
      );
    }
    return callerProvided;
  }
  return generate();
}
