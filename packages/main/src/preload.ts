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
   * Returns true if the given filesystem path currently exists, false otherwise.
   * Never throws — unreadable paths are reported as non-existent.
   */
  async pathExists(targetPath: string): Promise<boolean> {
    return ipcRenderer.invoke("magenta:path-exists", targetPath) as Promise<boolean>;
  },

  /**
   * Opens the given path in VS Code. Prefers the `code` CLI and falls back to
   * the `vscode://` URL scheme. Never throws.
   */
  async openInVscode(targetPath: string): Promise<void> {
    await ipcRenderer.invoke("magenta:open-in-vscode", targetPath);
  },

  /**
   * Reads today's application log file.
   */
  async readLog(): Promise<{ content: string; path: string }> {
    return ipcRenderer.invoke("magenta:read-log") as Promise<{ content: string; path: string }>;
  },

  /**
   * Register a callback for the before-close event from the main process.
   * The renderer should check for running sessions and call confirmClose() or cancelClose().
   */
  onBeforeClose(callback: () => void): () => void {
    const handler = () => callback();
    ipcRenderer.on("magenta:before-close", handler);
    return () => ipcRenderer.off("magenta:before-close", handler);
  },

  /** Tell main process to proceed with closing the window. */
  confirmClose(): void {
    ipcRenderer.send("magenta:confirm-close");
  },

  /** Tell main process to cancel the close. */
  cancelClose(): void {
    ipcRenderer.send("magenta:cancel-close");
  },
};

contextBridge.exposeInMainWorld("magentaIpc", api);

declare global {
  interface Window {
    magentaIpc: typeof api;
  }
}
