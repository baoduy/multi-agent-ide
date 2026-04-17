import React, { useEffect, useState } from "react";
import { CheckCircle, GitBranch } from "lucide-react";

import { ipc } from "../../utils/ipc";
import { colors } from "../../utils/colors";
import { useWorktreeStore } from "../../store/worktreeStore";
import { WorktreeDialog } from "../dialogs/WorktreeDialog";
import { isGitRefPath, parseGitRef } from "./fileViewerUtils";

type Props = {
  filePath: string;
  content: string;
  /** Required for gitref:// files — the repo root path */
  repoPath?: string;
  onApproved: (newContent: string) => void;
  /**
   * Optional element rendered immediately after the main button, visually
   * fused as a split-button group (e.g. a chevron that opens a menu). When
   * set, the main button's right corners are squared so the two elements
   * read as a single control.
   */
  rightSlot?: React.ReactNode;
};

export function ApproveButton({
  filePath,
  content,
  repoPath,
  onApproved,
  rightSlot,
}: Props): React.ReactElement | null {
  const grouped = rightSlot != null;
  const leftRadius = grouped ? "6px 0 0 6px" : "6px";
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [showWorktreeDialog, setShowWorktreeDialog] = useState(false);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);

  const getWorktreeForBranch = useWorktreeStore((s) => s.getWorktreeForBranch);
  const addWorktree = useWorktreeStore((s) => s.addWorktree);
  const fetchWorktrees = useWorktreeStore((s) => s.fetchWorktrees);

  // NOTE: all hooks must be declared before any early return to preserve hook order.
  const [gitUserName, setGitUserName] = useState<string>("");
  useEffect(() => {
    if (!repoPath) return;
    ipc
      .send({ type: "git:user", repoPath })
      .then((resp) => {
        if (resp.type === "git:user:result") {
          setGitUserName(resp.name || resp.email || "Unknown");
        }
      })
      .catch(() => {
        /* fall back silently */
      });
  }, [repoPath]);

  const isGitRef = isGitRefPath(filePath);
  const gitRef = isGitRef ? parseGitRef(filePath) : null;

  const existingWorktree =
    isGitRef && gitRef && repoPath ? getWorktreeForBranch(repoPath, gitRef.ref) : null;

  const isAlreadyApproved = /\*\*Approved by:\*\*/.test(content);
  if (isAlreadyApproved || approved) {
    const match = content.match(
      /\*\*Approved by:\*\*\s*([^|]+?)\s*\|\s*\*\*Date:\*\*\s*(\S+)/,
    );
    const approverName = match ? match[1].trim() : "—";

    return (
      <div style={{ display: "inline-flex" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 600,
            color: colors.success,
            background: colors.successSoft,
            border: `1px solid ${colors.successSoftBorder}`,
            borderRadius: leftRadius,
            borderRight: grouped ? "none" : undefined,
          }}
        >
          <CheckCircle size={13} strokeWidth={2} />
          <span>Approved by {approverName}</span>
        </div>
        {rightSlot}
      </div>
    );
  }

  const buildApprovedContent = (original: string): string => {
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const approvalLine = `**Approved by:** ${gitUserName || "Unknown"} | **Date:** ${dateStr}`;

    let result: string;
    const headingMatch = original.match(/^(#[^\n]*\n)/);
    if (headingMatch) {
      const idx = (headingMatch.index ?? 0) + headingMatch[0].length;
      result = original.slice(0, idx) + "\n" + approvalLine + "\n" + original.slice(idx);
    } else {
      result = approvalLine + "\n\n" + original;
    }

    // Promote Draft status to Ready on approval.
    return result.replace(/(\*\*Status\*\*:\s*)Draft/i, "$1Ready");
  };

  const handleDirectApprove = async () => {
    setApproving(true);
    try {
      const newContent = buildApprovedContent(content);
      const writeResp = await ipc.send({
        type: "file:write",
        filePath,
        content: newContent,
      });

      if (writeResp.type === "file:write:result" && writeResp.success) {
        setApproved(true);
        onApproved(newContent);
      }
    } catch (err) {
      console.error("Error during approval:", err);
    }
    setApproving(false);
  };

  const handleWorktreeApproveWithPath = async (worktreePath: string) => {
    if (!gitRef) return;

    setApproving(true);
    setWorktreeError(null);

    try {
      const targetFilePath = `${worktreePath}/${gitRef.relativePath}`;

      const readResp = await ipc.send({ type: "file:read", filePath: targetFilePath });
      if (readResp.type !== "file:read:result") {
        setWorktreeError(
          `Could not read file in worktree: ${readResp.type === "error" ? readResp.message : "Unknown error"}`,
        );
        setApproving(false);
        return;
      }

      const newContent = buildApprovedContent(readResp.content);
      const writeResp = await ipc.send({
        type: "file:write",
        filePath: targetFilePath,
        content: newContent,
      });

      if (writeResp.type === "file:write:result" && writeResp.success) {
        setApproved(true);
        onApproved(newContent);
      } else {
        setWorktreeError("Failed to write approval to the worktree file.");
      }
    } catch (err) {
      console.error("Error during worktree approval:", err);
      setWorktreeError(err instanceof Error ? err.message : String(err));
    }
    setApproving(false);
  };

  const handleWorktreeApprove = async (worktreeName: string) => {
    if (!gitRef || !repoPath) return;

    setShowWorktreeDialog(false);
    setApproving(true);
    setWorktreeError(null);

    try {
      const wtResp = await ipc.send({
        type: "worktree:create",
        repoPath,
        branch: gitRef.ref,
        name: worktreeName,
      });

      if (wtResp.type === "error") {
        setWorktreeError(wtResp.message);
        setApproving(false);
        return;
      }

      if (wtResp.type !== "worktree:create:result") {
        setWorktreeError("Unexpected response when creating worktree.");
        setApproving(false);
        return;
      }

      addWorktree({
        repoPath,
        worktreePath: wtResp.worktreePath,
        branch: gitRef.ref,
        name: worktreeName,
        createdAt: Date.now(),
      });

      void fetchWorktrees(repoPath);

      setApproving(false); // handleWorktreeApproveWithPath sets it again
      await handleWorktreeApproveWithPath(wtResp.worktreePath);
    } catch (err) {
      console.error("Error during worktree creation:", err);
      setWorktreeError(err instanceof Error ? err.message : String(err));
      setApproving(false);
    }
  };

  const handleClick = () => {
    if (isGitRef && existingWorktree) {
      void handleWorktreeApproveWithPath(existingWorktree.worktreePath);
    } else if (isGitRef) {
      setShowWorktreeDialog(true);
    } else {
      void handleDirectApprove();
    }
  };

  let buttonLabel = "Approve";
  if (approving) {
    buttonLabel = "Approving...";
  } else if (isGitRef && !existingWorktree) {
    buttonLabel = "Approve via Worktree";
  }

  return (
    <>
      <div style={{ display: "inline-flex" }}>
        <button
          type="button"
          title={
            isGitRef && !existingWorktree
              ? "Create worktree and approve this file"
              : "Approve this file"
          }
          onClick={handleClick}
          disabled={approving}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 600,
            color: colors.primaryForeground,
            background: approving
              ? colors.successMuted
              : hovered
                ? colors.successHover
                : colors.success,
            border: "none",
            borderRadius: leftRadius,
            cursor: approving ? "wait" : "pointer",
            transition: "all 0.15s",
            fontFamily: "inherit",
          }}
        >
          {isGitRef && !existingWorktree ? (
            <GitBranch size={13} strokeWidth={2} />
          ) : (
            <CheckCircle size={13} strokeWidth={2} />
          )}
          <span>{buttonLabel}</span>
        </button>
        {rightSlot}
      </div>

      {showWorktreeDialog && gitRef && (
        <WorktreeDialog
          branch={gitRef.ref}
          onConfirm={handleWorktreeApprove}
          onCancel={() => setShowWorktreeDialog(false)}
        />
      )}

      {worktreeError && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: colors.errorSoft,
            border: `1px solid ${colors.errorSoftBorder}`,
            borderRadius: 8,
            padding: "10px 16px",
            fontSize: 12,
            color: colors.errorDark,
            maxWidth: 360,
            zIndex: 10000,
            boxShadow: colors.shadowSoft,
            cursor: "pointer",
          }}
          onClick={() => setWorktreeError(null)}
        >
          {worktreeError}
        </div>
      )}
    </>
  );
}
