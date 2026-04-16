import React from "react";

import { colors } from "../../utils/colors";

/* ══════════════════════════════════════════
 * Tag — single base component for every inline badge/pill/chip.
 *
 * Usage
 *   <Tag tone="success">Active</Tag>
 *   <Tag tone="branch" size="sm" icon={<GitBranch size={10} />}>main</Tag>
 *   <Tag tone="success" dot>Processing</Tag>
 *   <Tag tone="success" size="lg" block icon={<CheckCircle size={11} />}>
 *     All tasks complete
 *   </Tag>
 *
 * Design
 *   - `tone` picks a semantic colour palette (bg / text / border) from the
 *     design-system tokens. Tones respond to light/dark theme automatically
 *     because they resolve to CSS variables via `colors.ts`.
 *   - `size` picks a preset (padding / radius / fontSize / fontWeight / gap).
 *   - Any individual visual prop (bg, color, borderColor, padding,
 *     borderRadius, fontSize, fontWeight, letterSpacing) can be overridden
 *     per-call-site when a tone/size doesn't fit.
 *   - `dot` renders a small pulsing circle before the label (for "live"
 *     indicators like "Processing").
 *   - `block` fills its container and centres the content — for large
 *     card-level status badges (e.g. "Approved" on a pipeline node).
 * ══════════════════════════════════════════ */

export type TagTone =
  /** Generic muted chip — low-emphasis neutral state */
  | "neutral"
  /** Even softer neutral — for counts and secondary info */
  | "muted"
  /** Informational (blue) */
  | "info"
  /** Success / active / approved (green) */
  | "success"
  /** Warning / in-progress (yellow) */
  | "warning"
  /** Error / destructive (red) */
  | "error"
  /** Brand / primary accent */
  | "primary"
  /** Git branch — cyan */
  | "branch"
  /** Repo status: has specs */
  | "spec"
  /** Repo status: active */
  | "active"
  /** Repo status: missing on disk */
  | "missing";

export type TagSize = "xs" | "sm" | "md" | "lg";

type TagPalette = { bg: string; text: string; border?: string };

/**
 * Central tone → palette map. Keep this the single source of truth so
 * every tag in the app reads from the same colour tokens.
 */
const tonePalettes: Record<TagTone, TagPalette> = {
  neutral: { bg: colors.bgHover, text: colors.textMuted },
  muted: { bg: colors.bgMuted, text: colors.textSecondary },
  info: {
    bg: colors.infoSoft,
    text: colors.infoText,
    border: colors.infoBorder,
  },
  success: {
    bg: colors.successSoft,
    text: colors.successText,
    border: colors.successSoftBorder,
  },
  warning: {
    bg: colors.warningSoft,
    text: colors.warningTextStrong,
    border: colors.warningBorder,
  },
  error: {
    bg: colors.errorSoft,
    text: colors.error,
    border: colors.errorSoftBorder,
  },
  primary: { bg: colors.bgPanelSoft, text: colors.primary },
  // Amber branch palette — Tailwind amber-200 bg / amber-600 text in light
  // mode, softened to translucent amber-500 / amber-300 in dark mode.
  // Borderless to match the other sidebar status tags (spec/active/missing).
  // Tokens defined in colours.css → --branch-bg / --branch-fg.
  branch: { bg: colors.branchBg, text: colors.branchFg },
  spec: { bg: colors.repoBadgeSpecBg, text: colors.repoBadgeSpecFg },
  active: { bg: colors.repoBadgeActiveBg, text: colors.repoBadgeActiveFg },
  missing: { bg: colors.repoBadgeMissingBg, text: colors.repoBadgeMissingFg },
};

type SizePreset = {
  padding: string;
  radius: number;
  fontSize: number;
  fontWeight: number;
  gap: number;
};

