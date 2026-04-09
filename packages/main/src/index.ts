import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "path";
import { fork, type ChildProcess } from "child_process";

declare let __dirname: string;

let mainWindow: BrowserWindow | null = null;
let daemonProcess: ChildProcess | null = null;
let daemonReady = false;
let daemonError: string | null = null;

// Pending IPC requests waiting for daemon response
let requestIdCounter = 0;
const pendingRequests = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (err: Error) => void }
>();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const rendererPath = path.resolve(__dirname, "..", "renderer", "index.html");
  console.log(`Loading renderer from: ${rendererPath}`);
  mainWindow.loadFile(rendererPath);

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error("Failed to load:", errorCode, errorDescription);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer process gone:", details);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Register the IPC handler that bridges renderer ↔ daemon child process.
 */
function registerIpcHandler() {
  // Native folder picker dialog
  ipcMain.handle("magenta:select-folder", async () => {
    if (!mainWindow) {
      return null;
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Select a directory to scan for repositories",
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle("magenta:ipc", async (_event, request) => {
    const requestType = request?.type ?? "unknown";
    console.log(`[main] IPC request: ${requestType}, daemonReady=${daemonReady}`);

    if (!daemonProcess || !daemonReady) {
      const msg = daemonError
        ? `Daemon failed to start: ${daemonError}`
        : "Daemon not ready yet. Please wait a moment and try again.";
      console.warn(`[main] Daemon not ready, returning error: ${msg}`);
      return { type: "error", message: msg };
    }

    // Send request to daemon child process and wait for response
    return new Promise((resolve, reject) => {
      const id = ++requestIdCounter;
      pendingRequests.set(id, { resolve, reject });

      console.log(`[main] Forwarding request #${id} (${requestType}) to daemon`);
      daemonProcess!.send({ kind: "request", id, payload: request });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          console.warn(`[main] Request #${id} (${requestType}) timed out after 10s`);
          resolve({ type: "error", message: "Daemon request timed out" });
        }
      }, 10_000);
    });
  });
}

/**
 * Start the daemon as a forked child process.
 * The daemon runs in a separate process to avoid blocking Electron's main thread
 * during filesystem scanning and git operations.
 */
function startDaemon() {
  const daemonEntryPath = path.resolve(
    __dirname,
    "..",
    "..",
    "daemon",
    "dist",
    "daemon-ipc-worker.js"
  );

  console.log(`Forking daemon from: ${daemonEntryPath}`);

  try {
    daemonProcess = fork(daemonEntryPath, [], {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      // Use the system Node.js, not Electron's embedded one
      execPath: process.env["MAGENTA_NODE_PATH"] || "node",
    });

    daemonProcess.stdout?.on("data", (data: Buffer) => {
      console.log(`[daemon] ${data.toString().trim()}`);
    });

    daemonProcess.stderr?.on("data", (data: Buffer) => {
      console.error(`[daemon] ${data.toString().trim()}`);
    });

    daemonProcess.on("message", (msg: unknown) => {
      const message = msg as {
        kind: string;
        id?: number;
        payload?: unknown;
        type?: string;
      };

      if (message.kind === "ready") {
        daemonReady = true;
        console.log("Daemon child process is ready");
        return;
      }

      if (message.kind === "response" && message.id != null) {
        // Route response back to the pending IPC request
        const pending = pendingRequests.get(message.id);
        if (pending) {
          pendingRequests.delete(message.id);
          pending.resolve(message.payload);
        }
        return;
      }

      if (message.kind === "event" && message.payload) {
        // Forward push events to the renderer
        const eventType = (message.payload as Record<string, unknown>)?.type ?? "unknown";
        console.log(`[main] Forwarding event to renderer: ${eventType}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("magenta:event", message.payload);
        }
        return;
      }
    });

    daemonProcess.on("error", (err) => {
      daemonError = err.message;
      console.error("Daemon process error:", err.message);
    });

    daemonProcess.on("exit", (code, signal) => {
      console.error(`Daemon process exited (code=${code}, signal=${signal})`);
      daemonReady = false;
      daemonProcess = null;

      if (!daemonError) {
        if (signal) {
          daemonError = `Daemon crashed with signal ${signal}. Check the terminal for error details.`;
        } else {
          daemonError = `Daemon exited unexpectedly (code=${code})`;
        }
      }

      // Reject all pending requests
      for (const [id, pending] of pendingRequests) {
        pending.resolve({ type: "error", message: "Daemon process exited" });
        pendingRequests.delete(id);
      }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    daemonError = msg;
    console.error("Failed to fork daemon:", msg);
  }
}

function stopDaemon() {
  if (daemonProcess) {
    daemonProcess.kill();
    daemonProcess = null;
  }
}

console.log("Electron app initialized");

app.on("ready", () => {
  console.log("Electron ready event fired");
  registerIpcHandler();
  startDaemon();
  createWindow();
});

app.on("window-all-closed", () => {
  console.log("All windows closed");
  stopDaemon();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  console.log("Activate event fired");
  if (mainWindow === null) {
    createWindow();
  }
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});
