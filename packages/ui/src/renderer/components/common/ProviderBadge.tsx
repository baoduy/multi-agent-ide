import React from "react";
import { ProviderIcon } from "./ProviderIcon";
import { getProviderName, type ProviderVariant } from "./providerConfig";

type ProviderBadgeProps = {
  provider: ProviderVariant;
  /** Icon size in pixels. Defaults to 14. */
  iconSize?: number;
  /** Font size in pixels. Defaults to 12. */
  fontSize?: number;
  /** Text color. Defaults to current text color. */
  color?: string;
  /** Font weight. Defaults to 500. */
  fontWeight?: number;
};

/**
 * Renders a provider icon + display name inline.
 * Use this anywhere you need to show the provider identity (list items, headers, status bars).
 */
function ProviderBadgeComponent({
  provider,
  iconSize = 14,
  fontSize = 12,
  color,
  fontWeight = 500,
}: ProviderBadgeProps): React.ReactElement {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <ProviderIcon provider={provider} size={iconSize} />
      <span
        style={{
          fontSize,
          fontWeight,
          color,
          flexShrink: 0,
        }}
      >
        {getProviderName(provider)}
      </span>
    </span>
  );
}

export const ProviderBadge = React.memo(ProviderBadgeComponent);
