import type { Agent } from "@magenta/shared/ipc";
import type { AIProvider } from "@magenta/shared/aiTerminal";
import type { ClaudeAgentsGateway } from "../infrastructure/ClaudeAgentsGateway";
import { COPILOT_BUILTIN_AGENTS } from "../domain/copilotBuiltinAgents";

/**
 * Phase 6 — orchestrates `ai:list-agents` for both providers. Copilot returns
 * the static built-in list; Claude delegates to the `claude agents` gateway.
 */
export class AgentService {
  constructor(private readonly claudeAgentsGateway: ClaudeAgentsGateway) {}

  async listAgents(provider: AIProvider): Promise<Agent[]> {
    if (provider === "copilot") return [...COPILOT_BUILTIN_AGENTS];
    return this.claudeAgentsGateway.list();
  }
}
