import type { IPCBridge } from "../IPCBridge";
import { safeHandle } from "../createHandler";
import type { AgentService } from "../../application/AgentService";
import type { PluginDirService } from "../../application/PluginDirService";

type AgentsHandlerContext = {
  bridge: IPCBridge;
  agentService: AgentService;
  pluginDirService: PluginDirService;
};

export function registerAgentsHandlers({
  bridge,
  agentService,
  pluginDirService,
}: AgentsHandlerContext): void {
  safeHandle(bridge, "ai:list-agents", async (req) => ({
    type: "ai:list-agents:result" as const,
    provider: req.provider,
    agents: await agentService.listAgents(req.provider),
  }));

  safeHandle(bridge, "plugin-dirs:list", async () => ({
    type: "plugin-dirs:list:result" as const,
    paths: pluginDirService.list(),
  }));

  safeHandle(bridge, "plugin-dirs:add", async (req) => ({
    type: "plugin-dirs:add:result" as const,
    paths: pluginDirService.add(req.path),
  }));

  safeHandle(bridge, "plugin-dirs:remove", async (req) => ({
    type: "plugin-dirs:remove:result" as const,
    paths: pluginDirService.remove(req.path),
  }));
}
