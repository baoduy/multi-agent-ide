export type AppErrorCode =
  | "INTERNAL_ERROR"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "IPC_ERROR"
  | "REPO_NOT_FOUND"
  | "SPEC_PARSE_ERROR"
  | "FILE_TOO_LARGE"
  | "FILE_NOT_FOUND"
  | "FILE_EXISTS"
  | "WORKTREE_CONFLICT"
  | "WORKTREE_MISSING"
  | "GIT_ERROR"
  | "GIT_CLONE_FAILED"
  | "GIT_CONFLICT"
  | "GIT_UNSAFE_OPERATION"
  | "CONFIG_ERROR"
  | "SESSION_SYNC_ERROR"
  | "SESSION_PARSE_ERROR";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "AppError";
  }
}

/**
 * Redact the user's home directory from an error message. We build the home
 * prefix once at module load (os.homedir() rarely changes within a process)
 * and replace it with `~` in any outgoing message. This prevents the IPC
 * boundary from leaking the system username and directory structure to the
 * renderer, where an XSS'd markdown renderer could otherwise exfiltrate it.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const HOME_DIR: string = (() => {
  try {
    // Lazy require so this module stays importable in tests without Node.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require("node:os") as typeof import("node:os");
    return os.homedir();
  } catch {
    return "";
  }
})();

function redactHome(message: string): string {
  if (!HOME_DIR || HOME_DIR.length <= 1) return message;
  return message.split(HOME_DIR).join("~");
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return new AppError(error.code, redactHome(error.message), error.details);
  }

  if (error instanceof Error) {
    return new AppError("INTERNAL_ERROR", redactHome(error.message));
  }

  return new AppError("INTERNAL_ERROR", "Unknown error");
}
