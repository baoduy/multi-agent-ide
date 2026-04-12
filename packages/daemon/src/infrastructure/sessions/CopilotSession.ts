import type { AISessionStatus } from "@magenta/shared/aiTerminal";
import { BaseAISession } from "./BaseAISession";
import { detectCopilotStatus } from "../../domain/statusDetection";

export class CopilotSession extends BaseAISession {
  constructor(id: string) {
    super(id, "copilot");
  }

  protected getBinaryName(): string {
    return "copilot";
  }

  protected detectStatus(
    data: string,
    currentStatus: AISessionStatus
  ): AISessionStatus | null {
    return detectCopilotStatus(data, currentStatus);
  }
}
