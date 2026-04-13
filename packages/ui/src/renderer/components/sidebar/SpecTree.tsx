import React from "react";

import type { SpecFolder } from "@magenta/shared/models";
import { SpecItem } from "./SpecItem";
import { colors } from "../../utils/colors";

type SpecTreeProps = {
  specs: SpecFolder[];
  /** True only when we have NO data and are waiting for the initial fetch. */
  isLoading: boolean;
  selectedSpecPath: string | null;
  onSelectSpec: (specPath: string) => void;
};

function LoadingBar(): React.ReactElement {
  return (
    <>
      <div
        style={{
          height: 2,
          width: "100%",
          background: colors.border,
          overflow: "hidden",
          borderRadius: 1,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "50%",
            height: "100%",
            background: colors.primary,
            borderRadius: 1,
            animation: "specLoadingBar 1.2s ease-in-out infinite",
          }}
        />
      </div>
    </>
  );
}

export function SpecTree({
  specs,
  isLoading,
  selectedSpecPath,
  onSelectSpec,
}: SpecTreeProps): React.ReactElement {
  // Loading — no data yet, waiting for first fetch
  if (isLoading && specs.length === 0) {
    return (
      <div style={{ padding: "14px 16px 8px" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: colors.textTertiary,
            marginBottom: 10,
          }}
        >
          Specs
        </div>
        <LoadingBar />
      </div>
    );
  }

  if (specs.length === 0) {
    return (
      <div style={{ padding: "12px 16px", fontSize: 11, color: colors.textTertiary }}>
        No specs found
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
      <div
        style={{
          padding: "14px 16px 8px",
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: colors.textTertiary,
        }}
      >
        Specs
      </div>

      {specs.map((spec) => (
        <SpecItem
          key={spec.id}
          spec={spec}
          isSelected={spec.path === selectedSpecPath}
          onSelect={onSelectSpec}
        />
      ))}
    </div>
  );
}
