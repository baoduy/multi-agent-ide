import React, { useCallback, useEffect, useMemo } from "react";
import ReactFlow, { Controls, Background } from "reactflow";
// @ts-ignore – esbuild loads .css as text via the "text" loader
import reactflowCSS from "reactflow/dist/style.css";

import type { SpecFolder } from "@magenta/shared/models";
import { specToFlowDiagram } from "./diagramUtils";
import { nodeTypes } from "./nodeTypes";

type FlowDiagramProps = {
  spec: SpecFolder | null;
  onOpenFile?: (filePath: string) => void;
  onApprove?: (stageName: string, filePath: string) => void;
};

/**
 * Renders an interactive React Flow diagram showing the 5-stage pipeline.
 * Nodes are clickable to open files, and approvable stages show an approve button on hover.
 */
export function FlowDiagram({ spec, onOpenFile, onApprove }: FlowDiagramProps): React.ReactElement {
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
    if (!spec) return { nodes: [], edges: [] };
    return specToFlowDiagram(spec, { onOpenFile, onApprove });
  }, [spec, onOpenFile, onApprove]);

  const onNodesChange = useCallback(() => {}, []);
  const onEdgesChange = useCallback(() => {}, []);

  if (!spec) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#9a958c",
          fontSize: 13,
          backgroundColor: "#1a1a2e",
        }}
      >
        Select a spec to view the workflow
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: "#1a1a2e" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background color="#2a2a3e" gap={20} />
        <Controls
          style={{
            bottom: 12,
            left: 12,
          }}
        />
      </ReactFlow>
    </div>
  );
}
