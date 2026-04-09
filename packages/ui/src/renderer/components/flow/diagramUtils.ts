import type { Node, Edge } from "reactflow";

import type { PipelineStage, SpecFolder } from "@magenta/shared/models";
import { PIPELINE_STAGES } from "@magenta/shared/constants";

interface PipelineNodeData {
  label: string;
  stageName: string;
  status: string;
  metadata?: {
    taskCount?: number;
    completedCount?: number;
    worktreeCount?: number;
    implementationProgress?: number;
  };
}

/**
 * Converts a SpecFolder to React Flow nodes and edges representing the pipeline.
 * Layout: 5 stages in a horizontal flow
 * - Constitution (left)
 * - Spec, Plan, Tasks (middle row)
 * - Implementation (right)
 */
export function specToFlowDiagram(
  spec: SpecFolder
): { nodes: Node<PipelineNodeData>[]; edges: Edge[] } {
  const nodes: Node<PipelineNodeData>[] = [];
  const edges: Edge[] = [];

  // Define layout positions for the 5 stages
  const positions: Record<string, { x: number; y: number }> = {
    constitution: { x: 0, y: 100 },
    spec: { x: 200, y: 0 },
    plan: { x: 200, y: 100 },
    tasks: { x: 200, y: 200 },
    implementation: { x: 400, y: 100 },
  };

  // Create a map of stage names to stage data for quick lookup
  const stageMap = new Map(spec.stages.map((s) => [s.name, s]));

  // Create nodes for each pipeline stage
  for (let i = 0; i < PIPELINE_STAGES.length; i++) {
    const stageName = PIPELINE_STAGES[i];
    const stage = stageMap.get(stageName);

    if (!stage) {
      console.warn(`Stage ${stageName} not found in spec.stages`);
      continue;
    }

    const position = positions[stageName];
    if (!position) {
      console.warn(`No position defined for stage ${stageName}`);
      continue;
    }

    const nodeId = `stage-${stageName}`;
    const nodeData: PipelineNodeData = {
      label: stageName.charAt(0).toUpperCase() + stageName.slice(1),
      stageName,
      status: stage.status,
      metadata: stage.metadata,
    };

    nodes.push({
      id: nodeId,
      data: nodeData,
      position,
      type: "pipeline",
    });

    // Create edge to next stage (except for implementation)
    if (i < PIPELINE_STAGES.length - 1) {
      const nextStageName = PIPELINE_STAGES[i + 1];
      const nextNodeId = `stage-${nextStageName}`;

      edges.push({
        id: `edge-${stageName}-to-${nextStageName}`,
        source: nodeId,
        target: nextNodeId,
        animated: stage.status === "running",
      });
    }
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
      return { bg: "#dcfce7", border: "#86efac", text: "#166534" };
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
  if (!metadata) {
    return 0;
  }

  // For implementation stage
  if (metadata.implementationProgress !== undefined) {
    return metadata.implementationProgress;
  }

  // For tasks stage
  if (metadata.taskCount && metadata.taskCount > 0) {
    const completed = metadata.completedCount || 0;
    return Math.round((completed / metadata.taskCount) * 100);
  }

  return 0;
}
