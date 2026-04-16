import React, { useState } from "react";

type ClickableRowProps = {
  children: React.ReactNode;
  onClick?: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  selected?: boolean;
  defaultBackground?: string;
  hoverBackground?: string;
  selectedBackground?: string;
  leftBorder?: string;
  selectedLeftBorder?: string;
  borderBottom?: string;
  padding?: string;
  gap?: number;
  alignItems?: React.CSSProperties["alignItems"];
  justifyContent?: React.CSSProperties["justifyContent"];
  textAlign?: React.CSSProperties["textAlign"];
  style?: React.CSSProperties;
};

export function ClickableRow({
  children,
  onClick,
  onContextMenu,
  selected = false,
  defaultBackground = "transparent",
  hoverBackground,
  selectedBackground,
  leftBorder,
  selectedLeftBorder,
  borderBottom,
  padding = "5px 10px",
  gap = 0,
  alignItems = "center",
  justifyContent = "flex-start",
  textAlign = "left",
  style,
}: ClickableRowProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  const background = selected
    ? (selectedBackground ?? hoverBackground ?? defaultBackground)
    : (hovered ? (hoverBackground ?? defaultBackground) : defaultBackground);

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        padding,
        display: "flex",
        alignItems,
        justifyContent,
        gap,
        background,
        border: "none",
        borderBottom,
        borderLeft: selected ? (selectedLeftBorder ?? leftBorder) : leftBorder,
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.12s, border-color 0.12s",
        textAlign,
        fontFamily: "inherit",
        ...style,
      }}
    >
      {children}
    </button>
  );
}