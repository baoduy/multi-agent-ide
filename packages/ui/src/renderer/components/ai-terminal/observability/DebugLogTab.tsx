import { useEffect } from "react";
import { sendOrThrow, sendCommand } from "../../../services/ipcClient";
import { useAISessionStore } from "../../../store/aiSessionStore";

/**
 * Phase 7 — tail-follow viewer for Claude's `--debug-file` log. On mount it
 * asks the daemon to start tailing; bytes arrive via `ai-session:debug-log`
 * push events handled by the store. On unmount or session change the tail
 * is stopped via fire-and-forget command.
 */
export function DebugLogTab({ sessionId }: { sessionId: string }) {
  const chunks = useAISessionStore(
    (s) => s.observability[sessionId]?.debugLogChunks ?? [],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await sendOrThrow({ type: "ai-session:debug-log:open", sessionId });
        if (!active) {
          // Closed before the open round-trip resolved — clean up.
          await sendCommand({ type: "ai-session:debug-log:close", sessionId });
        }
      } catch {
        // Renderer simply renders an empty state; the daemon surfaces
        // IpcError on truly broken cases (e.g. no path registered yet).
      }
    })();
    return () => {
      active = false;
      void sendCommand({ type: "ai-session:debug-log:close", sessionId });
    };
  }, [sessionId]);

  return (
    <pre className="h-full overflow-auto whitespace-pre-wrap font-mono text-xs">
      {chunks.map((c) => c.bytes).join("")}
    </pre>
  );
}
