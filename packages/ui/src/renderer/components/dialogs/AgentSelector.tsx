import React, { useEffect } from "react";
import type { AIProvider } from "@magenta/shared/aiTerminal";
import { useAgentStore } from "../../store/agentStore";
import { colors } from "../../utils/colors";

interface Props {
  provider: AIProvider;
  value: string | undefined;
  onChange: (name: string | undefined) => void;
}

/**
 * Phase 6 — agent picker for session creation.
 *
 *   - Claude: dropdown listing agents resolved via `claude agents` (built-in
 *     + project + user). Maps to `--agent <v>` at spawn.
 *   - Copilot: button row of the five built-in agents. Selecting one is a
 *     UI hint only (the prompt-injection happens at the message layer when
 *     the user submits a turn — see `applyAgentToPrompt`).
 */
export function AgentSelector({ provider, value, onChange }: Props): React.ReactElement {
  const list = useAgentStore((s) => s.byProvider[provider]) ?? [];
  const loadFor = useAgentStore((s) => s.loadFor);

  useEffect(() => {
    void loadFor(provider);
  }, [provider, loadFor]);

  if (provider === "copilot") {
    return (
      <div
        role="group"
        aria-label="Copilot built-in agents"
        style={{ display: "flex", flexWrap: "wrap", gap: 4 }}
      >
        {list.map((a) => {
          const active = value === a.name;
          return (
            <button
              key={a.name}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? undefined : a.name)}
              title={a.description}
              style={{
                fontSize: 11,
                padding: "3px 8px",
                border: `1px solid ${active ? colors.primary : colors.border}`,
                borderRadius: 3,
                background: active ? colors.primaryAlpha : "transparent",
                color: active ? colors.primary : colors.text,
                cursor: "pointer",
              }}
            >
              {a.name}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color: colors.text,
      }}
    >
      <span>Agent:</span>
      <select
        aria-label="Claude agent"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        style={{
          fontSize: 11,
          padding: "3px 6px",
          border: `1px solid ${colors.border}`,
          borderRadius: 3,
          background: colors.bgSurface,
          color: colors.text,
        }}
      >
        <option value="">(default)</option>
        {list.map((a) => (
          <option key={a.name} value={a.name}>
            {a.name} — {a.source}
          </option>
        ))}
      </select>
    </label>
  );
}
