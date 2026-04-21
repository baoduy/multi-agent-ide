import { useEffect, type DependencyList } from "react";

/**
 * Runs an effect on the next tick via `setTimeout(…, 0)`.
 *
 * Consolidates the ~6 places (ContextMenu, CommitDialog, BranchPicker,
 * FileViewer, AISessionsView, …) that manually defer a document listener so
 * the click that opened a popover doesn't immediately close it.
 *
 * `effect` may return a cleanup function (identical to useEffect). The
 * cleanup runs whether the deferred `effect` fired or not, so it's safe to
 * unmount synchronously.
 */
export function useDeferredEffect(
  effect: () => void | (() => void),
  deps: DependencyList,
): void {
  useEffect(() => {
    let cleanup: void | (() => void);
    const id = window.setTimeout(() => {
      cleanup = effect();
    }, 0);
    return () => {
      window.clearTimeout(id);
      if (typeof cleanup === "function") cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
