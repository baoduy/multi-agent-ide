import React, { useCallback, useEffect, useMemo, useState } from "react";
import themeConfig from "../theme/theme-config.json";

export interface ThemeConfig {
  colors: Record<string, string>;
  typography: Record<string, Record<string, string>>;
  spacing: Record<string, string>;
  radius: Record<string, string>;
  animation?: Record<string, Record<string, string>>;
  scrollbar?: Record<string, string>;
}

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

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === "system" ? getSystemTheme() : pref;
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

  const applyTokens = useCallback(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;

    // Color tokens from theme-config.json (kept for backwards compatibility).
    Object.entries(themeConfig.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });

    if (themeConfig.typography.fontFamily) {
      Object.entries(themeConfig.typography.fontFamily).forEach(([key, value]) => {
        root.style.setProperty(`--font-${key}`, value);
      });
    }
    if (themeConfig.typography.fontSize) {
      Object.entries(themeConfig.typography.fontSize).forEach(([key, value]) => {
        root.style.setProperty(`--text-${key}`, value);
      });
    }
    if (themeConfig.typography.fontWeight) {
      Object.entries(themeConfig.typography.fontWeight).forEach(([key, value]) => {
        root.style.setProperty(`--font-weight-${key}`, value);
      });
    }
    if (themeConfig.typography.lineHeight) {
      Object.entries(themeConfig.typography.lineHeight).forEach(([key, value]) => {
        root.style.setProperty(`--line-height-${key}`, value);
      });
    }

    Object.entries(themeConfig.spacing).forEach(([key, value]) => {
      root.style.setProperty(`--space-${key}`, value);
    });
    Object.entries(themeConfig.radius).forEach(([key, value]) => {
      root.style.setProperty(`--radius-${key}`, value);
    });

    if (themeConfig.animation?.duration) {
      Object.entries(themeConfig.animation.duration).forEach(([key, value]) => {
        root.style.setProperty(`--animation-duration-${key}`, value);
      });
    }
    if (themeConfig.animation?.timing) {
      Object.entries(themeConfig.animation.timing).forEach(([key, value]) => {
        root.style.setProperty(`--animation-timing-${key}`, value);
      });
    }
    if (themeConfig.scrollbar) {
      Object.entries(themeConfig.scrollbar).forEach(([key, value]) => {
        root.style.setProperty(`--scrollbar-${key}`, value);
      });
    }
  }, []);

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

  useEffect(() => {
    applyTokens();
  }, [applyTokens]);

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
