import type { IPCBridge } from "../IPCBridge";
import type { AISessionApplicationService } from "../../application/AISessionApplicationService";
import { safeHandle } from "../createHandler";

type AISessionHandlerContext = {
  bridge: IPCBridge;
  aiSessionService: AISessionApplicationService;
};

export function registerAISessionHandlers({ bridge, aiSessionService }: AISessionHandlerContext): void {
  safeHandle(bridge, "ai-session:create", async (msg) => {
    const session = await aiSessionService.createSession(
      {
        provider: msg.provider,
        repoPath: msg.repoPath,
        branch: msg.branch,
        worktreePath: msg.worktreePath,
        permissionMode: msg.permissionMode,
        providerSessionId: msg.providerSessionId,
      },
      msg.cols,
      msg.rows,
    );
    return { type: "ai-session:created", session };
  });

  safeHandle(bridge, "ai-session:resume", async (msg) => {
    const session = await aiSessionService.resumeSession(msg.sessionId, msg.cols, msg.rows);
    return { type: "ai-session:resumed", session };
  });

  safeHandle(bridge, "ai-session:input", async (msg) => {
    aiSessionService.sendInput(msg.sessionId, msg.data);
    return { type: "ai-session:input:ack" };
  });

  safeHandle(bridge, "ai-session:resize", async (msg) => {
    aiSessionService.resize(msg.sessionId, msg.cols, msg.rows);
    return { type: "ai-session:resize:ack" };
  });

  safeHandle(bridge, "ai-session:stop", async (msg) => {
    aiSessionService.stop(msg.sessionId);
    return { type: "ai-session:stop:ack" };
  });

  safeHandle(bridge, "ai-session:attach", async (msg) => {
    const result = aiSessionService.attach(msg.sessionId, msg.fromSeq);
    if (!result) {
      return {
        type: "ai-session:attach:result",
        sessionId: msg.sessionId,
        chunks: [],
        snapshot: false,
        headSeq: 0,
        alive: false,
        status: "idle" as const,
      };
    }
    return {
      type: "ai-session:attach:result",
      sessionId: msg.sessionId,
      chunks: result.chunks,
      snapshot: result.snapshot,
      headSeq: result.headSeq,
      alive: result.alive,
      status: result.status,
    };
  });

  safeHandle(bridge, "ai-session:ack", async (msg) => {
    aiSessionService.ack(msg.sessionId, msg.seq);
    return { type: "ai-session:ack:ack" };
  });

  safeHandle(bridge, "ai-session:list", async () => {
    const sessions = aiSessionService.listSessions();
    return { type: "ai-session:list:result", sessions };
  });

  safeHandle(bridge, "ai-session:delete", async (msg) => {
    aiSessionService.deleteSession(msg.sessionId);
    return { type: "ai-session:deleted", sessionId: msg.sessionId };
  });

  safeHandle(bridge, "ai-session:providers", async () => {
    return { type: "ai-session:providers:result", providers: aiSessionService.getProviders() };
  });

  safeHandle(bridge, "ai-session:running-count", async () => {
    return { type: "ai-session:running-count:result", count: aiSessionService.getRunningCount() };
  });

  safeHandle(bridge, "ai-session:set-permission-mode", async (msg) => {
    aiSessionService.setPermissionMode(msg.sessionId, msg.permissionMode);
    return { type: "ai-session:permission-mode:ack", sessionId: msg.sessionId, permissionMode: msg.permissionMode };
  });
}
