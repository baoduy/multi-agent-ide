import React from "react";

import type { SpecFolder } from "@magenta/shared/models";
import { SpecItem } from "./SpecItem";

type SpecTreeProps = {
  specs: SpecFolder[];
  /** True only when we have NO data and are waiting for the initial fetch. */
  isLoading: boolean;
  selectedSpecPath: string | null;
  onSelectSpec: (specPath: string) => void;
};

/* ── Inline loading bar animation via CSS keyframes ── */
const loadingBarKeyframes = `
@keyframes specLoadingBar {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
`;

function LoadingBar(): React.ReactElement {
  return (
    <>
      <style>{loadingBarKeyframes}</style>
      <div
        style={{
          height: 2,
          width: "100%",
          background: "#e5e2da",
          overflow: "hidden",
          borderRadius: 1,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "50%",
            height: "100%",
            background: "#C15F3C",
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
            color: "#9a958c",
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
      <div style={{ padding: "12px 16px", fontSize: 11, color: "#9a958c" }}>
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
          color: "#9a958c",
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
