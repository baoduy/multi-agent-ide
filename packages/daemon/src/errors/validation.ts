import { AppError } from "./AppError";

/**
 * Asserts that a value is non-null/undefined, throwing a VALIDATION_ERROR if it is.
 * Use this instead of repeating `if (!val) throw new AppError(...)` patterns.
 */
export function requireField<T>(value: T | null | undefined, name: string): asserts value is T {
  if (value == null) {
    throw new AppError("VALIDATION_ERROR", `Missing ${name}`);
  }
}

/**
 * Asserts that a string value is non-empty, throwing a VALIDATION_ERROR if it is.
 */
export function requireNonEmpty(value: string | null | undefined, name: string): asserts value is string {
  if (!value) {
    throw new AppError("VALIDATION_ERROR", `Missing ${name}`);
  }
}
