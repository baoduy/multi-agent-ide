import React, { useCallback, useEffect, useState } from "react";
import { Archive, Plus, Loader2, Trash2, Eye } from "lucide-react";

import type { StashEntry } from "@magenta/shared/ipc";
import { colors } from "../../utils/colors";
import { sendOrThrow } from "../../services/ipcClient";
import { BaseDialog } from "../common/BaseDialog";
import { CancelButton } from "../common/DialogButtons";
import { FormLabel, FormInput, FormError, SectionHeader } from "../common/FormControls";
import { InlineLoadingRow } from "../common/InlineLoadingRow";
import { ScrollableText } from "../common/ScrollableText";

type StashDialogProps = {
  repoPath: string;
  onClose: () => void;
};

const spin: React.CSSProperties = { animation: "spin 1s linear infinite" };

export function StashDialog({ repoPath, onClose }: StashDialogProps): React.ReactElement {
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewDiff, setPreviewDiff] = useState<string>("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await sendOrThrow({ type: "stash:list", repoPath });
      setStashes(res.stashes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [repoPath]);

  useEffect(() => { void load(); }, [load]);

  const runAction = useCallback(
    async (action: "push" | "pop" | "apply" | "drop", index?: number) => {
      const key = `${action}:${index ?? "new"}`;
      setBusy(key);
      setError(null);
      try {
        if (action === "push") {
          await sendOrThrow({ type: "stash:push", repoPath, message: message.trim() || undefined, includeUntracked });
          setMessage("");
        } else if (action === "pop") {
          await sendOrThrow({ type: "stash:pop", repoPath, index: index! });
        } else if (action === "apply") {
          await sendOrThrow({ type: "stash:apply", repoPath, index: index! });
        } else if (action === "drop") {
          await sendOrThrow({ type: "stash:drop", repoPath, index: index! });
          if (previewIndex === index) { setPreviewIndex(null); setPreviewDiff(""); }
        }
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [repoPath, message, includeUntracked, load, previewIndex],
  );

  const showPreview = useCallback(async (index: number) => {
    if (previewIndex === index) {
      setPreviewIndex(null);
      setPreviewDiff("");
      return;
    }
    setError(null);
    try {
      const res = await sendOrThrow({ type: "stash:show", repoPath, index });
      setPreviewIndex(index);
      setPreviewDiff(res.diff);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [repoPath, previewIndex]);

  return (
    <BaseDialog
      title="Stash"
      icon={<Archive size={16} color={colors.primary} strokeWidth={2} />}
      width={560}
      scrollable
      maxHeight="82vh"
      onClose={onClose}
      footer={<CancelButton onClick={onClose}>Close</CancelButton>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <SectionHeader>Existing stashes ({stashes.length})</SectionHeader>
          {isLoading ? (
            <InlineLoadingRow label="Loading stashes…" />
          ) : stashes.length === 0 ? (
            <div style={{ fontSize: 11, color: colors.textTertiary, padding: "4px 0" }}>No stashes.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {stashes.map((s) => (
                <div
                  key={s.index}
                  style={{
                    border: `1px solid ${colors.border}`,
                    borderRadius: 6,
                    padding: 8,
                    background: colors.bgSurface,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: colors.textTertiary }}>
                      [{s.index}]
                    </span>
                    <ScrollableText style={{ fontSize: 11, fontWeight: 500, color: colors.text, flex: 1 }}>
                      {s.message}
                    </ScrollableText>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <MiniButton onClick={() => void runAction("apply", s.index)} busy={busy === `apply:${s.index}`}>Apply</MiniButton>
                    <MiniButton onClick={() => void runAction("pop", s.index)} busy={busy === `pop:${s.index}`}>Pop</MiniButton>
                    <MiniButton onClick={() => void runAction("drop", s.index)} busy={busy === `drop:${s.index}`} danger>
                      <Trash2 size={10} strokeWidth={2} /> Drop
                    </MiniButton>
                    <MiniButton onClick={() => void showPreview(s.index)}>
                      <Eye size={10} strokeWidth={2} /> {previewIndex === s.index ? "Hide" : "Show"}
                    </MiniButton>
                  </div>
                  {previewIndex === s.index && previewDiff && (
                    <pre
                      style={{
                        marginTop: 6, padding: 8, fontSize: 11,
                        fontFamily: "var(--font-mono)", background: colors.bgMuted,
                        borderRadius: 4, maxHeight: 220, overflow: "auto", whiteSpace: "pre",
                        color: colors.textSecondary,
                      }}
                    >
                      {previewDiff}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 12 }}>
          <SectionHeader>New stash</SectionHeader>
          <FormLabel htmlFor="stash-msg">Message (optional)</FormLabel>
          <FormInput
            id="stash-msg"
            value={message}
            onChange={setMessage}
            placeholder="WIP on feature X"
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: colors.textSecondary, marginTop: 10 }}>
            <input
              type="checkbox"
              checked={includeUntracked}
              onChange={(e) => setIncludeUntracked(e.target.checked)}
              style={{ accentColor: colors.primary }}
            />
            Include untracked files
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button
              type="button"
              onClick={() => void runAction("push")}
              disabled={busy !== null}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 10px", fontSize: 11, fontWeight: 600,
                color: colors.textWhite,
                background: busy ? colors.textTertiary : colors.primary,
                border: "none", borderRadius: 6,
                cursor: busy ? "default" : "pointer", fontFamily: "inherit",
              }}
            >
              {busy === "push:new" ? <Loader2 size={12} style={spin} /> : <Plus size={12} strokeWidth={2.2} />}
              Create stash
            </button>
          </div>
        </div>

        <FormError message={error} />
      </div>
    </BaseDialog>
  );
}

function MiniButton({
  onClick,
  children,
  busy,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  busy?: boolean;
  danger?: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "3px 8px", fontSize: 11, fontWeight: 500,
        color: danger ? colors.errorDark : colors.textSecondary,
        background: danger ? colors.errorSoft : "transparent",
        border: `1px solid ${danger ? colors.errorSoftBorder : colors.border}`,
        borderRadius: 4, cursor: busy ? "default" : "pointer", fontFamily: "inherit",
      }}
    >
      {busy ? <Loader2 size={10} style={spin} /> : null}
      {children}
    </button>
  );
}
