/* ── Shared size & variant presets for label components ── */

export type LabelSize = "xs" | "sm" | "md" | "lg";

export const sizeMap: Record<LabelSize, { icon: number; font: number; gap: number }> = {
  xs: { icon: 9, font: 9, gap: 2 },
  sm: { icon: 12, font: 11, gap: 4 },
  md: { icon: 13, font: 12, gap: 5 },
  lg: { icon: 14, font: 13, gap: 6 },
};

/** Boxed-icon presets — used when RepoLabel renders the icon in a rounded box */
export const boxedIconMap: Record<LabelSize, { box: number; radius: number; icon: number }> = {
  xs: { box: 16, radius: 4, icon: 9 },
  sm: { box: 22, radius: 5, icon: 12 },
  md: { box: 26, radius: 5, icon: 14 },
  lg: { box: 30, radius: 6, icon: 16 },
};

export type LabelVariant = "light" | "dark";
