import React from "react";

import type { SpecFolder } from "@magenta/shared/models";
import { SpecItem } from "./SpecItem";

type SpecTreeProps = {
  specs: SpecFolder[];
  isLoading: boolean;
  selectedSpecPath: string | null;
  onSelectSpec: (specPath: string) => void;
};

export function SpecTree({
  specs,
  isLoading,
  selectedSpecPath,
  onSelectSpec,
}: SpecTreeProps): React.ReactElement {
  if (isLoading) {
    return (
      <div style={{ padding: "12px 16px", fontSize: 12, color: "#8b8b96" }}>
        Loading specs...
      </div>
    );
  }

  if (specs.length === 0) {
    return (
      <div style={{ padding: "12px 16px", fontSize: 12, color: "#8b8b96" }}>
        No specs found
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
      <div
        style={{
          padding: "14px 16px 8px",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#8b8b96",
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
