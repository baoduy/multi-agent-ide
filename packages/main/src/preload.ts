import { contextBridge, ipcRenderer } from "electron";

import type { IpcRequest, IpcResponse } from "@magenta/shared/ipc";

type Listener = (payload: IpcResponse) => void;

const listeners = new Map<Listener, (event: Electron.IpcRendererEvent, payload: IpcResponse) => void>();

const api = {
  async send(request: IpcRequest): Promise<IpcResponse> {
    return ipcRenderer.invoke("magenta:ipc", request) as Promise<IpcResponse>;
  },

  on(type: IpcResponse["type"], listener: Listener): void {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: IpcResponse) => {
      if (payload.type === type) {
        listener(payload);
      }
    };

    listeners.set(listener, wrapped);
    ipcRenderer.on("magenta:event", wrapped);
  },

  off(listener: Listener): void {
    const wrapped = listeners.get(listener);

    if (!wrapped) {
      return;
    }

    ipcRenderer.off("magenta:event", wrapped);
    listeners.delete(listener);
  },

  /**
   * Opens a native folder picker dialog. Returns the selected path or null if cancelled.
   */
  async selectFolder(): Promise<string | null> {
    return ipcRenderer.invoke("magenta:select-folder") as Promise<string | null>;
  },

  /**
   * Opens the given path in the system file manager (Finder on macOS, Explorer on Windows).
   */
  async openInFileManager(dirPath: string): Promise<void> {
    await ipcRenderer.invoke("magenta:open-in-file-manager", dirPath);
  },

  /**
   * Reads today's application log file.
   */
  async readLog(): Promise<{ content: string; path: string }> {
    return ipcRenderer.invoke("magenta:read-log") as Promise<{ content: string; path: string }>;
  },
};

contextBridge.exposeInMainWorld("magentaIpc", api);

declare global {
  interface Window {
    magentaIpc: typeof api;
  }
}
