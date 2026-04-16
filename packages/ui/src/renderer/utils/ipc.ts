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

/**
 * Opens the given path in VS Code. The main process tries the `code` CLI
 * first (which opens folders as proper workspaces) and falls back to the
 * `vscode://file/<path>` URL scheme if the CLI is unavailable.
 */
export async function openInVscode(targetPath: string): Promise<void> {
  if (!ipcAvailable() || typeof window.magentaIpc.openInVscode !== "function") {
    console.warn("[ipc] openInVscode not available");
    return;
  }
  try {
    await window.magentaIpc.openInVscode(targetPath);
  } catch (error) {
    console.error("[ipc] openInVscode failed:", error);
  }
}

/**
 * Returns true if the given filesystem path currently exists.
 * Returns false when the bridge is unavailable, the path is empty, or any
 * error occurs — callers should treat this as an optimistic check for UI
 * state (e.g. greying out a menu item) and not a security gate.
 */
export async function pathExists(targetPath: string | null | undefined): Promise<boolean> {
  if (!targetPath) return false;
  if (!ipcAvailable() || typeof window.magentaIpc.pathExists !== "function") {
    // Outside Electron we can't check — assume it exists so actions remain
    // clickable in dev environments where the renderer is served standalone.
    return true;
  }
  try {
    return await window.magentaIpc.pathExists(targetPath);
  } catch (error) {
    console.error("[ipc] pathExists failed:", error);
    return false;
  }
}

/**
 * Reads today's application log file via Electron.
 */
export async function readLog(): Promise<{ content: string; path: string }> {
  if (!ipcAvailable() || typeof window.magentaIpc.readLog !== "function") {
    return { content: "", path: "" };
  }
  try {
    return await window.magentaIpc.readLog();
  } catch (error) {
    console.error("[ipc] readLog failed:", error);
    return { content: "", path: "" };
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
