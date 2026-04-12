import type { AISessionRecord } from "@magenta/shared/aiTerminal";

export function getStatusColor(status: AISessionRecord["status"]): string {
  switch (status) {
    case "active":
      return "#3d7a2a";
    case "waiting-input":
      return "#b8860b";
    case "error":
      return "#c75050";
    case "exited":
    case "idle":
    default:
      return "#9a958c";
  }
}

export function isActiveStatus(status: AISessionRecord["status"]): boolean {
  return status === "active" || status === "waiting-input" || status === "error";
}
