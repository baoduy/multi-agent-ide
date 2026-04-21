import { useEffect, type RefObject } from "react";

/**
 * Close-on-outside-click + close-on-Escape handler shared by context menus,
 * popovers, and the click-outside dialogs (ContextMenu, CommitDialog,
 * BranchPicker, FileViewer, ...). Replaces the identical `useEffect` blocks
 * that each of those components inlined.
 *
 * The `setTimeout(…, 0)` defer matches the existing callers — it prevents the
 * same click that opened the surface from immediately closing it via the new
 * document listener.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  options: { enabled?: boolean; escape?: boolean } = {},
): void {
  const { enabled = true, escape = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const handleMouseDown = (event: MouseEvent) => {
      const node = ref.current;
      if (node && !node.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (escape && event.key === "Escape") onClose();
    };

    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", handleMouseDown);
      if (escape) document.addEventListener("keydown", handleKeyDown);
    }, 0);

    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [ref, onClose, enabled, escape]);
}
