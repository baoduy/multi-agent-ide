import React from "react";

import type { SpecFolder } from "@magenta/shared/models";
import { SpecItem } from "./SpecItem";
import { colors } from "../../utils/colors";
import { useSortedSpecs } from "../../hooks/useSortedSpecs";

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

export const SpecTree = React.memo(function SpecTree({
  specs,
  isLoading,
  selectedSpecPath,
  onSelectSpec,
}: SpecTreeProps): React.ReactElement {
  // Sort MUST be called unconditionally (React hooks rules)
  const sortedSpecs = useSortedSpecs(specs);

  // Loading — no data yet, waiting for first fetch
  if (isLoading && specs.length === 0) {
    return (
      <div style={{ padding: "5px 10px" }}>
        <LoadingBar />
      </div>
    );
  }

  if (sortedSpecs.length === 0) {
    return (
      <div style={{ padding: "5px 10px", fontSize: 11, color: colors.textTertiary }}>
        No specs found
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 4 }}>
      {sortedSpecs.map((spec) => (
        <SpecItem
          key={spec.id}
          spec={spec}
          isSelected={spec.path === selectedSpecPath}
          onSelect={onSelectSpec}
        />
      ))}
    </div>
  );
});
