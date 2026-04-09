import type { IpcRequest, IpcResponse } from "@magenta/shared/ipc";

type ResponseListener<T extends IpcResponse["type"]> = (payload: Extract<IpcResponse, { type: T }>) => void;

export const ipc = {
  send(request: IpcRequest): Promise<IpcResponse> {
    return window.magentaIpc.send(request);
  },
  on<T extends IpcResponse["type"]>(type: T, listener: ResponseListener<T>): () => void {
    const wrapped = (payload: IpcResponse) => {
      if (payload.type === type) {
        listener(payload as Extract<IpcResponse, { type: T }>);
      }
    };

    window.magentaIpc.on(type, wrapped);

    return () => {
      window.magentaIpc.off(wrapped);
    };
  },
};
