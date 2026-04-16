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
  statusActive: "var(--status-active)",
  statusWaiting: "var(--status-waiting)",
  statusError: "var(--status-error)",
  statusIdle: "var(--status-idle)",

  /** Branch tag colors (Tag tone="branch", BranchLabel inline) */
  branchBg: "var(--branch-bg)",
  branchFg: "var(--branch-fg)",

  /** Terminal reconnect banner */
  terminalBannerBg: "var(--terminal-banner-bg)",
  terminalBannerFg: "var(--terminal-banner-fg)",

  /** Repo badge colors */
  repoBadgeMissingBg: "var(--repo-badge-missing-bg)",
  repoBadgeMissingFg: "var(--repo-badge-missing-fg)",
  repoBadgeSpecBg: "var(--repo-badge-spec-bg)",
  repoBadgeSpecFg: "var(--repo-badge-spec-fg)",
  repoBadgeActiveBg: "var(--repo-badge-active-bg)",
  repoBadgeActiveFg: "var(--repo-badge-active-fg)",
  repoBadgeDefaultBg: "var(--repo-badge-default-bg)",
  repoBadgeDefaultFg: "var(--repo-badge-default-fg)",

  /** Stage colors */
  stagePendingBg: "var(--stage-pending-bg)",
  stagePendingFg: "var(--stage-pending-fg)",
  stagePendingDot: "var(--stage-pending-dot)",
  stagePendingBorderMuted: "var(--stage-pending-border-muted)",
  stageReviewBg: "var(--stage-review-bg)",
  stageReviewFg: "var(--stage-review-fg)",
  stageReviewDot: "var(--stage-review-dot)",
  stageReviewBorderMuted: "var(--stage-review-border-muted)",
  stageApprovedBg: "var(--stage-approved-bg)",
  stageApprovedFg: "var(--stage-approved-fg)",
  stageApprovedDot: "var(--stage-approved-dot)",
  stageApprovedBorderMuted: "var(--stage-approved-border-muted)",
  stageDefaultBg: "var(--stage-default-bg)",
  stageDefaultFg: "var(--stage-default-fg)",
  stageDefaultDot: "var(--stage-default-dot)",
  stageDefaultBorderMuted: "var(--stage-default-border-muted)",

  /** Flow + icon colors */
  flowGrid: "var(--flow-grid)",
  iconNeutral: "var(--icon-neutral)",
  iconBlue: "var(--icon-blue)",
  iconCyan: "var(--icon-cyan)",
  iconGold: "var(--icon-gold)",
  iconGreen: "var(--icon-green)",
  iconOrange: "var(--icon-orange)",
  iconPurple: "var(--icon-purple)",
  iconPink: "var(--icon-pink)",
  iconRed: "var(--icon-red)",
  iconBrown: "var(--icon-brown)",
  accentPurple: "var(--accent-purple)",

  /** Diff tokens */
  diffViewerBg: "var(--diff-viewer-bg)",
  diffViewerFg: "var(--diff-viewer-fg)",
  diffViewerMuted: "var(--diff-viewer-muted)",
  diffViewerMutedFg: "var(--diff-viewer-muted-fg)",
  diffViewerPanel: "var(--diff-viewer-panel)",
  diffViewerBorder: "var(--diff-viewer-border)",
  diffAddedBg: "var(--diff-added-bg)",
  diffAddedWordBg: "var(--diff-added-word-bg)",
  diffAddedGutterBg: "var(--diff-added-gutter-bg)",
  diffAddedText: "var(--diff-added-text)",
  diffRemovedBg: "var(--diff-removed-bg)",
  diffRemovedWordBg: "var(--diff-removed-word-bg)",
  diffRemovedGutterBg: "var(--diff-removed-gutter-bg)",
  diffRemovedText: "var(--diff-removed-text)",
  diffHighlightBg: "var(--diff-highlight-bg)",
  diffHighlightGutterBg: "var(--diff-highlight-gutter-bg)",

  /** Dialog specific */
  dialogBg: "var(--card)",
  dialogShadow: "var(--shadow-dialog)",
  shadowSoft: "var(--shadow-soft)",
  shadowPopover: "var(--shadow-popover)",
  shadowContextMenu: "var(--shadow-context-menu)",
  backdropBg: "var(--backdrop-bg)",
} as const;
