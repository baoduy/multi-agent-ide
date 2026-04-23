import React, { useEffect } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { colors } from "../../utils/colors";
import { useAiEditStore } from "../../store/aiEditStore";
import { useSessionStore } from "../../store/sessionStore";

/**
 * Read-only view of the resolved AI editor config for the active repo.
 *
 * Intentionally form-less — users edit `.magenta/ai/config.json` and
 * `.magenta/ai/actions/*.md` directly with any editor, same as the
 * file-editor pattern used elsewhere in the app. This view just tells
 * them what's currently in effect and where the files live.
 */
export function AiSettingsView(): React.ReactElement {
  const repoPath = useSessionStore((s) => s.selectedRepoPath);
  const config = useAiEditStore((s) => s.config);
  const actions = useAiEditStore((s) => s.actions);
  const listLoading = useAiEditStore((s) => s.listLoading);
  const lastError = useAiEditStore((s) => s.lastError);
  const loadForRepo = useAiEditStore((s) => s.loadForRepo);

  useEffect(() => {
    if (repoPath) void loadForRepo(repoPath);
  }, [repoPath, loadForRepo]);

  if (!repoPath) {
    return (
      <Section>
        <p style={{ margin: 0, fontSize: 11, color: colors.textMuted }}>
          Select a repository to view its AI editor config.
        </p>
      </Section>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Section title="Provider">
        {config ? (
          <Grid>
            <Row label="Provider" value={config.provider} from={config.sourceTrace.provider} />
            <Row label="Model" value={config.model} from={config.sourceTrace.model} />
            <Row
              label="Timeout"
              value={`${Math.round(config.timeoutMs / 1000)}s`}
              from={config.sourceTrace.timeoutMs}
            />
            {config.extraArgs.length > 0 && (
              <Row
                label="Extra CLI args"
                value={config.extraArgs.join(" ")}
                from={config.sourceTrace.extraArgs}
              />
            )}
          </Grid>
        ) : (
          <Placeholder loading={listLoading} />
        )}
      </Section>

      <Section title="Config files">
        {config && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
            <FileRow label="Repo" path={config.repoConfigPath} />
            <FileRow label="Global" path={config.globalConfigPath} />
            <p style={{ margin: "8px 0 0", fontSize: 10, color: colors.textTertiary }}>
              Edit these files in any editor. Repo config wins over global,
              global wins over built-in defaults.
            </p>
          </div>
        )}
      </Section>

      <Section title={`Actions (${actions.length})`}>
        {actions.length > 0 ? (
          <Grid>
            {actions.map((action) => (
              <Row
                key={action.id}
                label={action.label}
                value={action.id}
                from={action.source}
              />
            ))}
          </Grid>
        ) : (
          <Placeholder loading={listLoading} />
        )}
      </Section>

      <button
        type="button"
        onClick={() => void loadForRepo(repoPath)}
        disabled={listLoading}
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 10px",
          fontSize: 11,
          border: `1px solid ${colors.border}`,
          borderRadius: 4,
          background: "transparent",
          color: colors.text,
          cursor: "pointer",
        }}
      >
        <RefreshCw size={12} strokeWidth={1.8} className={listLoading ? "spin" : undefined} />
        Reload
      </button>

      {lastError && (
        <div
          style={{
            backgroundColor: colors.errorSoft,
            border: `1px solid ${colors.errorSoftBorder}`,
            borderRadius: 4,
            padding: 8,
            fontSize: 11,
            color: colors.errorDark,
          }}
        >
          {lastError}
        </div>
      )}
    </div>
  );
}

/* ─── Small primitives ──────────────────────────────────────────────── */

function Section({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      {title && (
        <h3
          style={{
            margin: "0 0 6px",
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: colors.textMuted,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Sparkles size={12} strokeWidth={1.8} />
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr auto",
        gap: "4px 12px",
        fontSize: 11,
      }}
    >
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  from,
}: {
  label: string;
  value: string;
  from?: string;
}): React.ReactElement {
  return (
    <>
      <span style={{ color: colors.textMuted }}>{label}</span>
      <span style={{ color: colors.text, fontFamily: "var(--font-mono)" }}>{value}</span>
      <span style={{ color: colors.textTertiary, fontSize: 10, textTransform: "uppercase" }}>
        {from ?? ""}
      </span>
    </>
  );
}

function FileRow({ label, path }: { label: string; path: string }): React.ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: colors.textMuted, minWidth: 50 }}>{label}</span>
      <code
        style={{
          flex: 1,
          fontSize: 10,
          padding: "2px 6px",
          background: colors.bgMuted,
          border: `1px solid ${colors.border}`,
          borderRadius: 3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={path}
      >
        {path}
      </code>
    </div>
  );
}

function Placeholder({ loading }: { loading: boolean }): React.ReactElement {
  return (
    <p style={{ margin: 0, fontSize: 11, color: colors.textMuted }}>
      {loading ? "Loading…" : "No data."}
    </p>
  );
}
