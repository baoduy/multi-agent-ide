import type { IPCBridge } from "../../../core/ipc/IPCBridge";
import type { AiEditApplicationService } from "../app/AiEditApplicationService";
import { safeHandle } from "../../../core/ipc/createHandler";

type AiEditHandlerContext = {
  bridge: IPCBridge;
  aiEditService: AiEditApplicationService;
};

/**
 * Handlers for the AI settings view and the chat bubble.
 *
 * Settings view (read-only):
 *   - `ai-edit:get-config`   — resolved config + source trace
 *   - `ai-edit:list-actions` — merged built-in / global / repo actions
 *
 * Chat bubble (three explicit modes):
 *   - `ai-chat:ask`              — free-form Q&A; returns `text`
 *   - `ai-chat:edit-selection`   — rewrite a selection; returns `newText`
 *   - `ai-chat:modify-document`  — whole-doc rewrite/append; returns `newDocumentText`
 */
export function registerAiEditHandlers({ bridge, aiEditService }: AiEditHandlerContext): void {
  safeHandle(bridge, "ai-edit:get-config", async (msg) => ({
    type: "ai-edit:get-config:result" as const,
    config: aiEditService.getConfig(msg.repoPath),
  }));

  safeHandle(bridge, "ai-edit:list-actions", async (msg) => ({
    type: "ai-edit:list-actions:result" as const,
    actions: aiEditService.listActions(msg.repoPath),
  }));

  safeHandle(bridge, "ai-chat:ask", async (msg) => {
    // Streaming fan-out: if the UI supplied a streamId, emit deltas + the
    // first session_id back as push events the renderer routes by streamId.
    const streamId = msg.streamId;
    const onChunk = streamId
      ? (delta: string, kind: "text" | "thinking") => bridge.emit({ type: "ai-chat:stream:delta", streamId, delta, kind })
      : undefined;
    const onSessionId = streamId
      ? (sessionId: string) => bridge.emit({ type: "ai-chat:stream:session", streamId, sessionId })
      : undefined;
    return {
      type: "ai-chat:ask:result" as const,
      text: await aiEditService.ask({
        repoPath: msg.repoPath,
        filePath: msg.filePath,
        userMessage: msg.userMessage,
        history: msg.history,
        documentText: msg.documentText,
        selection: msg.selection,
        onChunk,
        onSessionId,
        // `resumeSessionId` is the *real* provider session token (Claude /
        // Copilot's own UUID, captured during the first turn via onSessionId
        // and persisted as `providerSessionId` on the chat thread row). The
        // CLI's `--resume <id>` accepts only that token.
        //
        // `msg.sessionId` is a *separate* daemon-internal thread UUID used
        // for persistence; the CLI has never seen it. Passing it to `--resume`
        // makes Claude exit with "No conversation found" and Copilot exit
        // silently with code 0 (and an empty response). Keep them distinct.
        resumeSessionId: msg.resumeSessionId,
        provider: msg.provider,
        sessionId: msg.sessionId,
      }),
    };
  });

  safeHandle(bridge, "ai-chat:edit-selection", async (msg) => ({
    type: "ai-chat:edit-selection:result" as const,
    newText: await aiEditService.editSelection({
      repoPath: msg.repoPath,
      instruction: msg.instruction,
      documentText: msg.documentText,
      selection: msg.selection,
      sessionId: msg.sessionId,
    }),
  }));

  safeHandle(bridge, "ai-chat:modify-document", async (msg) => ({
    type: "ai-chat:modify-document:result" as const,
    newDocumentText: await aiEditService.modifyDocument({
      repoPath: msg.repoPath,
      instruction: msg.instruction,
      documentText: msg.documentText,
      sessionId: msg.sessionId,
    }),
  }));

  safeHandle(bridge, "ai-chat:ask-spec", async (msg) => {
    const streamId = msg.streamId;
    const onChunk = streamId
      ? (delta: string, kind: "text" | "thinking") => bridge.emit({ type: "ai-chat:stream:delta", streamId, delta, kind })
      : undefined;
    const onSessionId = streamId
      ? (sessionId: string) => bridge.emit({ type: "ai-chat:stream:session", streamId, sessionId })
      : undefined;
    return {
      type: "ai-chat:ask-spec:result" as const,
      text: await aiEditService.askSpec({
        repoPath: msg.repoPath,
        specName: msg.specName,
        specRelPath: msg.specRelPath,
        currentFileName: msg.currentFileName,
        userMessage: msg.userMessage,
        history: msg.history,
        onChunk,
        onSessionId,
        resumeSessionId: msg.resumeSessionId,
      }),
    };
  });
}
