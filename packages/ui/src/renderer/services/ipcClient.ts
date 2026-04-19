import type { IpcRequest, IpcResponse } from "@magenta/shared/ipc";
import { ipc } from "../utils/ipc";

/**
 * Error thrown when an IPC request returns an error response.
 */
export class IpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IpcError";
  }
}

/**
 * Type helper to extract the response type for a given request type.
 * Maps request types to their expected success response types.
 */
type ResponseForRequest = {
  "repo:list": Extract<IpcResponse, { type: "repo:list:result" }>;
  "repo:scan": Extract<IpcResponse, { type: "repo:scan:started" }>;
  "spec:list": Extract<IpcResponse, { type: "spec:list:result" }>;
  "file:read": Extract<IpcResponse, { type: "file:read:result" }>;
  "file:write": Extract<IpcResponse, { type: "file:write:result" }>;
  "file:write-binary": Extract<IpcResponse, { type: "file:write-binary:result" }>;
  "file:delete": Extract<IpcResponse, { type: "file:delete:result" }>;
  "file:rename": Extract<IpcResponse, { type: "file:rename:result" }>;
  "dir:list": Extract<IpcResponse, { type: "dir:list:result" }>;
"config:get": Extract<IpcResponse, { type: "config:response" }>;
  "config:add-working-dir": Extract<IpcResponse, { type: "config:response" }>;
  "config:remove-working-dir": Extract<IpcResponse, { type: "config:response" }>;
  "config:update": Extract<IpcResponse, { type: "config:response" }>;
  "branch:list": Extract<IpcResponse, { type: "branch:list:result" }>;
  "branch:checkout": Extract<IpcResponse, { type: "branch:checkout:result" }>;
  "gitfile:read": Extract<IpcResponse, { type: "gitfile:read:result" }>;
  "worktree:create": Extract<IpcResponse, { type: "worktree:create:result" }>;
  "worktree:list": Extract<IpcResponse, { type: "worktree:list:result" }>;
  "worktree:trigger-sync": Extract<IpcResponse, { type: "worktree:trigger-sync:ack" }>;
  "worktree:status": Extract<IpcResponse, { type: "worktree:status:result" }>;
  "worktree:merge": Extract<IpcResponse, { type: "worktree:merge:result" }>;
  "worktree:branches": Extract<IpcResponse, { type: "worktree:branches:result" }>;
  "worktree:delete": Extract<IpcResponse, { type: "worktree:delete:result" }>;
  "repo:onboard": Extract<IpcResponse, { type: "repo:onboard:started" }>;
  "repo:onboard:cancel": Extract<IpcResponse, { type: "repo:onboard:cancelled" }>;
  "repo:specify-status": Extract<IpcResponse, { type: "repo:specify-status:result" }>;
  "repo:specify-switch": Extract<IpcResponse, { type: "repo:specify-switch:started" }>;
  "repo:force-reload": Extract<IpcResponse, { type: "repo:force-reload:started" }>;
  "git:user": Extract<IpcResponse, { type: "git:user:result" }>;
  "terminal:spawn": Extract<IpcResponse, { type: "terminal:spawned" }>;
  "terminal:input": Extract<IpcResponse, { type: "terminal:input:ack" }>;
  "terminal:resize": Extract<IpcResponse, { type: "terminal:resize:ack" }>;
  "terminal:close": Extract<IpcResponse, { type: "terminal:close:ack" }>;
  "terminal:attach": Extract<IpcResponse, { type: "terminal:attach:result" }>;
  "terminal:ack": Extract<IpcResponse, { type: "terminal:ack:ack" }>;
  "ai-session:create": Extract<IpcResponse, { type: "ai-session:created" }>;
  "ai-session:resume": Extract<IpcResponse, { type: "ai-session:resumed" }>;
  "ai-session:input": Extract<IpcResponse, { type: "ai-session:input:ack" }>;
  "ai-session:resize": Extract<IpcResponse, { type: "ai-session:resize:ack" }>;
  "ai-session:stop": Extract<IpcResponse, { type: "ai-session:stop:ack" }>;
  "ai-session:attach": Extract<IpcResponse, { type: "ai-session:attach:result" }>;
  "ai-session:ack": Extract<IpcResponse, { type: "ai-session:ack:ack" }>;
  "ai-session:list": Extract<IpcResponse, { type: "ai-session:list:result" }>;
  "ai-session:delete": Extract<IpcResponse, { type: "ai-session:deleted" }>;
  "ai-session:providers": Extract<IpcResponse, { type: "ai-session:providers:result" }>;
  "ai-session:set-permission-mode": Extract<IpcResponse, { type: "ai-session:permission-mode:ack" }>;
  "ai-session:running-count": Extract<IpcResponse, { type: "ai-session:running-count:result" }>;
  "ai-session:check-worktree": Extract<IpcResponse, { type: "ai-session:check-worktree:result" }>;
  "synced-session:list": Extract<IpcResponse, { type: "synced-session:list:result" }>;
  "synced-session:trigger-sync": Extract<IpcResponse, { type: "synced-session:sync:triggered" }>;
  "synced-session:archive": Extract<IpcResponse, { type: "synced-session:archived" }>;
  "ui:ai-tab-active": Extract<IpcResponse, { type: "ui:ai-tab-active:ack" }>;
  // Git operations
  "branch:create": Extract<IpcResponse, { type: "branch:create:result" }>;
  "git:fetch": Extract<IpcResponse, { type: "git:fetch:result" }>;
  "git:pull": Extract<IpcResponse, { type: "git:pull:result" }>;
  "git:push": Extract<IpcResponse, { type: "git:push:result" }>;
  "git:status": Extract<IpcResponse, { type: "git:status:result" }>;
  "git:commit": Extract<IpcResponse, { type: "git:commit:result" }>;
  "git:ls-files": Extract<IpcResponse, { type: "git:ls-files:result" }>;
  "git:clone": Extract<IpcResponse, { type: "git:clone:started" }>;
  "git:log": Extract<IpcResponse, { type: "git:log:result" }>;
  "git:commit-detail": Extract<IpcResponse, { type: "git:commit-detail:result" }>;
  "git:diff": Extract<IpcResponse, { type: "git:diff:result" }>;
  "stash:list": Extract<IpcResponse, { type: "stash:list:result" }>;
  "stash:push": Extract<IpcResponse, { type: "stash:push:result" }>;
  "stash:pop": Extract<IpcResponse, { type: "stash:pop:result" }>;
  "stash:apply": Extract<IpcResponse, { type: "stash:apply:result" }>;
  "stash:drop": Extract<IpcResponse, { type: "stash:drop:result" }>;
  "stash:show": Extract<IpcResponse, { type: "stash:show:result" }>;
  "remote:list": Extract<IpcResponse, { type: "remote:list:result" }>;
  "remote:add": Extract<IpcResponse, { type: "remote:add:result" }>;
  "remote:rename": Extract<IpcResponse, { type: "remote:rename:result" }>;
  "remote:remove": Extract<IpcResponse, { type: "remote:remove:result" }>;
  "remote:set-url": Extract<IpcResponse, { type: "remote:set-url:result" }>;
  "branch:delete": Extract<IpcResponse, { type: "branch:delete:result" }>;
  "branch:rename": Extract<IpcResponse, { type: "branch:rename:result" }>;
  "file:create": Extract<IpcResponse, { type: "file:create:result" }>;
  "dir:create": Extract<IpcResponse, { type: "dir:create:result" }>;
  "git:reset": Extract<IpcResponse, { type: "git:reset:result" }>;
  "git:revert": Extract<IpcResponse, { type: "git:revert:result" }>;
  "git:blame": Extract<IpcResponse, { type: "git:blame:result" }>;
  // CLI version tracking
  "cli:get-version-status": Extract<IpcResponse, { type: "cli:get-version-status:result" }>;
  "cli:recheck": Extract<IpcResponse, { type: "cli:recheck:started" }>;
  "cli:upgrade": Extract<IpcResponse, { type: "cli:upgrade:started" }>;
  "cli:upgrade:cancel": Extract<IpcResponse, { type: "cli:upgrade:cancel:ack" }>;
};

/**
 * Sends an IPC request and returns the typed success response.
 * Throws IpcError if the response is an error.
 */
export async function sendOrThrow<T extends keyof ResponseForRequest>(
  request: Extract<IpcRequest, { type: T }>
): Promise<ResponseForRequest[T]> {
  const response = await ipc.send(request);

  if (response.type === "error") {
    throw new IpcError(response.message);
  }

  return response as ResponseForRequest[T];
}

/**
 * Sends an IPC request without caring about the response.
 * Still throws on error responses.
 */
export async function sendCommand(request: IpcRequest): Promise<void> {
  const response = await ipc.send(request);
  if (response.type === "error") {
    throw new IpcError(response.message);
  }
}

// Re-export the event subscription from the original ipc utility
export const onEvent = ipc.on.bind(ipc);
