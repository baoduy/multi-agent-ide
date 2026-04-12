export type AppErrorCode =
  | "INTERNAL_ERROR"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "IPC_ERROR"
  | "REPO_NOT_FOUND"
  | "SPEC_PARSE_ERROR"
  | "FILE_TOO_LARGE"
  | "FILE_NOT_FOUND"
  | "WORKTREE_CONFLICT"
  | "GIT_ERROR"
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

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError("INTERNAL_ERROR", error.message);
  }

  return new AppError("INTERNAL_ERROR", "Unknown error");
}
