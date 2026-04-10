import { EventEmitter } from "node:events";

import type { IpcRequest, IpcResponse } from "@magenta/shared/ipc";
import { IpcRequestSchema } from "@magenta/shared/ipc";

type RequestByType<TType extends IpcRequest["type"]> = Extract<IpcRequest, { type: TType }>;

export type IpcHandler<TType extends IpcRequest["type"] = IpcRequest["type"]> = (
  request: RequestByType<TType>
) => Promise<IpcResponse> | IpcResponse;

export class IPCBridge {
  private readonly handlers = new Map<IpcRequest["type"], IpcHandler>();
  private readonly emitter = new EventEmitter();

  handle<TType extends IpcRequest["type"]>(type: TType, handler: IpcHandler<TType>): void {
    this.handlers.set(type, handler as unknown as IpcHandler);
  }

  async invoke(payload: unknown): Promise<IpcResponse> {
    // Validate the incoming request payload
    let request: IpcRequest;
    try {
      request = IpcRequestSchema.parse(payload);
    } catch (error) {
      return {
        type: "error",
        message: `Invalid IPC request: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    const handler = this.handlers.get(request.type);
    if (!handler) {
      return {
        type: "error",
        message: `No IPC handler registered for '${request.type}'.`,
      };
    }

    return handler(request);
  }

  on<TResponse extends IpcResponse>(type: TResponse["type"], listener: (payload: TResponse) => void): void {
    this.emitter.on(type, listener as (payload: IpcResponse) => void);
  }

  off<TResponse extends IpcResponse>(type: TResponse["type"], listener: (payload: TResponse) => void): void {
    this.emitter.off(type, listener as (payload: IpcResponse) => void);
  }

  emit<TResponse extends IpcResponse>(payload: TResponse): void {
    this.emitter.emit(payload.type, payload);
  }
}
