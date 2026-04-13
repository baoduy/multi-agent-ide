import React, { createContext, useEffect } from "react";
import themeConfig from "../theme/theme-config.json";

export interface ThemeConfig {
  colors: Record<string, string>;
  typography: Record<string, Record<string, string>>;
  spacing: Record<string, string>;
  radius: Record<string, string>;
  animation?: Record<string, Record<string, string>>;
  scrollbar?: Record<string, string>;
}

interface ThemeContextType {
  config: ThemeConfig;
  applyTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * ThemeProvider injects CSS variables from theme-config.json to the document root.
 * Automatically applies light theme on mount and enforces light-only policy.
 *
 * All theme tokens (colors, typography, spacing, radius) are available as CSS variables.
 *
 * Usage:
 *   <ThemeProvider>
 *     <App />
 *   </ThemeProvider>
 *
 * Accessing theme tokens in components:
 *   - Via CSS: background-color: var(--color-primary);
 *   - Via useThemeConfig hook: const { getColor } = useThemeConfig();
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const applyTheme = React.useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;

    // Enforce light theme
    root.classList.remove("dark");
    root.dataset.theme = "light";

    // Apply color tokens as CSS variables
    Object.entries(themeConfig.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });

    // Apply typography tokens
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

    // Apply spacing tokens
    Object.entries(themeConfig.spacing).forEach(([key, value]) => {
      root.style.setProperty(`--space-${key}`, value);
    });

    // Apply radius tokens
    Object.entries(themeConfig.radius).forEach(([key, value]) => {
      root.style.setProperty(`--radius-${key}`, value);
    });

    // Apply animation tokens
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

    // Apply scrollbar tokens
    if (themeConfig.scrollbar) {
      Object.entries(themeConfig.scrollbar).forEach(([key, value]) => {
        root.style.setProperty(`--scrollbar-${key}`, value);
      });
    }
  }, []);

  useEffect(() => {
    applyTheme();
  }, [applyTheme]);

  const value: ThemeContextType = {
    config: themeConfig as ThemeConfig,
    applyTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
