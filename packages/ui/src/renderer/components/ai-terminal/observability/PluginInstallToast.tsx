import { useAISessionStore } from "../../../store/aiSessionStore";

/**
 * Phase 7 — toast that follows the per-session `pluginInstalls` map. Shown
 * while at least one plugin is mid-install (`started` or `installed` —
 * `completed`/`failed` are terminal). Sits in the layout root so it doesn't
 * unmount when the user switches tabs.
 */
export function PluginInstallToast({ sessionId }: { sessionId: string }) {
  const installs = useAISessionStore(
    (s) => s.observability[sessionId]?.pluginInstalls ?? {},
  );
  const inFlight = Object.values(installs).filter(
    (p) => p.status === "started" || p.status === "installed",
  );
  if (inFlight.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 rounded-md border bg-background p-3 text-sm shadow">
      {inFlight.map((p) => (
        <div key={p.plugin}>
          {p.plugin}: {p.status}
          {p.message ? ` — ${p.message}` : null}
        </div>
      ))}
    </div>
  );
}
