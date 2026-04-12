import type { StoreApi } from "zustand";

/**
 * Creates an idempotent subscription initializer for Zustand stores.
 * Wraps the common pattern:
 *   if (get().subscriptionsReady) return;
 *   set({ subscriptionsReady: true });
 *   // ...register event listeners
 *
 * @param get - Zustand get function
 * @param set - Zustand set function
 * @param setup - Function that registers IPC event listeners
 */
export function createSubscriptionInitializer<
  TState extends { subscriptionsReady: boolean },
>(
  get: StoreApi<TState>["getState"],
  set: StoreApi<TState>["setState"],
  setup: () => void,
): () => void {
  return () => {
    if (get().subscriptionsReady) return;
    set({ subscriptionsReady: true } as Partial<TState>);
    setup();
  };
}
