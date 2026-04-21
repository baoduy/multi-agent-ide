import React from "react";

/**
 * Flex-row primitive — thin wrapper over the `.row-*` utility classes in
 * globals.css. Replaces the ~220 inline `display:flex; alignItems:center; gap:X`
 * clusters scattered through the renderer.
 *
 * Usage: `<Row gap="base">...</Row>` renders `<div class="row-base">`, with
 * the gap driven by the shared `--gap-*` tokens. Pass `inline` for
 * inline-flex, `justify`/`align` for non-default axes. Extra props (style,
 * onClick, className, aria-*) are spread onto the underlying div.
 */
export type RowGap = "none" | "tight" | "base" | "loose" | number;

type RowProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  gap?: RowGap;
  align?: React.CSSProperties["alignItems"];
  justify?: React.CSSProperties["justifyContent"];
  inline?: boolean;
  as?: "div" | "span" | "section" | "header" | "footer" | "nav" | "ul" | "li";
  children?: React.ReactNode;
};

const GAP_CLASS: Record<Exclude<RowGap, number>, string> = {
  none: "row",
  tight: "row-tight",
  base: "row-base",
  loose: "row-loose",
};

export function Row({
  gap = "base",
  align,
  justify,
  inline = false,
  as = "div",
  className,
  style,
  children,
  ...rest
}: RowProps) {
  const numericGap = typeof gap === "number";
  const baseClass = inline ? "inline-row" : numericGap ? "row" : GAP_CLASS[gap];
  const finalClass = className ? `${baseClass} ${className}` : baseClass;

  const finalStyle: React.CSSProperties | undefined =
    numericGap || align || justify || style
      ? {
          ...(numericGap ? { gap: `${gap as number}px` } : null),
          ...(align ? { alignItems: align } : null),
          ...(justify ? { justifyContent: justify } : null),
          ...style,
        }
      : undefined;

  return React.createElement(
    as,
    { className: finalClass, style: finalStyle, ...rest },
    children,
  );
}
