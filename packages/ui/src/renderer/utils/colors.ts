/**
 * Centralized color constants for the Magenta IDE design system.
 * All values reference CSS custom properties defined in globals.css,
 * ensuring they respond to light/dark theme changes automatically.
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
  textSecondary: "color-mix(in srgb, var(--foreground) 75%, transparent)",
  textTertiary: "var(--muted-foreground)",

  /** Border colors */
  border: "var(--border)",
  borderLight: "color-mix(in srgb, var(--border) 70%, transparent)",

  /** Background colors */
  bgSurface: "var(--background)",
  bgMuted: "var(--muted)",
  bgHover: "var(--accent)",
  bgPanel: "var(--panel)",
  bgPanelSoft: "var(--panel-soft)",
  bgCodeInline: "var(--code-inline-bg)",
  bgWhite: "var(--surface)",

  /** Border/neutral helpers */
  borderMuted: "var(--border-muted)",
  borderStrong: "var(--border-strong)",

  /** Text helpers */
  textStrong: "var(--text-strong)",
  textWhite: "var(--text-on-primary)",

  /** Status colors */
  success: "var(--success)",
  successHover: "var(--success-hover)",
  successSoft: "var(--success-soft)",
  successSoftBorder: "var(--success-soft-border)",
  successMuted: "var(--success-muted)",
  successText: "var(--success-text)",
  warningSoft: "var(--warning-soft)",
  warningText: "var(--warning-text)",
  warningBorder: "var(--warning-border)",
  warningTextStrong: "var(--warning-text-strong)",
  warningTextDeep: "var(--warning-text-deep)",
  warningBorderSoft: "var(--warning-border-soft)",
  infoSoft: "var(--info-soft)",
  infoText: "var(--info-text)",
  infoBorder: "var(--info-border)",
  info: "var(--info)",
  progressSoft: "var(--progress-soft)",
  progressText: "var(--progress-text)",
  progressBorder: "var(--progress-border)",
  error: "var(--destructive)",
  errorSoft: "var(--error-soft)",
  errorSoftBorder: "var(--error-soft-border)",
  errorDark: "color-mix(in srgb, var(--destructive) 80%, black)",

  /** Dialog specific */
  dialogBg: "var(--card)",
  dialogShadow: "0 16px 48px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.08)",
  shadowSoft: "0 4px 12px rgba(0, 0, 0, 0.1)",
  backdropBg: "rgba(0, 0, 0, 0.55)",
} as const;
