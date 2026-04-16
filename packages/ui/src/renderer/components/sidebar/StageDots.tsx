import React from "react";

import type { PipelineStage } from "@magenta/shared/models";
import type { StageStatus } from "@magenta/shared/constants";
import { stageStatusColor } from "../../utils/stageColors";
import { colors } from "../../utils/colors";

type StageDotsProps = {
  stages: PipelineStage[];
};

/**
 * Renders a series of colour-coded progress dots, one per pipeline stage.
 * Each dot's colour reflects its current status so the sidebar stays
 * visually consistent with the detailed stage pills in the Specs tab:
 *
 *  - missing  → hollow gray ring
 *  - draft    → amber
 *  - review   → blue
 *  - approved → green
 *  - idle     → light green
 *  - running  → amber (pulsing)
 */
export const StageDots = React.memo(function StageDots({ stages }: StageDotsProps): React.ReactElement {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
      {stages.map((stage) => {
        const isMissing = stage.status === "missing";
        const isPending = stage.status === "pending";
        const isRunning = stage.status === "running";
        const isInProgress = stage.status === "in-progress";
        const colors = stageStatusColor(stage.status as StageStatus);

        const dotStyle: React.CSSProperties = {
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: isMissing || isPending ? "transparent" : colors.dot,
          border: isMissing || isPending ? `1.5px solid ${colors.borderMuted}` : "none",
          transition: "background-color 0.2s, border-color 0.2s",
          ...(isRunning || isInProgress ? { animation: "stagePulse 1.4s ease-in-out infinite" } : {}),
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
});
