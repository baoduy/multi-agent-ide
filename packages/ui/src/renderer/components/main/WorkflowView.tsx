import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle, GitBranch, Layers } from "lucide-react";

import type { SpecFolder } from "@magenta/shared/models";
import { FlowDiagram } from "../flow/FlowDiagram";
import { ipc } from "../../utils/ipc";
import { WorktreeDialog } from "../dialogs/WorktreeDialog";
import { useWorktreeStore } from "../../store/worktreeStore";
import { useSpecStore } from "../../store/specStore";

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
  const [gitUserName, setGitUserName] = useState<string>("");

  // Fetch git user name/email when repoPath changes
  useEffect(() => {
    if (!repoPath) return;
    ipc.send({ type: "git:user", repoPath }).then((resp) => {
      if (resp.type === "git:user:result") {
        setGitUserName(resp.name || resp.email || "Unknown");
      }
    }).catch(() => {
      // Fallback silently
    });
  }, [repoPath]);

  // Worktree dialog state for remote-branch approval
  const [worktreeDialogState, setWorktreeDialogState] = useState<{
    stageName: string;
    filePath: string;
    branch: string;
    relativePath: string;
  } | null>(null);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);

  // Spec store — optimistic approval update
  const optimisticApproveStage = useSpecStore((s) => s.optimisticApproveStage);

  // Worktree store — look up existing worktrees
  const getWorktreeForBranch = useWorktreeStore((s) => s.getWorktreeForBranch);
  const addWorktree = useWorktreeStore((s) => s.addWorktree);
  const fetchWorktrees = useWorktreeStore((s) => s.fetchWorktrees);

  /** Build approval content from existing file text. */
  const buildApprovedContent = (existing: string): string => {
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const approvalLine = `**Approved by:** ${gitUserName || "Unknown"} | **Date:** ${dateStr}`;

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
          // Optimistically update the store so the node color changes immediately
          if (spec) {
            optimisticApproveStage(spec.path, stageName, gitUserName || "Unknown");
          }
          onSpecChanged?.();
        } else {
          console.error("Failed to write approval:", writeResp);
        }
      } catch (err) {
        console.error("Error during approval:", err);
      }

      setApproving(null);
    },
    [onSpecChanged, spec, optimisticApproveStage, gitUserName],
  );

  /** Approve using an existing worktree path (no dialog needed). */
  const handleApproveWithWorktreePath = useCallback(
    async (stageName: string, worktreePath: string, relativePath: string) => {
      setApproving(stageName);
      setWorktreeError(null);

      try {
        const targetFilePath = `${worktreePath}/${relativePath}`;

        const readResp = await ipc.send({ type: "file:read", filePath: targetFilePath });
        if (readResp.type !== "file:read:result") {
          setWorktreeError("Could not read file in worktree.");
          setApproving(null);
          return;
        }

        const newContent = buildApprovedContent(readResp.content);
        const writeResp = await ipc.send({
          type: "file:write",
          filePath: targetFilePath,
          content: newContent,
        });

        if (writeResp.type === "file:write:result" && writeResp.success) {
          setLastApproved(stageName);
          // Optimistically update the store so the node color changes immediately
          if (spec) {
            optimisticApproveStage(spec.path, stageName, gitUserName || "Unknown");
          }
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
    [onSpecChanged, spec, optimisticApproveStage, gitUserName],
  );

  /** Approve via worktree — called after user confirms worktree name in dialog. */
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

        // Register the new worktree in the store
        addWorktree({
          repoPath,
          worktreePath: wtResp.worktreePath,
          branch,
          name: worktreeName,
          createdAt: Date.now(),
        });

        // Refresh the full list from daemon
        void fetchWorktrees(repoPath);

        // 2. Approve using the worktree
        setApproving(null); // handleApproveWithWorktreePath will set it
        await handleApproveWithWorktreePath(stageName, wtResp.worktreePath, relativePath);
      } catch (err) {
        console.error("Error during worktree creation:", err);
        setWorktreeError(err instanceof Error ? err.message : String(err));
        setApproving(null);
      }
    },
    [worktreeDialogState, repoPath, addWorktree, fetchWorktrees, handleApproveWithWorktreePath],
  );

  /** Dispatch: current-branch files approve directly, remote-branch checks store first. */
  const handleApprove = useCallback(
    async (stageName: string, filePath: string) => {
      const gitRef = parseGitRef(filePath);
      if (gitRef && repoPath) {
        // Check if a worktree already exists for this branch
        const existing = getWorktreeForBranch(repoPath, gitRef.ref);
        if (existing) {
          // Worktree exists — approve directly, skip dialog
          await handleApproveWithWorktreePath(stageName, existing.worktreePath, gitRef.relativePath);
        } else {
          // No worktree — show dialog
          setWorktreeDialogState({
            stageName,
            filePath,
            branch: gitRef.ref,
            relativePath: gitRef.relativePath,
          });
        }
      } else {
        // Current branch — approve directly
        await handleDirectApprove(stageName, filePath);
      }
    },
    [handleDirectApprove, handleApproveWithWorktreePath, getWorktreeForBranch, repoPath],
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
            <>
              <GitBranch
                size={12}
                color="#9a958c"
                strokeWidth={1.8}
                style={{ marginLeft: 8, verticalAlign: "middle", display: "inline" }}
              />
              <span style={{ fontSize: 12, color: "#9a958c", marginLeft: 4 }}>
                {repoName}
              </span>
            </>
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
