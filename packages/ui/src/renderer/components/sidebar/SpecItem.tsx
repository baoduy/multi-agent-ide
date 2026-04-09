import React from "react";

import type { SpecFolder } from "@magenta/shared/models";
import { StageDots } from "./StageDots";

type SpecItemProps = {
  spec: SpecFolder;
  isSelected: boolean;
  onSelect: (specPath: string) => void;
};

export function SpecItem({ spec, isSelected, onSelect }: SpecItemProps): React.ReactElement {
  return (
    <div
      style={{
        padding: "8px 16px",
        backgroundColor: isSelected ? "#f0f0ff" : "transparent",
        borderLeft: isSelected ? "2px solid #5b57d1" : "2px solid transparent",
        cursor: "pointer",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        transition: "background-color 0.12s",
      }}
      onClick={() => onSelect(spec.path)}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = "#f4f4f6";
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: isSelected ? 500 : 400,
          color: "#1e1e2e",
          flex: 1,
          marginRight: 12,
          lineHeight: 1.4,
        }}
      >
        {spec.name}
      </span>
      <StageDots stages={spec.stages} />
    </div>
  );
}
