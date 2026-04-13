import React from "react";

import type { SpecFolder } from "@magenta/shared/models";
import { ScrollableText } from "../common/ScrollableText";
import { StageDots } from "./StageDots";
import { colors } from "../../utils/colors";

type SpecItemProps = {
  spec: SpecFolder;
  isSelected: boolean;
  onSelect: (specPath: string) => void;
};

export function SpecItem({ spec, isSelected, onSelect }: SpecItemProps): React.ReactElement {
  return (
    <div
      style={{
        padding: "7px 16px",
        backgroundColor: isSelected ? colors.bgHover : "transparent",
        borderLeft: isSelected ? `2px solid ${colors.primary}` : "2px solid transparent",
        cursor: "pointer",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        transition: "background-color 0.12s",
      }}
      onClick={() => onSelect(spec.path)}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = colors.bgCodeInline;
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      <ScrollableText
        style={{
          fontSize: 11,
          fontWeight: isSelected ? 500 : 400,
          color: colors.textStrong,
          flex: 1,
          marginRight: 12,
          lineHeight: 1.4,
        }}
      >
        {spec.name}
      </ScrollableText>
      <StageDots stages={spec.stages} />
    </div>
  );
}
