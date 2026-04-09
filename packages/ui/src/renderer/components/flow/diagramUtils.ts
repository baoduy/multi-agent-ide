import type { Node, Edge } from "reactflow";

import type { SpecFolder } from "@magenta/shared/models";
import { PIPELINE_STAGES } from "@magenta/shared/constants";
import type { PipelineStageName } from "@magenta/shared/constants";
import type { PipelineNodeData } from "./PipelineNode";

/** Stages to display in the workflow diagram (implementation hidden until AI integration). */
const VISIBLE_STAGES: PipelineStageName[] = ["constitution", "spec", "plan", "tasks"];

/**
 * Converts a SpecFolder to React Flow nodes and edges representing the pipeline.
 * Linear left-to-right layout:
 *   Constitution → Spec → Plan → Tasks
 * (Implementation is hidden until AI agent integration is ready.)
 */
export function specToFlowDiagram(
  spec: SpecFolder,
  callbacks?: {
    onOpenFile?: (filePath: string) => void;
    onApprove?: (stageName: string, filePath: string) => void;
  },
): { nodes: Node<PipelineNodeData>[]; edges: Edge[] } {
  const nodes: Node<PipelineNodeData>[] = [];
  const edges: Edge[] = [];

  // Layout: linear left-to-right flow
  // Constitution → Spec → Plan → Tasks
  const stageSpacing = 260;

  const stageMap = new Map(spec.stages.map((s) => [s.name, s]));

  VISIBLE_STAGES.forEach((stageName, index) => {
    const stage = stageMap.get(stageName);
    if (!stage) return;

    const position = { x: index * stageSpacing, y: 0 };
    const nodeId = `stage-${stageName}`;
    const nodeData: PipelineNodeData = {
      label: stageName.charAt(0).toUpperCase() + stageName.slice(1),
      stageName,
      status: stage.status,
      filePath: stage.filePath,
      metadata: stage.metadata,
      onOpenFile: callbacks?.onOpenFile,
      onApprove: callbacks?.onApprove,
    };

    nodes.push({
      id: nodeId,
      data: nodeData,
      position,
      type: "pipeline",
    });
  });

  // Edges: linear chain between visible stages
  for (let i = 0; i < VISIBLE_STAGES.length - 1; i++) {
    const src = VISIBLE_STAGES[i];
    const tgt = VISIBLE_STAGES[i + 1];
    const srcStage = stageMap.get(src);
    edges.push({
      id: `edge-${src}-to-${tgt}`,
      source: `stage-${src}`,
      target: `stage-${tgt}`,
      animated: srcStage?.status === "running",
      style: {
        stroke: srcStage?.status === "approved" ? "#16A34A" : "#86efac",
        strokeWidth: 2,
      },
    });
  }

  return { nodes, edges };
}

/**
 * Gets the color for a stage based on its status.
 */
export function getStageColor(status: string): {
  bg: string;
  border: string;
  text: string;
} {
  switch (status) {
    case "missing":
      return { bg: "#f3f4f6", border: "#d1d5db", text: "#6b7280" };
    case "draft":
      return { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" };
    case "review":
      return { bg: "#dbeafe", border: "#93c5fd", text: "#1e40af" };
    case "approved":
      return { bg: "#dcfce7", border: "#16A34A", text: "#166534" };
    case "idle":
      return { bg: "#f0fdf4", border: "#86efac", text: "#15803d" };
    case "running":
      return { bg: "#fbbf24", border: "#f59e0b", text: "#78350f" };
    default:
      return { bg: "#ffffff", border: "#e5e7eb", text: "#000000" };
  }
}

/**
 * Calculates completion percentage for tasks or implementation stages.
 */
export function calculateCompletionPercent(metadata?: {
  taskCount?: number;
  completedCount?: number;
  implementationProgress?: number;
}): number {
  if (!metadata) return 0;

  if (metadata.implementationProgress !== undefined) {
    return metadata.implementationProgress;
  }

  if (metadata.taskCount && metadata.taskCount > 0) {
    const completed = metadata.completedCount || 0;
    return Math.min(100, Math.round((completed / metadata.taskCount) * 100));
  }

  return 0;
}
