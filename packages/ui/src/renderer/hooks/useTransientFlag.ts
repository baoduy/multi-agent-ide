import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Returns a boolean flag and a trigger function that keeps it true temporarily.
 * Useful for short-lived UI feedback (for example a "Saved" message).
 */
export function useTransientFlag(durationMs = 2000): readonly [boolean, () => void] {
  const [active, setActive] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const trigger = useCallback(() => {
    setActive(true);
    clearTimer();
    timeoutRef.current = window.setTimeout(() => {
      setActive(false);
      timeoutRef.current = null;
    }, durationMs);
  }, [clearTimer, durationMs]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return [active, trigger] as const;
}
