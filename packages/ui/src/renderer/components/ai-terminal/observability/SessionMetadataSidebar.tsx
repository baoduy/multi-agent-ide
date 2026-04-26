import { useAISessionStore } from "../../../store/aiSessionStore";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/**
 * Phase 7 — Init metadata sidebar: model + active tools + MCP servers +
 * any plugin load failures Claude reported on `system/init`.
 */
export function SessionMetadataSidebar({ sessionId }: { sessionId: string }) {
  const meta = useAISessionStore((s) => s.observability[sessionId]?.initMetadata);
  if (!meta) {
    return (
      <div className="p-3 text-sm text-muted-foreground">No init event yet.</div>
    );
  }
  return (
    <div className="space-y-3 p-3 text-sm">
      <Row label="Model" value={meta.model} />
      <Row label="Tools" value={meta.tools.join(", ")} />
      <Row
        label="MCP servers"
        value={meta.mcpServers.length ? meta.mcpServers.join(", ") : "(none)"}
      />
      {meta.pluginErrors && meta.pluginErrors.length > 0 && (
        <div>
          <div className="font-medium text-destructive">Plugin errors</div>
          <ul className="ml-4 list-disc">
            {meta.pluginErrors.map((e) => (
              <li key={e.name}>
                {e.name}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
