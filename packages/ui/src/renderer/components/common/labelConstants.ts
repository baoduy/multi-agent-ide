/* ── Shared size & variant presets for label components ── */

export type LabelSize = "xs" | "sm" | "md";

export const sizeMap: Record<LabelSize, { icon: number; font: number; gap: number }> = {
  xs: { icon: 10, font: 10, gap: 3 },
  sm: { icon: 12, font: 11, gap: 4 },
  md: { icon: 13, font: 12, gap: 5 },
};

export type LabelVariant = "light" | "dark";
