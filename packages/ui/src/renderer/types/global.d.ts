import type { IpcRequest, IpcResponse } from "@magenta/shared/ipc";

declare global {
  interface Window {
    magentaIpc: {
      send(request: IpcRequest): Promise<IpcResponse>;
      on(type: IpcResponse["type"], listener: (payload: IpcResponse) => void): void;
      off(listener: (payload: IpcResponse) => void): void;
      selectFolder(): Promise<string | null>;
      openInFileManager(dirPath: string): Promise<void>;
      readLog(): Promise<{ content: string; path: string }>;
      onBeforeClose(callback: () => void): () => void;
      confirmClose(): void;
      cancelClose(): void;
    };
  }
}

export {};
