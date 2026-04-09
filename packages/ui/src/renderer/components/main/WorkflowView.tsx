import React, { useCallback, useState } from "react";
import { CheckCircle, Layers } from "lucide-react";

import type { SpecFolder } from "@magenta/shared/models";
import { FlowDiagram } from "../flow/FlowDiagram";
import { ipc } from "../../utils/ipc";

type WorkflowViewProps = {
  spec: SpecFolder | null;
  repoName: string | null;
  onOpenFile?: (filePath: string) => void;
  /** Called after an approve writes to disk so the parent can refresh spec data */
  onSpecChanged?: () => void;
};

/**
 * Workflow tab — shows the interactive pipeline diagram for the selected spec.
 * Click a node to open its file. Hover to reveal the "Approve" button.
 * Approving writes an approval heading into the MD file.
 */
export function WorkflowView({
  spec,
  repoName,
  onOpenFile,
  onSpecChanged,
}: WorkflowViewProps): React.ReactElement {
  const [approving, setApproving] = useState<string | null>(null);
  const [lastApproved, setLastApproved] = useState<string | null>(null);

  const handleApprove = useCallback(
    async (stageName: string, filePath: string) => {
      setApproving(stageName);

      try {
        // 1. Read the current file content
        const readResp = await ipc.send({ type: "file:read", filePath });
        if (readResp.type !== "file:read:result") {
          console.error("Failed to read file for approval:", readResp);
          setApproving(null);
          return;
        }

        const existing = readResp.content;
        const now = new Date();
        const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
        const approvalLine = `**Approved by:** Steven | **Date:** ${dateStr}`;

        // 2. Check if there's already an approval line
        let newContent: string;
        if (/^\*\*Approved by:\*\*/.test(existing) || /\n\*\*Approved by:\*\*/.test(existing)) {
          // Replace existing approval line
          newContent = existing.replace(
            /\*\*Approved by:\*\*.*$/m,
            approvalLine,
          );
        } else {
          // Insert after the first heading (# ...) or at the very top
          const headingMatch = existing.match(/^(#[^\n]*\n)/);
          if (headingMatch) {
            const idx = (headingMatch.index ?? 0) + headingMatch[0].length;
            newContent =
              existing.slice(0, idx) + "\n" + approvalLine + "\n" + existing.slice(idx);
          } else {
            newContent = approvalLine + "\n\n" + existing;
          }
        }

        // 3. Write back
        const writeResp = await ipc.send({
          type: "file:write",
          filePath,
          content: newContent,
        });

        if (writeResp.type === "file:write:result" && writeResp.success) {
          setLastApproved(stageName);
          // Notify parent to refresh
          onSpecChanged?.();
        } else {
          console.error("Failed to write approval:", writeResp);
        }
      } catch (err) {
        console.error("Error during approval:", err);
      }

      setApproving(null);
    },
    [onSpecChanged],
  );

  if (!spec) {
    return (
      <div
        style={{
          padding: 24,
          color: "#9a958c",
          fontSize: 13,
          textAlign: "center",
        }}
      >
        <Layers size={32} color="#d1cec6" strokeWidth={1.5} style={{ marginBottom: 12 }} />
        <div>Select a spec from the Specs tab to view its workflow.</div>
      </div>
    );
  }

  const approvedStages = spec.stages.filter((s) => s.status === "approved");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header bar */}
      <div
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid #e5e2da",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
          background: "#faf9f5",
        }}
      >
        <Layers size={16} color="#C15F3C" strokeWidth={1.8} />
        <div style={{ flex: 1 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#2c2c2c",
            }}
          >
            {spec.name}
          </span>
          {repoName && (
            <span style={{ fontSize: 12, color: "#9a958c", marginLeft: 8 }}>
              {repoName}
            </span>
          )}
        </div>

        {/* Approval summary */}
        {approvedStages.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 10px",
              borderRadius: 12,
              background: "#dcfce7",
              color: "#166534",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <CheckCircle size={12} strokeWidth={2} />
            {approvedStages.length}/{spec.stages.length} approved
          </div>
        )}

        {/* Toast for last approved */}
        {lastApproved && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 10px",
              borderRadius: 12,
              background: "#16A34A",
              color: "#ffffff",
              fontSize: 11,
              fontWeight: 600,
              animation: "fadeIn 0.2s",
            }}
          >
            <CheckCircle size={12} strokeWidth={2} />
            {lastApproved} approved
          </div>
        )}

        {/* Approving spinner */}
        {approving && (
          <span style={{ fontSize: 11, color: "#9a958c" }}>
            Approving {approving}...
          </span>
        )}
      </div>

      {/* Instruction bar */}
      <div
        style={{
          padding: "8px 20px",
          background: "#f5f4ed",
          borderBottom: "1px solid #e5e2da",
          fontSize: 11,
          color: "#9a958c",
          flexShrink: 0,
        }}
      >
        Click a stage to open its file. Hover and click <strong>Approve</strong> to add approval to the file header.
      </div>

      {/* Flow diagram fills remaining space */}
      <div style={{ flex: 1 }}>
        <FlowDiagram spec={spec} onOpenFile={onOpenFile} onApprove={handleApprove} />
      </div>
    </div>
  );
}
