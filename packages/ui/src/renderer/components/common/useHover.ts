import { useCallback, useState } from "react";

/**
 * Consolidates the 24-file pattern of:
 *   const [hovered, setHovered] = useState(false);
 *   <el onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} />
 *
 * Prefer CSS `:hover` via the utility classes where possible. Reach for this
 * hook only when the hover state has to drive React logic that CSS can't
 * express (e.g. conditional rendering of overlays).
 */
export function useHover(): {
  hovered: boolean;
  bind: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
} {
  const [hovered, setHovered] = useState(false);
  const onMouseEnter = useCallback(() => setHovered(true), []);
  const onMouseLeave = useCallback(() => setHovered(false), []);
  return { hovered, bind: { onMouseEnter, onMouseLeave } };
}
