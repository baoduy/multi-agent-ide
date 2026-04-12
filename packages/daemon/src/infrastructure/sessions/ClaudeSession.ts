import type { AISessionStatus } from "@magenta/shared/aiTerminal";
import { BaseAISession } from "./BaseAISession";
import { detectClaudeStatus } from "../../domain/statusDetection";

export class ClaudeSession extends BaseAISession {
  constructor(id: string) {
    super(id, "claude");
  }

  protected getBinaryName(): string {
    return "claude";
  }

  protected detectStatus(
    data: string,
    currentStatus: AISessionStatus
  ): AISessionStatus | null {
    return detectClaudeStatus(data, currentStatus);
  }
}
