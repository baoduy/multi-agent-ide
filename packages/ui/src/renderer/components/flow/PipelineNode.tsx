import React from "react";
import { Handle, Position } from "reactflow";

import { calculateCompletionPercent, getStageColor } from "./diagramUtils";

interface PipelineNodeData {
  label: string;
  stageName: string;
  status: string;
  metadata?: {
    taskCount?: number;
    completedCount?: number;
    worktreeCount?: number;
    implementationProgress?: number;
  };
}

type CustomNodeProps = {
  data: PipelineNodeData;
  isConnected: boolean;
};

/**
 * Renders a single pipeline stage node in the React Flow diagram.
 * Shows stage status, completion percentage, and connects to other stages.
 */
export function PipelineNode({ data }: CustomNodeProps): React.ReactElement {
  const colors = getStageColor(data.status);
  const completionPercent = calculateCompletionPercent(data.metadata);

  const nodeStyle: React.CSSProperties = {
    width: 140,
    padding: 12,
    borderRadius: 8,
    border: `2px solid ${colors.border}`,
    backgroundColor: colors.bg,
    textAlign: "center",
    fontSize: 13,
    fontWeight: 600,
    color: colors.text,
  };

  const labelStyle: React.CSSProperties = {
    marginBottom: 6,
  };

  const statusStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 400,
    opacity: 0.8,
    marginBottom: 6,
  };

  const progressBarStyle: React.CSSProperties = {
    width: "100%",
    height: 4,
    backgroundColor: "rgba(0,0,0,0.1)",
    borderRadius: 2,
    overflow: "hidden",
  };

  const progressFillStyle: React.CSSProperties = {
    height: "100%",
    width: `${completionPercent}%`,
    backgroundColor: colors.border,
    transition: "width 0.3s ease",
  };

  const metadataStyle: React.CSSProperties = {
    fontSize: 10,
    opacity: 0.7,
    marginTop: 4,
  };

  return (
    <div style={nodeStyle}>
      <div style={labelStyle}>{data.label}</div>
      <div style={statusStyle}>{data.status}</div>

      {(data.metadata?.taskCount !== undefined ||
        data.metadata?.implementationProgress !== undefined) && (
        <>
          <div style={progressBarStyle}>
            <div style={progressFillStyle} />
          </div>
          <div style={metadataStyle}>{completionPercent}% done</div>
        </>
      )}

      {data.metadata?.worktreeCount !== undefined && data.metadata.worktreeCount > 0 && (
        <div style={metadataStyle}>{data.metadata.worktreeCount} worktrees</div>
      )}

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
