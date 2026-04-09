import {
  IpcRequestSchema,
  IpcResponseSchema,
  type IpcRequest,
  type IpcResponse,
} from "@magenta/shared/ipc";

export function validateIpcRequest(payload: unknown): IpcRequest {
  return IpcRequestSchema.parse(payload);
}

export function validateIpcResponse(payload: unknown): IpcResponse {
  return IpcResponseSchema.parse(payload);
}
