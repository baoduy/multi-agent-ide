/**
 * System theme detection and subscription for OS-level light/dark mode preferences.
 * Enables MagentaTerminal to respect user's system settings.
 */

export type SystemTheme = "light" | "dark";

/**
 * Detect current system theme preference (light or dark mode)
 */
export function getSystemTheme(): SystemTheme {
  if (typeof window === "undefined") {
    return "dark";
  }

  // Check system preference via CSS Media Query
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  if (window.matchMedia?.("(prefers-color-scheme: light)").matches) {
    return "light";
  }

  return "dark"; // Fallback default
}

/**
 * Register a listener for system theme changes.
 * Returns an unsubscribe function.
 *
 * @param callback Function called with the new theme when system preference changes
 * @returns Unsubscribe function to clean up the listener
 */
export function onThemeChange(callback: (theme: SystemTheme) => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  const handler = (e: MediaQueryListEvent) => {
    callback(e.matches ? "dark" : "light");
  };

  // Support both addEventListener and addListener (for older browsers)
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  } else if ("addListener" in mediaQuery) {
    mediaQuery.addListener(handler);
    return () => mediaQuery.removeListener(handler);
  }

  return () => {};
}
