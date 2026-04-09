import React from "react";

import type { SpecFolder } from "@magenta/shared/models";
import { StageDots } from "./StageDots";

type SpecItemProps = {
  spec: SpecFolder;
  isSelected: boolean;
  onSelect: (specPath: string) => void;
};

/**
 * Renders a single spec folder item in the spec tree.
 * Displays the spec name, stage progress dots, and handles selection.
 */
export function SpecItem({ spec, isSelected, onSelect }: SpecItemProps): React.ReactElement {
  const containerStyle: React.CSSProperties = {
    padding: "8px 12px",
    marginBottom: 4,
    backgroundColor: isSelected ? "#e0e7ff" : "transparent",
    borderRadius: 4,
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    transition: "background-color 0.2s",
  };

  const nameStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: isSelected ? 600 : 400,
    color: "#1f2937",
    flex: 1,
    marginRight: 12,
  };

  return (
    <div
      style={containerStyle}
      onClick={() => onSelect(spec.path)}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = "#f3f4f6";
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      <span style={nameStyle}>{spec.name}</span>
      <StageDots stages={spec.stages} />
    </div>
  );
}
