import React, { useCallback, useState } from "react";
import { CheckCircle, Layers } from "lucide-react";

import type { SpecFolder } from "@magenta/shared/models";
import { FlowDiagram } from "../flow/FlowDiagram";
import { ipc } from "../../utils/ipc";
import { WorktreeDialog } from "../dialogs/WorktreeDialog";

type WorkflowViewProps = {
  spec: SpecFolder | null;
  repoName: string | null;
  repoPath?: string;
  onOpenFile?: (filePath: string) => void;
  /** Called after an approve writes to disk so the parent can refresh spec data */
  onSpecChanged?: () => void;
};

/** Parse a gitref:// virtual path. */
function parseGitRef(filePath: string): { ref: string; relativePath: string } | null {
  const match = filePath.match(/^gitref:\/\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { ref: match[1], relativePath: match[2] };
}

/**
 * Workflow tab — shows the interactive pipeline diagram for the selected spec.
 * Click a node to open its file. Hover to reveal the "Approve" button.
 * Approving writes an approval heading into the MD file.
 */
export function WorkflowView({
  spec,
  repoName,
  repoPath,
  onOpenFile,
  onSpecChanged,
}: WorkflowViewProps): React.ReactElement {
  const [approving, setApproving] = useState<string | null>(null);
  const [lastApproved, setLastApproved] = useState<string | null>(null);

  // Worktree dialog state for remote-branch approval
  const [worktreeDialogState, setWorktreeDialogState] = useState<{
    stageName: string;
    filePath: string;
    branch: string;
    relativePath: string;
  } | null>(null);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);

  /** Build approval content from existing file text. */
  const buildApprovedContent = (existing: string): string => {
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const approvalLine = `**Approved by:** Steven | **Date:** ${dateStr}`;

    if (/^\*\*Approved by:\*\*/.test(existing) || /\n\*\*Approved by:\*\*/.test(existing)) {
      return existing.replace(/\*\*Approved by:\*\*.*$/m, approvalLine);
    }

    const headingMatch = existing.match(/^(#[^\n]*\n)/);
    if (headingMatch) {
      const idx = (headingMatch.index ?? 0) + headingMatch[0].length;
      return existing.slice(0, idx) + "\n" + approvalLine + "\n" + existing.slice(idx);
    }
    return approvalLine + "\n\n" + existing;
  };

  /** Direct approve for current-branch files. */
  const handleDirectApprove = useCallback(
    async (stageName: string, filePath: string) => {
      setApproving(stageName);

      try {
        const readResp = await ipc.send({ type: "file:read", filePath });
        if (readResp.type !== "file:read:result") {
          console.error("Failed to read file for approval:", readResp);
          setApproving(null);
          return;
        }

        const newContent = buildApprovedContent(readResp.content);

        const writeResp = await ipc.send({
          type: "file:write",
          filePath,
          content: newContent,
        });

        if (writeResp.type === "file:write:result" && writeResp.success) {
          setLastApproved(stageName);
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

  /** Approve via worktree — called after user confirms worktree name. */
  const handleWorktreeApprove = useCallback(
    async (worktreeName: string) => {
      if (!worktreeDialogState || !repoPath) return;

      const { stageName, relativePath, branch } = worktreeDialogState;
      setWorktreeDialogState(null);
      setApproving(stageName);
      setWorktreeError(null);

      try {
        // 1. Create worktree
        const wtResp = await ipc.send({
          type: "worktree:create",
          repoPath,
          branch,
          name: worktreeName,
        });

        if (wtResp.type === "error") {
          setWorktreeError(wtResp.message);
          setApproving(null);
          return;
        }
        if (wtResp.type !== "worktree:create:result") {
          setWorktreeError("Unexpected response when creating worktree.");
          setApproving(null);
          return;
        }

        const worktreePath = wtResp.worktreePath;
        const targetFilePath = `${worktreePath}/${relativePath}`;

        // 2. Read file from worktree
        const readResp = await ipc.send({ type: "file:read", filePath: targetFilePath });
        if (readResp.type !== "file:read:result") {
          setWorktreeError("Could not read file in worktree.");
          setApproving(null);
          return;
        }

        // 3. Write approved content
        const newContent = buildApprovedContent(readResp.content);
        const writeResp = await ipc.send({
          type: "file:write",
          filePath: targetFilePath,
          content: newContent,
        });

        if (writeResp.type === "file:write:result" && writeResp.success) {
          setLastApproved(stageName);
          onSpecChanged?.();
        } else {
          setWorktreeError("Failed to write approval to worktree file.");
        }
      } catch (err) {
        console.error("Error during worktree approval:", err);
        setWorktreeError(err instanceof Error ? err.message : String(err));
      }

      setApproving(null);
    },
    [worktreeDialogState, repoPath, onSpecChanged],
  );

  /** Dispatch: current-branch files approve directly, remote-branch shows dialog. */
  const handleApprove = useCallback(
    async (stageName: string, filePath: string) => {
      const gitRef = parseGitRef(filePath);
      if (gitRef) {
        // Remote branch — show worktree dialog
        setWorktreeDialogState({
          stageName,
          filePath,
          branch: gitRef.ref,
          relativePath: gitRef.relativePath,
        });
      } else {
        // Current branch — approve directly
        await handleDirectApprove(stageName, filePath);
      }
    },
    [handleDirectApprove],
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

      {/* Worktree name dialog for remote branch approval */}
      {worktreeDialogState && (
        <WorktreeDialog
          branch={worktreeDialogState.branch}
          onConfirm={handleWorktreeApprove}
          onCancel={() => setWorktreeDialogState(null)}
        />
      )}

      {/* Worktree error toast */}
      {worktreeError && (
        <div
          onClick={() => setWorktreeError(null)}
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: "#fae8e1",
            border: "1px solid #e5b8a5",
            borderRadius: 8,
            padding: "10px 16px",
            fontSize: 12,
            color: "#a14a2f",
            maxWidth: 360,
            zIndex: 10000,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            cursor: "pointer",
          }}
        >
          {worktreeError}
        </div>
      )}
    </div>
  );
}
