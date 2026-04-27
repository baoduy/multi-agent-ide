import type { AISessionStatus } from "@magenta/shared/aiTerminal";
import { BaseAISession } from "../sessions/BaseAISession";
import { detectClaudeStatus } from "../core/statusDetection";

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
