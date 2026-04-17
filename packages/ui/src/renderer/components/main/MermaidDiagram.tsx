import React, { useEffect, useRef, useState } from "react";

/**
 * Lazy-loaded mermaid diagram renderer.
 * Used as the `code` component override for ```mermaid fences inside markdown.
 */
export const MermaidDiagram = React.memo(function MermaidDiagram({
  chart,
}: {
  chart: string;
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          fontFamily: "var(--font-sans)",
          securityLevel: "strict",
        });

        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { svg } = await mermaid.render(id, chart);

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          containerRef.current.classList.add("md-mermaid-rendered");
        }
      } catch {
        if (!cancelled) setError("Mermaid diagram error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="md-mermaid">
        <div className="md-mermaid-error">{error}</div>
        <pre>{chart}</pre>
      </div>
    );
  }

  return <div ref={containerRef} className="md-mermaid" />;
});
