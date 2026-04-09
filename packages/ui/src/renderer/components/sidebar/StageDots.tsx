import React from "react";

import type { PipelineStage } from "@magenta/shared/models";
import type { StageStatus } from "@magenta/shared/constants";
import { stageStatusColor } from "../../utils/stageColors";

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
export function StageDots({ stages }: StageDotsProps): React.ReactElement {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
      {stages.map((stage) => {
        const isMissing = stage.status === "missing";
        const isRunning = stage.status === "running";
        const colors = stageStatusColor(stage.status as StageStatus);

        const dotStyle: React.CSSProperties = {
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: isMissing ? "transparent" : colors.dot,
          border: isMissing ? "1.5px solid #d1cec6" : "none",
          transition: "background-color 0.2s, border-color 0.2s",
          ...(isRunning ? { animation: "stagePulse 1.4s ease-in-out infinite" } : {}),
        };

        return (
          <div
            key={stage.name}
            style={dotStyle}
            title={`${stage.name}: ${stage.status}`}
          />
        );
      })}

      {/* Pulse animation for "running" stages */}
      {stages.some((s) => s.status === "running") && (
        <style>{`@keyframes stagePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
      )}
    </div>
  );
}
