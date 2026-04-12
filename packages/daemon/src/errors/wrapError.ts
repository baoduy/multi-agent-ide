import { AppError, type AppErrorCode } from "./AppError";

/**
 * Wraps a synchronous function call, catching errors and re-throwing as AppError.
 * Eliminates repeated try-catch-rethrow boilerplate in application services.
 */
export function wrapError<T>(fn: () => T, code: AppErrorCode, operation: string): T {
  try {
    return fn();
  } catch (error) {
    throw new AppError(
      code,
      `Failed to ${operation}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Wraps an async function call, catching errors and re-throwing as AppError.
 */
export async function wrapErrorAsync<T>(fn: () => Promise<T>, code: AppErrorCode, operation: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw new AppError(
      code,
      `Failed to ${operation}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
