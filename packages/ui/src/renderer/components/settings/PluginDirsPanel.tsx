import React, { useEffect, useState } from "react";
import { colors } from "../../utils/colors";
import { usePluginDirStore } from "../../store/pluginDirStore";

/**
 * Phase 6 — Settings panel section for managing the user's `--plugin-dir`
 * list. Each entry is forwarded to `claude` as a separate `--plugin-dir`
 * flag (Copilot ignores them).
 */
export function PluginDirsPanel(): React.ReactElement {
  const paths = usePluginDirStore((s) => s.paths);
  const error = usePluginDirStore((s) => s.error);
  const refresh = usePluginDirStore((s) => s.refresh);
  const add = usePluginDirStore((s) => s.add);
  const remove = usePluginDirStore((s) => s.remove);

  const [draft, setDraft] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAdd = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSubmitError(null);
    try {
      await add(trimmed);
      setDraft("");
    } catch (e) {
      setSubmitError((e as Error).message);
    }
  };

  return (
    <div>
      <h3
        style={{
          margin: "0 0 6px 0",
          fontSize: 11,
          fontWeight: 600,
          color: colors.textStrong,
        }}
      >
        Plugin Directories
      </h3>
      <p
        style={{
          margin: "0 0 8px 0",
          fontSize: 11,
          color: colors.textMuted,
          lineHeight: 1.5,
        }}
      >
        Each entry is passed to <code>claude</code> as{" "}
        <code>--plugin-dir &lt;path&gt;</code>. Copilot sessions ignore this
        list.
      </p>

      {paths.length === 0 ? (
        <p style={{ margin: "0 0 8px 0", fontSize: 11, color: colors.textMuted }}>
          No plugin directories configured.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 8px 0" }}>
          {paths.map((p) => (
            <li
              key={p}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                fontSize: 11,
                padding: "4px 0",
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              <span style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                {p}
              </span>
              <button
                type="button"
                onClick={() => void remove(p)}
                aria-label={`Remove ${p}`}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  border: `1px solid ${colors.border}`,
                  borderRadius: 3,
                  background: "transparent",
                  color: colors.text,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleAdd();
        }}
        style={{ display: "flex", gap: 6 }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="/absolute/path/to/plugin"
          style={{
            flex: 1,
            fontSize: 11,
            padding: "4px 6px",
            border: `1px solid ${colors.border}`,
            borderRadius: 3,
            background: colors.bgSurface,
            color: colors.text,
          }}
        />
        <button
          type="submit"
          style={{
            fontSize: 11,
            padding: "4px 10px",
            border: `1px solid ${colors.primary}`,
            borderRadius: 3,
            background: colors.primary,
            color: "white",
            cursor: "pointer",
          }}
        >
          Add
        </button>
      </form>

      {(submitError || error) && (
        <p
          role="alert"
          style={{
            margin: "8px 0 0 0",
            fontSize: 11,
            color: colors.errorDark,
          }}
        >
          {submitError || error}
        </p>
      )}
    </div>
  );
}
