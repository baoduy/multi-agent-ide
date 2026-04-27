import React from "react";

import { colors } from "../../utils/colors";
import { useConfigStore } from "../../store/configStore";

/**
 * Minimal reproducibility settings — per working-dir, two free-form text
 * inputs:
 *   - Prompt templates path (a directory containing `claude.md` /
 *     `copilot.md` used as fallback `--append-system-prompt-file`).
 *   - MCP config (an existing file path, OR an inline JSON string starting
 *     with `{`; the daemon decides which by attempting JSON.parse).
 *
 * Empty inputs clear the field via `updateWorkingDir(path, { ...: undefined })`.
 */
export function WorkingDirReproducibility(): React.ReactElement {
  const workingDirs = useConfigStore((s) => s.workingDirs);
  const updateWorkingDir = useConfigStore((s) => s.updateWorkingDir);

  if (workingDirs.length === 0) {
    return (
      <p style={{ fontSize: 11, color: colors.textMuted }}>
        Add a working directory in the Directories tab first.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h3
          style={{
            margin: "0 0 6px 0",
            fontSize: 11,
            fontWeight: 600,
            color: colors.textStrong,
          }}
        >
          AI Reproducibility (per working directory)
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: colors.textMuted,
            lineHeight: 1.5,
          }}
        >
          Used by bare-mode runs (spec review, task generation). Leave blank
          to skip the corresponding flag.
        </p>
      </div>

      {workingDirs.map((wd) => (
        <fieldset
          key={wd.path}
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
            padding: "8px 10px",
            margin: 0,
          }}
        >
          <legend
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: colors.text,
              padding: "0 4px",
            }}
          >
            {wd.path}
          </legend>

          <Field
            label="Prompt templates path"
            placeholder="/path/to/.magenta/prompts"
            value={wd.promptTemplatesPath ?? ""}
            onCommit={(v) =>
              void updateWorkingDir(wd.path, {
                promptTemplatesPath: v.trim() || undefined,
              })
            }
          />
          <Field
            label="MCP config (path or inline JSON)"
            placeholder='/path/to/mcp.json  or  {"servers":{}}'
            value={wd.mcpConfigJson ?? ""}
            onCommit={(v) =>
              void updateWorkingDir(wd.path, {
                mcpConfigJson: v.trim() || undefined,
              })
            }
          />
        </fieldset>
      ))}
    </div>
  );
}

function Field({
  label,
  placeholder,
  value,
  onCommit,
}: {
  label: string;
  placeholder: string;
  value: string;
  onCommit: (v: string) => void;
}): React.ReactElement {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  return (
    <label style={{ display: "block", marginTop: 8 }}>
      <span
        style={{
          display: "block",
          fontSize: 10,
          fontWeight: 500,
          color: colors.textMuted,
          marginBottom: 3,
        }}
      >
        {label}
      </span>
      <input
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
        }}
        style={{
          width: "100%",
          fontSize: 11,
          padding: "5px 7px",
          border: `1px solid ${colors.border}`,
          borderRadius: 3,
          background: colors.bgWhite,
          color: colors.text,
          fontFamily: "monospace",
        }}
      />
    </label>
  );
}
