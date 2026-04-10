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
      (loadingState as any)[loadingKey] = true;
    }
    if (errorKey) {
      (loadingState as any)[errorKey] = null;
    }
    set(loadingState as TState);

    try {
      const result = await action();
      const successState = onSuccess(result);
      if (loadingKey) {
        (successState as any)[loadingKey] = false;
      }
      set(successState as TState);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (onError) {
        const errorState = onError(error instanceof Error ? error : new Error(errorMessage));
        if (loadingKey) {
          (errorState as any)[loadingKey] = false;
        }
        set(errorState as TState);
      } else {
        const defaultErrorState: Partial<TState> = {};
        if (loadingKey) {
          (defaultErrorState as any)[loadingKey] = false;
        }
        if (errorKey) {
          (defaultErrorState as any)[errorKey] = errorMessage;
        }
        set(defaultErrorState as TState);
      }
    }
  };
}
