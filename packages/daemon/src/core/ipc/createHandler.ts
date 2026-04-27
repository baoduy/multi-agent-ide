import type { IpcRequest, IpcResponse } from "@magenta/shared/ipc";
import { toAppError } from "../errors/AppError";
import type { IpcHandler } from "./IPCBridge";

/**
 * Creates a safe handler wrapper that catches errors and normalizes them.
 * Handlers receive validated, typed request objects — no manual casting needed.
 */
export function createHandler<TType extends IpcRequest["type"]>(
  handler: IpcHandler<TType>
): IpcHandler<TType> {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      const appError = toAppError(error);
      console.error(`[ipc] Handler error for '${request.type}':`, appError.message);
      return {
        type: "error",
        message: appError.message,
      };
    }
  };
}

/**
 * Registers a handler on the bridge with automatic error normalization.
 */
export function safeHandle<TType extends IpcRequest["type"]>(
  bridge: IPCBridge,
  type: TType,
  handler: IpcHandler<TType>
): void {
  bridge.handle(type, createHandler(handler));
}

interface IPCBridge {
  handle<TType extends IpcRequest["type"]>(type: TType, handler: IpcHandler<TType>): void;
}
