import { useSessionStore } from "../store/sessionStore";
import type { ComponentDensity } from "@magenta/shared/models";

/**
 * Global UI density preference ("xs" or "sm"). Read from sessionStore.
 * Components that accept an optional `size` prop fall back to this value
 * when the caller doesn't pass one explicitly.
 */
export function useComponentSize(): ComponentDensity {
  return useSessionStore((s) => s.componentDensity);
}

/**
 * Resolve a size prop: return the explicit value when provided, otherwise
 * fall back to the global density preference.
 */
export function useResolvedSize<T extends string>(
  explicit: T | undefined,
): T | ComponentDensity {
  const density = useComponentSize();
  return explicit ?? density;
}

/**
 * Density-driven spacing, font, and radius tokens used by chrome-level
 * components (dialogs, list rows, tree headers, status bars). All values
 * are in pixels unless noted.
 */
export type DensityTokens = {
  /** Base body/row font size. */
  font: number;
  /** Secondary/muted text next to base. */
  mutedFont: number;
  /** Tiny text (timestamps, badges). */
  smallFont: number;
  /** Section-header/label font. */
  headerFont: number;

  /** Row horizontal padding. */
  rowPadX: number;
  /** Row vertical padding. */
  rowPadY: number;
  /** Row internal content gap. */
  rowGap: number;
  /** Tighter internal gap for inline icon+text pairs. */
  tightGap: number;

  /** Left indentation used for nested children in tree views. */
  indentStep: number;
  /** Additional inner indentation for children under a section header. */
  childIndent: number;

  /** Small inline icons (chevrons, leading icons). */
  iconSm: number;
  /** Medium icons used in group headers. */
  iconMd: number;

  /** Dialog container border radius. */
  dialogRadius: number;
  /** Dialog header padding (CSS shorthand). */
  dialogHeaderPad: string;
  /** Dialog body padding. */
  dialogBodyPad: string;
  /** Dialog footer padding. */
  dialogFooterPad: string;
  /** Dialog header title font size. */
  dialogHeaderFont: number;
  /** Gap between dialog header/footer items. */
  dialogGap: number;
};

const TOKENS: Record<ComponentDensity, DensityTokens> = {
  xs: {
    font: 11,
    mutedFont: 10,
    smallFont: 10,
    headerFont: 11,

    rowPadX: 8,
    rowPadY: 2,
    rowGap: 4,
    tightGap: 3,

    indentStep: 24,
    childIndent: 10,

    iconSm: 10,
    iconMd: 11,

    dialogRadius: 8,
    dialogHeaderPad: "5px 10px 3px",
    dialogBodyPad: "6px 10px",
    dialogFooterPad: "5px 10px 7px",
    dialogHeaderFont: 10,
    dialogGap: 4,
  },
  sm: {
    font: 12,
    mutedFont: 11,
    smallFont: 10,
    headerFont: 12,

    rowPadX: 12,
    rowPadY: 5,
    rowGap: 6,
    tightGap: 6,

    indentStep: 36,
    childIndent: 16,

    iconSm: 12,
    iconMd: 14,

    dialogRadius: 12,
    dialogHeaderPad: "8px 12px 6px",
    dialogBodyPad: "10px 12px",
    dialogFooterPad: "8px 12px 10px",
    dialogHeaderFont: 12,
    dialogGap: 6,
  },
};

export function useDensityTokens(): DensityTokens {
  return TOKENS[useComponentSize()];
}
