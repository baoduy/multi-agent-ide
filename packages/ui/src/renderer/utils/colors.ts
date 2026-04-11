/**
 * Centralized color constants for the Magenta IDE design system.
 * Use these instead of hardcoding hex values in components.
 */

export const colors = {
  /** Primary brand / action color */
  primary: "#C15F3C",
  /** Primary with transparency for subtle backgrounds */
  primaryAlpha: "#C15F3C08",

  /** Text colors */
  text: "#2c2c2c",
  textMuted: "#4a4540",
  textSecondary: "#6b6560",
  textTertiary: "#9a958c",

  /** Border colors */
  border: "#e5e2da",
  borderLight: "#f0ede8",

  /** Background colors */
  bgSurface: "#faf9f5",
  bgMuted: "#f5f4ed",
  bgHover: "#f0ede8",

  /** Status colors */
  success: "#16A34A",
  error: "#ef4444",
  errorDark: "#dc2626",

  /** Dialog specific */
  dialogBg: "#fff",
  dialogShadow: "0 16px 48px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.08)",
  backdropBg: "rgba(0, 0, 0, 0.35)",
} as const;
