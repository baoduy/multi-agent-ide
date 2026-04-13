import type { Node, Edge } from "reactflow";
import { MarkerType } from "reactflow";

import type { SpecFolder } from "@magenta/shared/models";
import { PIPELINE_STAGES } from "@magenta/shared/constants";
import type { PipelineStageName } from "@magenta/shared/constants";
import type { PipelineNodeData } from "./PipelineNode";
import { colors } from "../../utils/colors";

/** All five pipeline stages are visible in the workflow diagram. */
const VISIBLE_STAGES: PipelineStageName[] = [
  "constitution",
  "spec",
  "plan",
  "tasks",
  "implementation",
];

/** Stages placed on the bottom row (everything except constitution). */
const BOTTOM_ROW_STAGES: PipelineStageName[] = ["spec", "plan", "tasks", "implementation"];

/**
 * Converts a SpecFolder to React Flow nodes and edges representing the pipeline.
 *
 * Hierarchical layout:
 *
 *              Constitution
 *                  │
 *         Spec → Plan → Tasks → Implementation
 *
 * Constitution sits centred on the top row and connects down
 * to Spec only.  The bottom row chains left-to-right through
 * to Implementation.
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

  const stageMap = new Map(spec.stages.map((s) => [s.name, s]));

  // ── Layout constants ────────────────────────────────────
  const nodeWidth = 200; // matches PipelineNode width
  const colSpacing = 260; // horizontal gap between bottom-row nodes
  const rowGap = 180; // vertical gap between top and bottom row

  // Bottom row positions (y = rowGap, x increments by colSpacing)
  const bottomRowPositions = new Map<PipelineStageName, { x: number; y: number }>();
  BOTTOM_ROW_STAGES.forEach((name, i) => {
    bottomRowPositions.set(name, { x: i * colSpacing, y: rowGap });
  });

  // Constitution centred directly above Spec (single vertical connection)
  const specX = bottomRowPositions.get("spec")!.x;
  const constitutionX = specX;

  // ── Create nodes ────────────────────────────────────────
  const buildNodeData = (stageName: PipelineStageName): PipelineNodeData | null => {
    const stage = stageMap.get(stageName);
    if (!stage) return null;
    return {
      label: stageName.charAt(0).toUpperCase() + stageName.slice(1),
      stageName,
      status: stage.status,
      filePath: stage.filePath,
      metadata: stage.metadata,
      onOpenFile: callbacks?.onOpenFile,
      onApprove: callbacks?.onApprove,
    };
  };

  // Constitution (top row)
  const constData = buildNodeData("constitution");
  if (constData) {
    nodes.push({
      id: "stage-constitution",
      data: constData,
      position: { x: constitutionX, y: 0 },
      type: "pipeline",
    });
  }

  // Bottom row stages
  for (const stageName of BOTTOM_ROW_STAGES) {
    const nodeData = buildNodeData(stageName);
    if (!nodeData) continue;
    nodes.push({
      id: `stage-${stageName}`,
      data: nodeData,
      position: bottomRowPositions.get(stageName)!,
      type: "pipeline",
    });
  }

  // ── Helpers ─────────────────────────────────────────────
  const edgeColor = (name: PipelineStageName): string => {
    const s = stageMap.get(name);
    if (!s) return colors.successMuted;
    if (s.status === "approved" || s.status === "done") return colors.success;
    if (s.status === "in-progress") return colors.info;
    return colors.successMuted;
  };
  const isAnimated = (name: PipelineStageName): boolean => {
    const s = stageMap.get(name);
    return s?.status === "running" || s?.status === "in-progress";
  };

  // ── Edge: Constitution → Spec  (single vertical connection) ─────────
  if (stageMap.has("spec")) {
    edges.push({
      id: "edge-constitution-to-spec",
      source: "stage-constitution",
      target: "stage-spec",
      sourceHandle: "bottom",
      targetHandle: "top",
      type: "smoothstep",
      animated: isAnimated("constitution"),
      markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor("constitution") },
      style: { stroke: edgeColor("constitution"), strokeWidth: 2 },
    });
  }

  // ── Edges: horizontal chain  Spec → Plan → Tasks → Implementation ──
  for (let i = 0; i < BOTTOM_ROW_STAGES.length - 1; i++) {
    const src = BOTTOM_ROW_STAGES[i];
    const tgt = BOTTOM_ROW_STAGES[i + 1];
    if (!stageMap.has(src) || !stageMap.has(tgt)) continue;
    edges.push({
      id: `edge-${src}-to-${tgt}`,
      source: `stage-${src}`,
      target: `stage-${tgt}`,
      sourceHandle: "right",
      targetHandle: "left",
      type: "smoothstep",
      animated: isAnimated(src),
      markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor(src) },
      style: { stroke: edgeColor(src), strokeWidth: 2 },
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
  // Unified colour palette:
  //   Pending / missing / idle → Blue
  //   Review / draft / running / in-progress → Yellow / Amber
  //   Approved / done → Green
  switch (status) {
    case "missing":
    case "pending":
    case "idle":
      return { bg: colors.infoSoft, border: colors.info, text: colors.infoText };
    case "draft":
    case "review":
    case "running":
    case "in-progress":
      return { bg: colors.warningSoft, border: colors.warningBorder, text: colors.warningTextStrong };
    case "approved":
    case "done":
      return { bg: colors.successSoft, border: colors.success, text: colors.successText };
    default:
      return { bg: colors.bgWhite, border: colors.border, text: colors.textStrong };
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
