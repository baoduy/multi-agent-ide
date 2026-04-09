import React, { useCallback, useEffect, useMemo } from "react";
import ReactFlow, { Controls, Background } from "reactflow";
// @ts-ignore – esbuild loads .css as text via the "text" loader
import reactflowCSS from "reactflow/dist/style.css";

import type { SpecFolder } from "@magenta/shared/models";
import { specToFlowDiagram } from "./diagramUtils";
import { nodeTypes } from "./nodeTypes";

type FlowDiagramProps = {
  spec: SpecFolder | null;
};

/**
 * Renders an interactive React Flow diagram showing the 5-stage pipeline.
 * Displays status, progress, and allows pan/zoom/fit-to-view controls.
 */
export function FlowDiagram({ spec }: FlowDiagramProps): React.ReactElement {
  // Inject reactflow CSS once into the document head
  useEffect(() => {
    const id = "reactflow-styles";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = reactflowCSS as unknown as string;
      document.head.appendChild(style);
    }
  }, []);

  const { nodes, edges } = useMemo(() => {
    if (!spec) {
      return { nodes: [], edges: [] };
    }

    return specToFlowDiagram(spec);
  }, [spec]);

  const onNodesChange = useCallback(() => {
    // No-op: nodes are read-only in this view
  }, []);

  const onEdgesChange = useCallback(() => {
    // No-op: edges are read-only in this view
  }, []);

  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    backgroundColor: "#fafafa",
  };

  if (!spec) {
    return (
      <div style={containerStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "#9ca3af",
            fontSize: 14,
          }}
        >
          Select a spec folder to view the pipeline
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
