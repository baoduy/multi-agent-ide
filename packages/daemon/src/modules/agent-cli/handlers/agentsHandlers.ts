import type { IPCBridge } from "../../../core/ipc/IPCBridge";
import { safeHandle } from "../../../core/ipc/createHandler";
import type { AgentService } from "../app/AgentService";
import type { PluginDirService } from "../../config/app/PluginDirService";

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