const sizePresets: Record<TagSize, SizePreset> = {
  // xs — sidebar chips (repo status, session counts, processing indicator)
  xs: { padding: "1px 6px", radius: 3, fontSize: 9, fontWeight: 600, gap: 3 },
  // sm — inline tags (branch, spec-card branch)
  sm: { padding: "2px 7px", radius: 6, fontSize: 10, fontWeight: 600, gap: 4 },
  // md — card-level state pills (spec state, filters)
  md: { padding: "3px 8px", radius: 8, fontSize: 10, fontWeight: 700, gap: 4 },
  // lg — block-level badges (pipeline "Approved", "All tasks complete")
  lg: { padding: "5px 10px", radius: 5, fontSize: 11, fontWeight: 600, gap: 4 },
};

export type TagProps = {
  /** Label text. Can also be passed via the legacy `text` prop. */
  children?: React.ReactNode;
  /** Legacy text prop — preserved for StatusBadge back-compat. */
  text?: string;

  /** Named colour palette. Default: "neutral". */
  tone?: TagTone;
  /** Size preset. Default: "sm". */
  size?: TagSize;

  /** Leading icon rendered before the label. */
  icon?: React.ReactNode;
  /** Show an animated pulsing dot before the label (live indicators). */
  dot?: boolean;
  /** Uppercase label with extra letter-spacing. */
  uppercase?: boolean;

  /* ── Raw style overrides — take precedence over `tone` / `size` ── */
  bg?: string;
  color?: string;
  /**
   * Border colour override. Pass `null` to explicitly suppress the border
   * a tone would otherwise provide.
   */
  borderColor?: string | null;
  fontSize?: number;
  fontWeight?: number;
  padding?: string;
  borderRadius?: number;
  letterSpacing?: string;

  /** Fill available width and centre content (for card-level badges). */
  block?: boolean;

  /** Legacy alias for `bg` — StatusBadge compatibility. */
  background?: string;

  /** Standard wrapper attrs. */
  title?: string;
  style?: React.CSSProperties;
  className?: string;
};

function TagComponent({
  children,
  text,
  tone = "neutral",
  size = "sm",
  icon,
  dot = false,
  uppercase = false,
  bg,
  background,
  color,
  borderColor,
  fontSize,
  fontWeight,
  padding,
  borderRadius,
  letterSpacing,
  block = false,
  title,
  style,
  className,
}: TagProps): React.ReactElement {
  const palette = tonePalettes[tone];
  const sz = sizePresets[size];

  const resolvedBg = bg ?? background ?? palette.bg;
  const resolvedColor = color ?? palette.text;
  // `borderColor === null` suppresses a tone's border entirely.
  const resolvedBorderColor =
    borderColor === null ? undefined : (borderColor ?? palette.border);

  const label = text ?? children;

  return (
    <span
      title={title}
      className={className}
      style={{
        display: block ? "flex" : "inline-flex",
        alignItems: "center",
        justifyContent: block ? "center" : undefined,
        gap: sz.gap,
        padding: padding ?? sz.padding,
        borderRadius: borderRadius ?? sz.radius,
        fontSize: fontSize ?? sz.fontSize,
        fontWeight: fontWeight ?? sz.fontWeight,
        color: resolvedColor,
        background: resolvedBg,
        border: resolvedBorderColor
          ? `1px solid ${resolvedBorderColor}`
          : undefined,
        letterSpacing:
          letterSpacing ?? (uppercase ? "0.06em" : undefined),
        textTransform: uppercase ? "uppercase" : undefined,
        whiteSpace: "nowrap",
        width: block ? "100%" : undefined,
        flexShrink: 0,
        lineHeight: 1.4,
        ...style,
      }}
    >
      {dot && <TagDot color={resolvedColor} />}
      {icon}
      {label}
    </span>
  );
}

/** Small pulsing dot used by `dot` prop. Reuses the shared
 * `provider-pulse` keyframe defined in globals.css. */
function TagDot({ color }: { color: string }): React.ReactElement {
  return (
    <span
      aria-hidden
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
        animation: "provider-pulse 1.2s ease-in-out infinite",
        flexShrink: 0,
      }}
    />
  );
}

export const Tag = React.memo(TagComponent);
