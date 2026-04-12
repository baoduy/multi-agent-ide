import React from "react";
import { getProviderColor, IDLE_COLOR, type ProviderVariant } from "./providerConfig";

type ProviderDotProps = {
  /** Provider variant, or "idle" for the neutral/unassigned state. */
  variant: ProviderVariant | "idle";
  /** Dot diameter in pixels. Defaults to 8. */
  size?: number;
};

/**
 * Renders a small colored dot representing a provider or idle state.
 * Use in task cards, legends, provider selection buttons, etc.
 */
function ProviderDotComponent({ variant, size = 8 }: ProviderDotProps): React.ReactElement {
  const color = variant === "idle" ? IDLE_COLOR : getProviderColor(variant);

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-block",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

export const ProviderDot = React.memo(ProviderDotComponent);
