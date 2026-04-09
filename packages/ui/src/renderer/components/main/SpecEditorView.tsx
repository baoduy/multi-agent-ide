import React from "react";

import type { SpecFolder } from "@magenta/shared/models";
import { FlowDiagram } from "../flow/FlowDiagram";

type SpecEditorViewProps = {
  spec: SpecFolder | null;
  repoName: string | null;
};

export function SpecEditorView({ spec, repoName }: SpecEditorViewProps): React.ReactElement {
  if (!spec) {
    return (
      <div style={{ padding: 20, color: "#8b8b96", fontSize: 13 }}>
        Select a spec from the sidebar to view the pipeline.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Spec metadata header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e5ec" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#8b8b96",
            marginBottom: 8,
          }}
        >
          Spec editor — {repoName}
        </div>
        <div
          style={{
            border: "1px solid #e5e5ec",
            borderRadius: 8,
            padding: "14px 16px",
            background: "#f8f8fa",
            fontSize: 13,
            lineHeight: 1.6,
            color: "#1e1e2e",
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 6 }}>{spec.name}</div>
          <div style={{ color: "#8b8b96", fontSize: 12 }}>
            Stages: {spec.stages.length > 0 ? spec.stages.map((s) => s.name).join(" \u2192 ") : "No stages detected"}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button
            type="button"
            style={{
              padding: "8px 16px",
              fontSize: 13,
              border: "none",
              borderRadius: 6,
              background: "#5b57d1",
              color: "#ffffff",
              cursor: "pointer",
              fontWeight: 500,
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#4a46b8";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#5b57d1";
            }}
          >
            Approve & generate tasks
          </button>
          <button
            type="button"
            style={{
              padding: "8px 16px",
              fontSize: 13,
              border: "1px solid #d0d0d8",
              borderRadius: 6,
              background: "transparent",
              color: "#1e1e2e",
              cursor: "pointer",
              fontWeight: 400,
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#f4f4f6";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            Revise spec
          </button>
        </div>
      </div>

      {/* Flow diagram fills remaining space */}
      <div style={{ flex: 1 }}>
        <FlowDiagram spec={spec} />
      </div>
    </div>
  );
}
