import { useContext } from "react";
import { ThemeContext } from "../theme/ThemeProvider";

/**
 * Hook for accessing theme configuration and utilities.
 *
 * Usage:
 *   const { getColor, getSpace, getRadius, config } = useThemeConfig();
 *   const primaryColor = getColor("primary");
 *   const padding = getSpace("lg");
 *
 * Returns:
 *   - config: Full ThemeConfig object with all tokens
 *   - getColor(key): Get a color value by key
 *   - getSpace(key): Get a spacing value by key
 *   - getRadius(key): Get a radius value by key
 *   - getFont(type, key): Get a typography value (fontFamily, fontSize, fontWeight, lineHeight)
 */
export const useThemeConfig = () => {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error(
      "useThemeConfig must be used within a ThemeProvider. " +
        "Wrap your component tree with <ThemeProvider> at the root."
    );
  }

  const { config } = context;

  return {
    config,

    /**
     * Get a color token value
     * @param key Color key from theme config (e.g., "primary", "background")
     * @returns Color hex value or CSS variable reference
     */
    getColor: (key: string): string => {
      return config.colors[key] || `var(--color-${key})`;
    },

    /**
     * Get a spacing token value
     * @param key Spacing key from theme config (e.g., "lg", "md")
     * @returns Spacing value (e.g., "1rem")
     */
    getSpace: (key: string): string => {
      return config.spacing[key] || `var(--space-${key})`;
    },

    /**
     * Get a radius token value
     * @param key Radius key from theme config (e.g., "lg", "md")
     * @returns Radius value (e.g., "0.75rem")
     */
    getRadius: (key: string): string => {
      return config.radius[key] || `var(--radius-${key})`;
    },

    /**
     * Get a typography token value
     * @param type Typography type ("fontFamily", "fontSize", "fontWeight", "lineHeight")
     * @param key Token key
     * @returns Font value
     */
    getFont: (type: "fontFamily" | "fontSize" | "fontWeight" | "lineHeight", key: string): string => {
      const typeMap = {
        fontFamily: config.typography.fontFamily,
        fontSize: config.typography.fontSize,
        fontWeight: config.typography.fontWeight,
        lineHeight: config.typography.lineHeight,
      };

      const values = typeMap[type];
      if (!values) {
        console.warn(`Unknown font type: ${type}`);
        return "";
      }

      return values[key] || "";
    },

    /**
     * Get all color tokens as an object
     */
    getColors: () => config.colors,

    /**
     * Get all typography tokens as an object
     */
    getTypography: () => config.typography,

    /**
     * Get all spacing tokens as an object
     */
    getSpacing: () => config.spacing,

    /**
     * Get all radius tokens as an object
     */
    getRadii: () => config.radius,
  };
};
