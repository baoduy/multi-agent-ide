import type { IpcRequest, IpcResponse } from "@magenta/shared/ipc";

type ResponseListener<T extends IpcResponse["type"]> = (payload: Extract<IpcResponse, { type: T }>) => void;

/**
 * Check if the IPC bridge is available (i.e. running inside Electron with preload).
 */
function ipcAvailable(): boolean {
  return typeof window !== "undefined" && window.magentaIpc != null;
}

/**
 * Opens a native folder picker dialog via Electron.
 * Returns the selected path or null if cancelled / not available.
 */
export async function selectFolder(): Promise<string | null> {
  if (!ipcAvailable() || typeof window.magentaIpc.selectFolder !== "function") {
    // Fallback for non-Electron environments
    const input = window.prompt("Enter the path to scan for repositories:");
    return input && input.trim() !== "" ? input.trim() : null;
  }

  try {
    return await window.magentaIpc.selectFolder();
  } catch (error) {
    console.error("[ipc] selectFolder failed:", error);
    return null;
  }
}

/**
 * Opens the given path in the system file manager (Finder / Explorer).
 */
export async function openInFileManager(dirPath: string): Promise<void> {
  if (!ipcAvailable() || typeof window.magentaIpc.openInFileManager !== "function") {
    console.warn("[ipc] openInFileManager not available");
    return;
  }
  try {
    await window.magentaIpc.openInFileManager(dirPath);
  } catch (error) {
    console.error("[ipc] openInFileManager failed:", error);
  }
}

export const ipc = {
  async send(request: IpcRequest): Promise<IpcResponse> {
    if (!ipcAvailable()) {
      console.warn("[ipc] magentaIpc not available — daemon may not be running");
      return { type: "error", message: "IPC bridge not available. Daemon may not be running." };
    }
    try {
      return await window.magentaIpc.send(request);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[ipc] send failed:", msg);
      return { type: "error", message: msg };
    }
  },

  on<T extends IpcResponse["type"]>(type: T, listener: ResponseListener<T>): () => void {
    if (!ipcAvailable()) {
      // Return no-op unsubscribe
      return () => {};
    }

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
