import React from "react";

import type { SpecFolder } from "@magenta/shared/models";
import { ClickableRow } from "../common/ClickableRow";
import { ScrollableText } from "../common/ScrollableText";
import { StageDots } from "./StageDots";
import { colors } from "../../utils/colors";

type SpecItemProps = {
  spec: SpecFolder;
  isSelected: boolean;
  onSelect: (specPath: string) => void;
};

export const SpecItem = React.memo(function SpecItem({ spec, isSelected, onSelect }: SpecItemProps): React.ReactElement {
  const handleClick = React.useCallback(() => onSelect(spec.path), [onSelect, spec.path]);

  return (
    <ClickableRow
      onClick={handleClick}
      selected={isSelected}
      padding="7px 14px"
      justifyContent="space-between"
      defaultBackground="transparent"
      hoverBackground={colors.bgCodeInline}
      selectedBackground={colors.bgHover}
      leftBorder="2px solid transparent"
      selectedLeftBorder={`2px solid ${colors.primary}`}
    >
      <ScrollableText
        style={{
          fontSize: 11,
          fontWeight: isSelected ? 500 : 400,
          color: colors.textStrong,
          flex: 1,
          marginRight: 8,
          lineHeight: 1.4,
        }}
      >
        {spec.name}
      </ScrollableText>
      <StageDots stages={spec.stages} />
    </ClickableRow>
  );
});
