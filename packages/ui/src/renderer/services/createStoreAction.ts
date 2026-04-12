import type { StoreApi } from "zustand";

type SetState<T> = StoreApi<T>["setState"];

/**
 * Options for creating an async store action.
 */
interface AsyncActionOptions<TState, TResult> {
  /** Zustand set function */
  set: SetState<TState>;
  /** Key in state to use for loading indicator. Pass null to skip loading state. */
  loadingKey?: keyof TState | null;
  /** Key in state to use for error message. Pass null to skip error state. */
  errorKey?: keyof TState | null;
  /** The async action to execute */
  action: () => Promise<TResult>;
  /** Called on success — return partial state to merge */
  onSuccess: (result: TResult) => Partial<TState>;
  /** Optional: called on error — return partial state to merge. Defaults to setting errorKey. */
  onError?: (error: Error) => Partial<TState>;
}

/**
 * Helper to set a dynamic key on a partial state object.
 * Uses a type-safe approach instead of `as any`.
 */
function setKey<T>(obj: Partial<T>, key: keyof T, value: unknown): void {
  (obj as Record<keyof T, unknown>)[key] = value;
}

/**
 * Creates an async store action with standardized loading/error lifecycle.
 * Eliminates the repeated set-loading → try → set-result/catch → set-error pattern.
 */
export function createAsyncAction<TState, TResult>(
  options: AsyncActionOptions<TState, TResult>
): () => Promise<void> {
  const {
    set,
    loadingKey = "isLoading" as keyof TState,
    errorKey = "error" as keyof TState,
    action,
    onSuccess,
    onError,
  } = options;

  return async () => {
    // Set loading state
    const loadingState: Partial<TState> = {};
    if (loadingKey) {
      setKey(loadingState, loadingKey, true);
    }
    if (errorKey) {
      setKey(loadingState, errorKey, null);
    }
    set(loadingState as TState);

    try {
      const result = await action();
      const successState = onSuccess(result);
      if (loadingKey) {
        setKey(successState, loadingKey, false);
      }
      set(successState as TState);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (onError) {
        const errorState = onError(error instanceof Error ? error : new Error(errorMessage));
        if (loadingKey) {
          setKey(errorState, loadingKey, false);
        }
        set(errorState as TState);
      } else {
        const defaultErrorState: Partial<TState> = {};
        if (loadingKey) {
          setKey(defaultErrorState, loadingKey, false);
        }
        if (errorKey) {
          setKey(defaultErrorState, errorKey, errorMessage);
        }
        set(defaultErrorState as TState);
      }
    }
  };
}
