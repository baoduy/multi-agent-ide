import type { AIProvider } from "@magenta/shared/aiTerminal";
import type { BaseAISession } from "./BaseAISession";
import { ClaudeSession } from "./ClaudeSession";
import { CopilotSession } from "./CopilotSession";

export interface ISessionFactory {
  create(id: string): BaseAISession;
}

export class ClaudeSessionFactory implements ISessionFactory {
  create(id: string): BaseAISession {
    return new ClaudeSession(id);
  }
}

export class CopilotSessionFactory implements ISessionFactory {
  create(id: string): BaseAISession {
    return new CopilotSession(id);
  }
}

const FACTORIES: Record<AIProvider, ISessionFactory> = {
  claude: new ClaudeSessionFactory(),
  copilot: new CopilotSessionFactory(),
};

export function getSessionFactory(provider: AIProvider): ISessionFactory {
  return FACTORIES[provider];
}
