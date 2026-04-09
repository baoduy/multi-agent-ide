import React, { useState, useCallback } from "react";
import { Handle, Position } from "reactflow";
import { CheckCircle, FileText, Eye } from "lucide-react";

import { calculateCompletionPercent, getStageColor } from "./diagramUtils";

export interface PipelineNodeData {
  label: string;
  stageName: string;
  status: string;
  filePath?: string | null;
  metadata?: {
    taskCount?: number;
    completedCount?: number;
    worktreeCount?: number;
    implementationProgress?: number;
    approvedBy?: string;
    approvedAt?: string;
  };
  /** Called when user clicks the node to open the file */
  onOpenFile?: (filePath: string) => void;
  /** Called when user clicks "Approve" on a stage */
  onApprove?: (stageName: string, filePath: string) => void;
}

type CustomNodeProps = {
  data: PipelineNodeData;
  isConnected?: boolean;
};

export function PipelineNode({ data }: CustomNodeProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const isMissing = data.status === "missing";
  const colors = getStageColor(data.status);
  const completionPercent = calculateCompletionPercent(data.metadata);
  const hasFile = !!data.filePath;
  const isApproved = data.status === "approved";
  const canApprove = hasFile && !isApproved && !isMissing;

  const handleClick = useCallback(() => {
    if (data.filePath && data.onOpenFile) {
      data.onOpenFile(data.filePath);
    }
  }, [data]);

  const handleApprove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (data.filePath && data.onApprove) {
        data.onApprove(data.stageName, data.filePath);
      }
    },
    [data],
  );

  return (
    <div
      onClick={isMissing ? undefined : handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 200,
        padding: 14,
        borderRadius: 10,
        border: `2px solid ${isMissing ? "#d1d5db" : colors.border}`,
        backgroundColor: isMissing ? "#f3f4f6" : colors.bg,
        cursor: isMissing ? "not-allowed" : hasFile ? "pointer" : "default",
        textAlign: "left",
        fontSize: 13,
        transition: "box-shadow 0.15s, transform 0.12s, opacity 0.15s",
        boxShadow: hovered && hasFile && !isMissing ? "0 4px 12px rgba(0,0,0,0.1)" : "none",
        transform: hovered && hasFile && !isMissing ? "translateY(-1px)" : "none",
        opacity: isMissing ? 0.45 : 1,
        position: "relative",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: colors.text, flex: 1 }}>
          {data.label}
        </span>
        {isApproved && <CheckCircle size={14} color="#16A34A" strokeWidth={2} />}
      </div>

      {/* Status line */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          color: colors.text,
          opacity: 0.8,
          marginBottom: 6,
        }}
      >
        {isApproved ? (
          <>
            <CheckCircle size={10} strokeWidth={2} />
            <span>approved</span>
          </>
        ) : (
          <span>{data.status}</span>
        )}
      </div>

      {/* File indicator */}
      {hasFile && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
            color: colors.text,
            opacity: 0.7,
            marginBottom: 6,
          }}
        >
          <FileText size={10} strokeWidth={1.8} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {data.filePath?.split("/").pop() ?? ""}
          </span>
        </div>
      )}

      {/* Progress bar */}
      {(data.metadata?.taskCount !== undefined ||
        data.metadata?.implementationProgress !== undefined) && (
        <div style={{ marginBottom: 4 }}>
          <div
            style={{
              width: "100%",
              height: 4,
              backgroundColor: "rgba(0,0,0,0.1)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${completionPercent}%`,
                backgroundColor: completionPercent === 100 ? "#16A34A" : colors.border,
                transition: "width 0.3s ease",
              }}
            />
          </div>
          {data.metadata?.taskCount !== undefined && (
            <div style={{ fontSize: 10, opacity: 0.7, marginTop: 3, color: colors.text }}>
              {data.metadata.completedCount ?? 0}/{data.metadata.taskCount} tasks
            </div>
          )}
          {data.metadata?.implementationProgress !== undefined && (
            <div style={{ fontSize: 10, opacity: 0.7, marginTop: 3, color: colors.text }}>
              {completionPercent}% complete
            </div>
          )}
        </div>
      )}

      {data.metadata?.worktreeCount !== undefined && data.metadata.worktreeCount > 0 && (
        <div style={{ fontSize: 10, opacity: 0.7, color: colors.text }}>
          {data.metadata.worktreeCount} worktrees
        </div>
      )}

      {/* Approved badge — always visible when stage is approved */}
      {isApproved && (
        <div
          style={{
            marginTop: 8,
            width: "100%",
            padding: "5px 10px",
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 5,
            background: "#dcfce7",
            border: "1px solid #16A34A",
            color: "#166534",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <CheckCircle size={11} strokeWidth={2} />
          {data.metadata?.approvedBy
            ? `Approved by ${data.metadata.approvedBy}`
            : "Approved"}
        </div>
      )}

      {/* Approve button — shown on hover for approvable stages */}
      {canApprove && hovered && data.onApprove && (
        <button
          type="button"
          onClick={handleApprove}
          style={{
            marginTop: 8,
            width: "100%",
            padding: "5px 10px",
            fontSize: 11,
            fontWeight: 600,
            border: "none",
            borderRadius: 5,
            background: "#16A34A",
            color: "#ffffff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            transition: "background 0.12s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#15803d"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#16A34A"; }}
        >
          <CheckCircle size={11} strokeWidth={2} />
          Approve
        </button>
      )}

      {/* Open file hint — hidden for missing stages */}
      {hasFile && hovered && !isMissing && (
        <div
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: 4,
            background: "rgba(0,0,0,0.08)",
          }}
        >
          <Eye size={12} color={colors.text} strokeWidth={1.8} />
        </div>
      )}

      <Handle type="target" position={Position.Left} style={{ background: colors.border }} />
      <Handle type="source" position={Position.Right} style={{ background: colors.border }} />
    </div>
  );
}
