/**
 * Centralized color constants for the Magenta IDE design system.
 * Use these instead of hardcoding hex values in components.
 */

export const colors = {
  /** Primary brand / action color */
  primary: "var(--primary)",
  /** Primary text color for contrast on primary backgrounds */
  primaryForeground: "var(--primary-foreground)",
  /** Primary with transparency for subtle backgrounds */
  primaryAlpha: "#C15F3C08",

  /** Text colors */
  text: "var(--foreground)",
  textMuted: "var(--secondary-foreground)",
  textSecondary: "color-mix(in srgb, var(--foreground) 75%, white)",
  textTertiary: "var(--muted-foreground)",

  /** Border colors */
  border: "var(--border)",
  borderLight: "color-mix(in srgb, var(--border) 70%, white)",

  /** Background colors */
  bgSurface: "var(--background)",
  bgMuted: "var(--muted)",
  bgHover: "var(--accent)",

  /** Status colors */
  success: "#16A34A",
  error: "var(--destructive)",
  errorDark: "color-mix(in srgb, var(--destructive) 80%, black)",

  /** Dialog specific */
  dialogBg: "var(--card)",
  dialogShadow: "0 16px 48px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.08)",
  backdropBg: "rgba(0, 0, 0, 0.35)",
} as const;
