import React from "react";

import type { PipelineStage } from "@magenta/shared/models";

type StageDotsProps = {
  stages: PipelineStage[];
};

/**
 * Renders a series of progress dots, one for each pipeline stage.
 * - Filled/green dot: stage exists and has content
 * - Hollow/gray dot: stage is missing
 */
export function StageDots({ stages }: StageDotsProps): React.ReactElement {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {stages.map((stage) => {
        const isFilled = stage.status !== "missing";
        const dotColor = isFilled ? "#10b981" : "#d1d5db";
        const dotStyle: React.CSSProperties = {
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: dotColor,
          border: isFilled ? "none" : "1px solid #9ca3af",
        };

        return (
          <div
            key={stage.name}
            style={dotStyle}
            title={`${stage.name}: ${stage.status}`}
          />
        );
      })}
    </div>
  );
}
