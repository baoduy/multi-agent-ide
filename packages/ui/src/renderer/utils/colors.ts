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
  primaryAlpha: "var(--color-primary-soft)",

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
  bgPanel: "#f5f4ed",
  bgPanelSoft: "#faf5f2",
  bgCodeInline: "#eeece6",
  bgWhite: "#ffffff",

  /** Border/neutral helpers */
  borderMuted: "#d1cec6",
  borderStrong: "#b5b1a8",

  /** Text helpers */
  textStrong: "#2c2c2c",
  textWhite: "#ffffff",

  /** Status colors */
  success: "#16A34A",
  successHover: "#15803d",
  successSoft: "#dcfce7",
  successSoftBorder: "#bbf7d0",
  successMuted: "#86efac",
  successText: "#166534",
  warningSoft: "#fef3c7",
  warningText: "#7c6a3e",
  warningBorder: "#fde68a",
  warningTextStrong: "#92400e",
  warningTextDeep: "#9a3412",
  warningBorderSoft: "#fed7aa",
  infoSoft: "#dbeafe",
  infoText: "#1e40af",
  infoBorder: "#bfdbfe",
  info: "#3b82f6",
  progressSoft: "#fce4ec",
  progressText: "#9f1239",
  progressBorder: "#fda4af",
  error: "var(--destructive)",
  errorSoft: "#fae8e1",
  errorSoftBorder: "#e5b8a5",
  errorDark: "color-mix(in srgb, var(--destructive) 80%, black)",

  /** Dialog specific */
  dialogBg: "var(--card)",
  dialogShadow: "0 16px 48px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.08)",
  shadowSoft: "0 4px 12px rgba(0, 0, 0, 0.1)",
  backdropBg: "rgba(0, 0, 0, 0.55)",
} as const;
