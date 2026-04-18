import React from "react";
import { Pin } from "lucide-react";

import { colors } from "../../utils/colors";
import { Tag } from "./Tag";
import { useDensityTokens } from "../../hooks/useComponentSize";

type PinnedHeaderProps = {
  count?: number;
  /** Override the default horizontal left padding. Defaults to density rowPadX. */
  paddingLeft?: number;
  label?: string;
};

function PinnedHeaderComponent({
  count,
  paddingLeft,
  label = "Pinned",
}: PinnedHeaderProps): React.ReactElement {
  const d = useDensityTokens();
  const leftPad = paddingLeft ?? d.rowPadX;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: d.tightGap,
        padding: `${d.rowPadY}px ${d.rowPadX}px ${d.rowPadY}px ${leftPad}px`,
        borderBottom: `1px solid ${colors.borderLight}`,
        color: colors.textSecondary,
        fontSize: d.headerFont,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      <Pin size={d.iconSm} color={colors.primary} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{label}</span>
      {typeof count === "number" && (
        <Tag tone="neutral" fontSize={d.smallFont} borderColor={null}>
          {count}
        </Tag>
      )}
    </div>
  );
}

export const PinnedHeader = React.memo(PinnedHeaderComponent);
