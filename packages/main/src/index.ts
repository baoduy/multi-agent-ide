import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from "electron";
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

/**
 * Promise that resolves when the daemon sends its "ready" message.
 * IPC requests arriving before the daemon is ready will await this
 * instead of immediately returning an error.
 */
let daemonReadyResolve: (() => void) | null = null;
const daemonReadyPromise = new Promise<void>((resolve) => {
  daemonReadyResolve = resolve;
});

/** How long (ms) to wait for the daemon before giving up. */
const DAEMON_READY_TIMEOUT_MS = 15_000;

function getIconPath(): string {
  const iconsDir = path.resolve(__dirname, "..", "..", "..", "build", "icons");
  if (process.platform === "win32") {
    return path.join(iconsDir, "icon.ico");
  }
  // macOS uses .icns from electron-builder at package time;
  // during dev, fall back to the PNG
  return path.join(iconsDir, "icon.png");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: getIconPath(),
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 16, y: 18 },
    ...(process.platform !== "darwin"
      ? {
          titleBarOverlay: {
            color: "#f5f4ed",
            symbolColor: "#2c2c2c",
            height: 52,
          },
        }
      : {}),
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
 * Wait for the daemon to become ready, with a timeout.
 * Returns true if ready, false if timed out or failed.
 */
async function waitForDaemon(): Promise<boolean> {
  if (daemonReady) return true;
  if (daemonError) return false;

  // Race: daemon ready vs timeout
  const timeout = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), DAEMON_READY_TIMEOUT_MS),
  );

  const result = await Promise.race([
    daemonReadyPromise.then(() => "ready" as const),
    timeout,
  ]);

  return result === "ready";
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

  // Open a path in the system file manager (Finder / Explorer)
  ipcMain.handle("magenta:open-in-file-manager", async (_event, dirPath: string) => {
    if (dirPath) {
      shell.showItemInFolder(dirPath);
    }
  });

  ipcMain.handle("magenta:ipc", async (_event, request) => {
    const requestType = request?.type ?? "unknown";
    console.log(`[main] IPC request: ${requestType}, daemonReady=${daemonReady}`);

    // If daemon isn't ready yet, wait for it instead of immediately failing.
    // This eliminates the startup race condition where the renderer fires
    // requests before the daemon has finished initializing (WASM, SQLite, etc.).
    if (!daemonReady) {
      if (daemonError) {
        console.warn(`[main] Daemon failed, returning error for: ${requestType}`);
        return { type: "error", message: `Daemon failed to start: ${daemonError}` };
      }

      console.log(`[main] Daemon not ready yet — waiting for: ${requestType}`);
      const ready = await waitForDaemon();

      if (!ready) {
        const msg = daemonError
          ? `Daemon failed to start: ${daemonError}`
          : "Daemon did not start in time. Please restart the application.";
        console.warn(`[main] Daemon wait failed for: ${requestType} — ${msg}`);
        return { type: "error", message: msg };
      }

      console.log(`[main] Daemon is now ready — proceeding with: ${requestType}`);
    }

    if (!daemonProcess) {
      return { type: "error", message: "Daemon process is not running." };
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
        // Unblock any IPC requests that are waiting for the daemon
        if (daemonReadyResolve) {
          daemonReadyResolve();
          daemonReadyResolve = null;
        }
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
      // Unblock waiters so they get the error
      if (daemonReadyResolve) {
        daemonReadyResolve();
        daemonReadyResolve = null;
      }
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

      // Unblock waiters so they get the error
      if (daemonReadyResolve) {
        daemonReadyResolve();
        daemonReadyResolve = null;
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
    // Unblock waiters
    if (daemonReadyResolve) {
      daemonReadyResolve();
      daemonReadyResolve = null;
    }
  }
}

function stopDaemon() {
  if (daemonProcess) {
    daemonProcess.kill();
    daemonProcess = null;
  }
}

console.log("Electron app initialized");

// Set the app name so macOS dock, Windows taskbar, etc. show
// "Magenta IDE" instead of the default "Electron".
app.setName("Magenta IDE");

app.on("ready", () => {
  console.log("Electron ready event fired");

  // Set the dock icon on macOS so it shows the Magenta logo
  // instead of the default Electron icon during development.
  if (process.platform === "darwin") {
    const dockIconPath = path.resolve(__dirname, "..", "..", "..", "build", "icons", "512x512.png");
    try {
      const icon = nativeImage.createFromPath(dockIconPath);
      if (!icon.isEmpty() && app.dock) {
        app.dock.setIcon(icon);
      }
    } catch {
      // Silently ignore — icon will use default if not found
    }
  }

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
