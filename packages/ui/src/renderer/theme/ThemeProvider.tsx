import React, { useCallback, useEffect, useMemo, useState } from "react";

/** User-facing preference: light / dark / follow OS. */
export type ThemePreference = "light" | "dark" | "system";
/** Resolved palette actually applied to the DOM. */
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "magenta.theme";

interface ThemeContextValue {
  /** The user's chosen preference ("light" | "dark" | "system"). */
  preference: ThemePreference;
  /** The resolved palette currently applied ("light" | "dark"). */
  resolved: ResolvedTheme;
  /** Set the preference explicitly. */
  setPreference: (pref: ThemePreference) => void;
  /** Cycle light → dark → system → light. */
  cyclePreference: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // ignore
  }
  return "system";
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * ThemeProvider manages three states — "light", "dark", and "system" —
 * and applies the resolved palette by toggling the `dark` class on <html>.
 *
 * "system" follows `prefers-color-scheme` and live-updates when the OS preference changes.
 * The concrete palettes live in globals.css under `:root` and `.dark`.
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readStoredPreference(),
  );
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());

  const resolved: ResolvedTheme =
    preference === "system" ? systemTheme : preference;

  // Listen for OS colour-scheme changes so "system" mode live-updates.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Apply resolved palette + persist preference.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (resolved === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    root.dataset.theme = resolved;
    root.dataset.themePreference = preference;
    try {
      window.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // ignore
    }
  }, [resolved, preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
  }, []);

  const cyclePreference = useCallback(() => {
    setPreferenceState((current) => {
      if (current === "light") return "dark";
      if (current === "dark") return "system";
      return "light";
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference, cyclePreference }),
    [preference, resolved, setPreference, cyclePreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
