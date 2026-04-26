import { useEffect, useState } from "react";
import { sendOrThrow } from "../../services/ipcClient";

interface VarRow {
  name: string;
  present: boolean;
}

/**
 * Phase 7 — read-only Settings panel listing the 11 documented OTel env
 * vars and showing which are currently set in the daemon's `process.env`.
 * Magenta does NOT host a collector or surface metrics in the UI; this
 * panel is purely about telling users which knobs they can flip from
 * their shell to opt into Copilot's OTel telemetry.
 */
export function OTelSettingsPanel() {
  const [vars, setVars] = useState<VarRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const r = await sendOrThrow({ type: "ai:env:otel-status" });
        if (mounted) {
          setVars(r.vars);
          setLoaded(true);
        }
      } catch {
        if (mounted) setLoaded(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">OpenTelemetry (Copilot)</h3>
      <p className="text-xs text-muted-foreground">
        Magenta forwards these environment variables from your shell into the
        Copilot child process when present. Set them in your shell profile to
        opt into Copilot OTel telemetry. Magenta does not host a collector or
        surface metrics in the UI.
      </p>
      {!loaded ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <ul className="divide-y rounded border text-xs">
          {vars.map((v) => (
            <li
              key={v.name}
              className="flex items-center justify-between p-2 font-mono"
            >
              <span>{v.name}</span>
              <span
                className={
                  v.present ? "text-emerald-600" : "text-muted-foreground"
                }
              >
                {v.present ? "set" : "not set"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
