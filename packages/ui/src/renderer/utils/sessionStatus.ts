import type { AISessionRecord } from "@magenta/shared/aiTerminal";
import { colors } from "./colors";

export function getStatusColor(status: AISessionRecord["status"]): string {
  switch (status) {
    case "active":
      return colors.statusActive;
    case "waiting-input":
      return colors.statusWaiting;
    case "error":
      return colors.statusError;
    case "exited":
    case "idle":
    default:
      return colors.statusIdle;
  }
}

export function isActiveStatus(status: AISessionRecord["status"]): boolean {
  return status === "active" || status === "waiting-input" || status === "error";
}
