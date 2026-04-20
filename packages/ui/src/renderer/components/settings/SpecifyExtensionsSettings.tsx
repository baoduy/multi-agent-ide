import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";

import type { SpecifyExtension } from "@magenta/shared/config";
import { colors } from "../../utils/colors";
import { useConfigStore } from "../../store/configStore";

const NAME_RE = /^[A-Za-z0-9_.\-]+$/;
const REPO_RE = /^[A-Za-z0-9_.\-]+\/[A-Za-z0-9_.\-]+$/;

/**
 * Editor for the user's list of Specify CLI extensions to auto-install after
 * onboarding a repo or refreshing the Specify template. The daemon resolves
 * each `repo`'s latest GitHub release on every run, so entries here don't
 * need a pinned version.
 */
export function SpecifyExtensionsSettings(): React.ReactElement {
  const extensions = useConfigStore((s) => s.specifyExtensions);
  const updateSpecifyExtensions = useConfigStore((s) => s.updateSpecifyExtensions);
  const isLoading = useConfigStore((s) => s.isLoading);

  const handleRemove = useCallback(
    (index: number) => {
      void updateSpecifyExtensions(extensions.filter((_, i) => i !== index));
    },
    [extensions, updateSpecifyExtensions],
  );

  const handleAdd = useCallback(
    (ext: SpecifyExtension) => {
      void updateSpecifyExtensions([...extensions, ext]);
    },
    [extensions, updateSpecifyExtensions],
  );

  return (
    <div>
      <h3 style={{ margin: "0 0 6px 0", fontSize: 11, fontWeight: 600, color: colors.textStrong }}>
        Specify Extensions
      </h3>
      <p style={{ margin: "0 0 10px 0", fontSize: 11, color: colors.textMuted, lineHeight: 1.5 }}>
        Extensions listed here are auto-installed with their latest GitHub release
        after <code style={codeStyle}>specify init</code> (onboard) and after a Specify
        template upgrade. Command:{" "}
        <code style={codeStyle}>specify extension add &lt;name&gt; --from &lt;zip&gt;</code>.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {extensions.length === 0 && (
          <div style={{ fontSize: 11, color: colors.textTertiary, fontStyle: "italic", padding: "6px 0" }}>
            No extensions configured.
          </div>
        )}
        {extensions.map((ext, i) => (
          <ExtensionRow
            key={`${ext.name}:${ext.repo}:${i}`}
            extension={ext}
            disabled={isLoading}
            onRemove={() => handleRemove(i)}
          />
        ))}
      </div>

      <AddExtensionRow
        disabled={isLoading}
        existingNames={useMemo(() => extensions.map((e) => e.name), [extensions])}
        onAdd={handleAdd}
      />
    </div>
  );
}

function ExtensionRow({
  extension,
  disabled,
  onRemove,
}: {
  extension: SpecifyExtension;
  disabled: boolean;
  onRemove: () => void;
}): React.ReactElement {
  const repoUrl = `https://github.com/${extension.repo}`;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 8px",
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        background: colors.bgSurface,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: colors.text }}>
          {extension.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
          <span style={{ fontSize: 10, color: colors.textMuted, fontFamily: "var(--font-mono)" }}>
            {extension.repo}
          </span>
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: colors.textTertiary, display: "inline-flex" }}
            title={repoUrl}
          >
            <ExternalLink size={10} strokeWidth={2} />
          </a>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        title="Remove extension"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "4px",
          border: `1px solid ${colors.border}`,
          borderRadius: 4,
          background: colors.bgSurface,
          cursor: disabled ? "not-allowed" : "pointer",
          color: colors.textMuted,
          flexShrink: 0,
        }}
      >
        <Trash2 size={12} strokeWidth={2} />
      </button>
    </div>
  );
}

function AddExtensionRow({
  disabled,
  existingNames,
  onAdd,
}: {
  disabled: boolean;
  existingNames: readonly string[];
  onAdd: (ext: SpecifyExtension) => void;
}): React.ReactElement {
  const [name, setName] = useState("");
  const [repo, setRepo] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Clear error the moment the user edits either field again.
  useEffect(() => {
    if (error) setError(null);
  }, [name, repo]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = name.trim().length > 0 && repo.trim().length > 0;

  const handleAdd = useCallback(() => {
    const trimmedName = name.trim();
    const trimmedRepo = repo.trim();
    if (!NAME_RE.test(trimmedName)) {
      setError("Name must use letters, digits, '_', '.', or '-'.");
      return;
    }
    if (!REPO_RE.test(trimmedRepo)) {
      setError("Repo must be in <owner>/<name> form.");
      return;
    }
    if (existingNames.includes(trimmedName)) {
      setError(`An extension named "${trimmedName}" is already configured.`);
      return;
    }
    onAdd({ name: trimmedName, repo: trimmedRepo });
    setName("");
    setRepo("");
  }, [name, repo, existingNames, onAdd]);

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="name (e.g. worktrees)"
          spellCheck={false}
          disabled={disabled}
          style={{ ...inputStyle, flex: "0 0 32%" }}
        />
        <input
          type="text"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="owner/repo (e.g. dango85/spec-kit-worktree-parallel)"
          spellCheck={false}
          disabled={disabled}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={disabled || !canSubmit}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 500,
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
            background: colors.bgSurface,
            color: canSubmit ? colors.text : colors.textTertiary,
            cursor: disabled || !canSubmit ? "not-allowed" : "pointer",
            flexShrink: 0,
          }}
        >
          <Plus size={12} strokeWidth={2} />
          Add
        </button>
      </div>
      <div style={{ minHeight: 16, marginTop: 4 }}>
        {error && (
          <span style={{ fontSize: 10, color: colors.errorDark, fontWeight: 500 }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

const codeStyle: React.CSSProperties = {
  fontSize: 10,
  background: colors.bgMuted,
  padding: "1px 3px",
  borderRadius: 3,
};

const inputStyle: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  border: `1px solid ${colors.border}`,
  borderRadius: 4,
  background: colors.bgSurface,
  color: colors.text,
  outline: "none",
};
