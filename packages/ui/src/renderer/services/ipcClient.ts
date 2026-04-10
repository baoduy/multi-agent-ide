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
  "dir:list": Extract<IpcResponse, { type: "dir:list:result" }>;
  "session:get": Extract<IpcResponse, { type: "session:response" }>;
  "session:update": Extract<IpcResponse, { type: "session:updated" }>;
  "config:get": Extract<IpcResponse, { type: "config:response" }>;
  "config:add-working-dir": Extract<IpcResponse, { type: "config:response" }>;
  "config:remove-working-dir": Extract<IpcResponse, { type: "config:response" }>;
  "config:update": Extract<IpcResponse, { type: "config:response" }>;
  "branch:list": Extract<IpcResponse, { type: "branch:list:result" }>;
  "branch:checkout": Extract<IpcResponse, { type: "branch:checkout:result" }>;
  "gitfile:read": Extract<IpcResponse, { type: "gitfile:read:result" }>;
  "worktree:create": Extract<IpcResponse, { type: "worktree:create:result" }>;
  "worktree:list": Extract<IpcResponse, { type: "worktree:list:result" }>;
  "worktree:status": Extract<IpcResponse, { type: "worktree:status:result" }>;
  "worktree:merge": Extract<IpcResponse, { type: "worktree:merge:result" }>;
  "worktree:branches": Extract<IpcResponse, { type: "worktree:branches:result" }>;
  "worktree:delete": Extract<IpcResponse, { type: "worktree:delete:result" }>;
  "repo:onboard": Extract<IpcResponse, { type: "repo:onboard:started" }>;
  "repo:upgrade-specify": Extract<IpcResponse, { type: "repo:upgrade-specify:started" }>;
  "repo:onboard:cancel": Extract<IpcResponse, { type: "repo:onboard:cancelled" }>;
  "repo:force-reload": Extract<IpcResponse, { type: "repo:force-reload:started" }>;
  "git:user": Extract<IpcResponse, { type: "git:user:result" }>;
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
