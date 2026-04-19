import React, { useCallback, useEffect, useState } from "react";
import { Globe, Plus, Trash2, Pencil, Loader2 } from "lucide-react";

import type { Remote } from "@magenta/shared/ipc";
import { colors } from "../../utils/colors";
import { sendOrThrow } from "../../services/ipcClient";
import { BaseDialog } from "../common/BaseDialog";
import { CancelButton } from "../common/DialogButtons";
import { FormLabel, FormInput, FormError, SectionHeader } from "../common/FormControls";
import { InlineLoadingRow } from "../common/InlineLoadingRow";

type RemoteDialogProps = {
  repoPath: string;
  onClose: () => void;
};

const spin: React.CSSProperties = { animation: "spin 1s linear infinite" };

/** Redact `user:token@` from git URLs so tokens aren't displayed. */
function redactToken(url: string): string {
  return url.replace(/:\/\/([^@/]+:[^@/]+)@/, "://***@");
}

export function RemoteDialog({ repoPath, onClose }: RemoteDialogProps): React.ReactElement {
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [editing, setEditing] = useState<Remote | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await sendOrThrow({ type: "remote:list", repoPath });
      setRemotes(res.remotes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [repoPath]);

  useEffect(() => { void load(); }, [load]);

  const runOp = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [load]);

  return (
    <BaseDialog
      title="Remotes"
      icon={<Globe size={16} color={colors.primary} strokeWidth={2} />}
      width={620}
      scrollable
      maxHeight="82vh"
      onClose={onClose}
      footer={<CancelButton onClick={onClose}>Close</CancelButton>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <SectionHeader>Configured remotes</SectionHeader>
          {isLoading ? (
            <InlineLoadingRow label="Loading remotes…" />
          ) : remotes.length === 0 ? (
            <div style={{ fontSize: 11, color: colors.textTertiary, padding: "4px 0" }}>No remotes.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {remotes.map((r) => {
                const isEditing = editing?.name === r.name;
                return (
                  <div
                    key={r.name}
                    style={{
                      display: "flex", flexDirection: "column", gap: 4,
                      border: `1px solid ${colors.border}`, borderRadius: 6, padding: 8,
                      background: colors.bgSurface,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: colors.text, fontFamily: "var(--font-mono)" }}>
                        {r.name}
                      </span>
                      <span style={{ flex: 1, fontSize: 11, color: colors.textTertiary, fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {redactToken(r.fetchUrl)}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <MiniButton
                        onClick={() => {
                          setEditing(r);
                          setEditUrl(r.fetchUrl);
                          setEditName(r.name);
                        }}
                      >
                        <Pencil size={10} strokeWidth={2} /> Edit
                      </MiniButton>
                      <MiniButton
                        onClick={() => void runOp(`remove:${r.name}`, () =>
                          sendOrThrow({ type: "remote:remove", repoPath, name: r.name }),
                        )}
                        busy={busy === `remove:${r.name}`}
                        danger
                      >
                        <Trash2 size={10} strokeWidth={2} /> Remove
                      </MiniButton>
                    </div>
                    {isEditing && (
                      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                        <FormInput value={editName} onChange={setEditName} placeholder="Name" />
                        <FormInput value={editUrl} onChange={setEditUrl} placeholder="URL" />
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <MiniButton onClick={() => setEditing(null)}>Cancel</MiniButton>
                          <MiniButton
                            onClick={() => void runOp(`save:${r.name}`, async () => {
                              if (editName !== r.name) {
                                await sendOrThrow({ type: "remote:rename", repoPath, oldName: r.name, newName: editName });
                              }
                              if (editUrl !== r.fetchUrl) {
                                await sendOrThrow({ type: "remote:set-url", repoPath, name: editName || r.name, url: editUrl });
                              }
                              setEditing(null);
                            })}
                            busy={busy === `save:${r.name}`}
                          >
                            Save
                          </MiniButton>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 12 }}>
          <SectionHeader>Add remote</SectionHeader>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
            <div>
              <FormLabel htmlFor="remote-name">Name</FormLabel>
              <FormInput id="remote-name" value={newName} onChange={setNewName} placeholder="origin" />
            </div>
            <div>
              <FormLabel htmlFor="remote-url">URL</FormLabel>
              <FormInput id="remote-url" value={newUrl} onChange={setNewUrl} placeholder="git@github.com:user/repo.git" />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button
              type="button"
              onClick={() => void runOp("add", async () => {
                await sendOrThrow({ type: "remote:add", repoPath, name: newName.trim(), url: newUrl.trim() });
                setNewName(""); setNewUrl("");
              })}
              disabled={!newName.trim() || !newUrl.trim() || busy !== null}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 10px", fontSize: 11, fontWeight: 600,
                color: colors.textWhite,
                background: (!newName.trim() || !newUrl.trim() || busy) ? colors.textTertiary : colors.primary,
                border: "none", borderRadius: 6,
                cursor: (!newName.trim() || !newUrl.trim() || busy) ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {busy === "add" ? <Loader2 size={12} style={spin} /> : <Plus size={12} strokeWidth={2.2} />}
              Add remote
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
