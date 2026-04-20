import { app, BrowserWindow, dialog, ipcMain, nativeImage, session, shell } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { fork, type ChildProcess } from "child_process";

declare let __dirname: string;

// ──────────────────────────────────────────────────────────────
// File Logger — writes crash, error, and warning logs to disk
// ──────────────────────────────────────────────────────────────

const LOG_DIR = path.join(os.homedir(), ".magenta", "logs");
const MAX_LOG_DAYS = 14; // auto-clean logs older than 14 days

function ensureLogDir(): void {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // ignore — logging is best-effort
  }
}

/**
 * Returns today's log file path: ~/.magenta/logs/log-2026-04-10.log
 */
function getLogFilePath(): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(LOG_DIR, `log-${date}.log`);
}

/**
 * Remove log files older than MAX_LOG_DAYS.
 * Runs once at startup to keep the logs directory tidy.
 */
function cleanOldLogs(): void {
  try {
    const files = fs.readdirSync(LOG_DIR);
    const now = Date.now();
    const maxAge = MAX_LOG_DAYS * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (!file.startsWith("log-") || !file.endsWith(".log")) continue;

      const filePath = path.join(LOG_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // skip files we can't stat
      }
    }
  } catch {
    // best-effort
  }
}

type LogLevel = "INFO" | "WARN" | "ERROR" | "CRASH";

function writeLog(level: LogLevel, source: string, message: string): void {
  try {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] [${source}] ${message}\n`;
    fs.appendFileSync(getLogFilePath(), line, "utf-8");
  } catch {
    // best-effort — don't let logging failures crash the app
  }
}

// ──────────────────────────────────────────────────────────────
// Application State
// ──────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let daemonProcess: ChildProcess | null = null;
let daemonReady = false;
let daemonError: string | null = null;
/** True when the app is in the process of quitting (before-quit fired). */
let isQuitting = false;
let daemonStoppedIntentionally = false;

// Pending IPC requests waiting for daemon response
let requestIdCounter = 0;
const pendingRequests = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (err: Error) => void }
>();

// ──────────────────────────────────────────────────────────────
// Daemon ready promise (re-creatable for restarts)
// ──────────────────────────────────────────────────────────────

let daemonReadyResolve: (() => void) | null = null;
let daemonReadyPromise = new Promise<void>((resolve) => {
  daemonReadyResolve = resolve;
});

function resetDaemonReadyPromise(): void {
  daemonReadyPromise = new Promise<void>((resolve) => {
    daemonReadyResolve = resolve;
  });
}

/** How long (ms) to wait for the daemon before giving up. */
const DAEMON_READY_TIMEOUT_MS = 15_000;

// ──────────────────────────────────────────────────────────────
// Daemon crash-loop protection
// ──────────────────────────────────────────────────────────────

const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 60_000; // count restarts within this window
const RESTART_DELAY_MS = 1_000; // base delay before restarting (doubles each time)
let restartTimestamps: number[] = [];
let consecutiveRestarts = 0;

function canRestart(): boolean {
  const now = Date.now();
  // Prune timestamps older than the window
  restartTimestamps = restartTimestamps.filter((t) => now - t < RESTART_WINDOW_MS);
  return restartTimestamps.length < MAX_RESTARTS;
}

function recordRestart(): void {
  restartTimestamps.push(Date.now());
  consecutiveRestarts++;
}

function resetRestartCounters(): void {
  consecutiveRestarts = 0;
}

// ──────────────────────────────────────────────────────────────
// Window creation
// ──────────────────────────────────────────────────────────────

function getIconPath(): string {
  const iconsDir = path.resolve(__dirname, "..", "..", "..", "build", "icons");
  if (process.platform === "win32") {
    return path.join(iconsDir, "icon.ico");
  }
  return path.join(iconsDir, "icon.png");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: getIconPath(),
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 16, y: 12 },
    ...(process.platform !== "darwin"
      ? {
          titleBarOverlay: {
            color: "#f5f4ed",
            symbolColor: "#2c2c2c",
            height: 40,
          },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const rendererPath = path.resolve(__dirname, "..", "renderer", "index.html");
  console.log(`Loading renderer from: ${rendererPath}`);
  mainWindow.loadFile(rendererPath);

  // Keep navigation inside the SPA and push external links to the system browser.
  mainWindow.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Disable devtools in packaged builds to reduce renderer attack surface.
  if (app.isPackaged) {
    mainWindow.webContents.on("devtools-opened", () => {
      mainWindow?.webContents.closeDevTools();
    });
  }

  // Disable Cmd+R / Ctrl+R / F5 reload shortcuts in production
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    const isReload =
      (input.key === "r" && (input.meta || input.control)) ||
      (input.key === "R" && (input.meta || input.control)) ||
      input.key === "F5";

    if (isReload) {
      _event.preventDefault();
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    const msg = `Renderer failed to load: code=${errorCode} ${errorDescription}`;
    console.error(msg);
    writeLog("ERROR", "renderer", msg);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    const msg = `Renderer process gone: ${JSON.stringify(details)}`;
    console.error(msg);
    writeLog("CRASH", "renderer", msg);
  });

  // ── Intercept close to warn about running AI sessions ──
  let closeConfirmed = false;

  mainWindow.on("close", (e) => {
    if (closeConfirmed || isQuitting) return;

    // Prevent the default close and ask the renderer to check
    e.preventDefault();
    mainWindow?.webContents.send("magenta:before-close");
  });

  ipcMain.on("magenta:confirm-close", () => {
    closeConfirmed = true;
    mainWindow?.close();
  });

  ipcMain.on("magenta:cancel-close", () => {
    // No-op — the close was already prevented
  });

  mainWindow.on("closed", () => {
    // Clean up IPC listeners for this window
    ipcMain.removeAllListeners("magenta:confirm-close");
    ipcMain.removeAllListeners("magenta:cancel-close");
    mainWindow = null;
  });
}

// ──────────────────────────────────────────────────────────────
// Daemon lifecycle
// ──────────────────────────────────────────────────────────────

/**
 * Wait for the daemon to become ready, with a timeout.
 */
async function waitForDaemon(): Promise<boolean> {
  if (daemonReady) return true;
  if (daemonError) return false;

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

  // Open a directory (or file) in VS Code.
  //
  // Strategy: first try the `code` CLI via `child_process.spawn`, because that
  // correctly opens folders as workspaces (`vscode://file/<path>` opens a
  // folder as a single-file preview in some VS Code builds). Fall back to the
  // `vscode://` URL scheme when the CLI isn't on PATH — that way users who
  // installed VS Code but never ran "Shell Command: Install 'code' command in
  // PATH" still get a working menu item.
  //
  // Never throws: on failure the renderer just sees an unresolved promise.
  ipcMain.handle("magenta:open-in-vscode", async (_event, targetPath: string) => {
    if (!targetPath || typeof targetPath !== "string") return;

    const { spawn } = await import("child_process");

    // Try the `code` CLI first — it correctly opens folders as workspaces
    // (the `vscode://file/<path>` URL scheme opens folders as single-file
    // previews in some builds, which is not what users expect).
    //   -n  open a new VS Code window (avoids hijacking an existing project)
    const tryCli = (): Promise<boolean> =>
      new Promise((resolve) => {
        try {
          const child = spawn("code", ["-n", targetPath], {
            detached: true,
            stdio: "ignore",
            // On Windows `code` is a .cmd shim; shell:true lets Node resolve it.
            shell: process.platform === "win32",
          });
          child.on("error", () => resolve(false));
          child.on("spawn", () => {
            child.unref();
            resolve(true);
          });
        } catch {
          resolve(false);
        }
      });

    const ok = await tryCli();
    if (ok) return;

    // Fallback: URL scheme. Useful when VS Code is installed but `code` isn't
    // on PATH (common on macOS until the user runs the "Install 'code' command
    // in PATH" command palette action).
    try {
      await shell.openExternal(`vscode://file/${targetPath}`);
    } catch {
      // Silent — renderer treats both success and failure the same.
    }
  });

  // Check whether a filesystem path currently exists.
  //
  // Used by renderer-side context menus to grey out actions (e.g. "Open
  // session directory") when the referenced path has been moved or deleted
  // since the session record was persisted. Returns false on any error
  // (including EACCES) rather than throwing — callers treat a missing path
  // and an unreadable path identically.
  ipcMain.handle("magenta:path-exists", async (_event, targetPath: string): Promise<boolean> => {
    if (!targetPath || typeof targetPath !== "string") return false;
    try {
      return fs.existsSync(targetPath);
    } catch {
      return false;
    }
  });

  // Read today's application log file.
  //
  // The log is exposed to the renderer for the in-app diagnostics view. It
  // can contain full filesystem paths (including home directory), IPC
  // request types, and daemon stderr — all of which are useful to the user
  // for self-diagnosis but undesirable to leak wholesale to any renderer
  // code that might be compromised (e.g. via XSS in rendered markdown).
  //
  // Mitigations:
  //   1. Only return the tail (last 256 KB) — older history is truncated.
  //   2. Redact the home directory from file paths so shared diagnostic
  //      exports do not carry the system username.
  ipcMain.handle("magenta:read-log", async () => {
    const MAX_LOG_BYTES = 256 * 1024;
    const homeDir = os.homedir();
    const redact = (text: string): string =>
      homeDir && homeDir.length > 1 ? text.split(homeDir).join("~") : text;
    try {
      const logPath = getLogFilePath();
      if (!fs.existsSync(logPath)) {
        return { content: "", path: redact(logPath) };
      }
      const stat = fs.statSync(logPath);
      if (stat.size <= MAX_LOG_BYTES) {
        const content = fs.readFileSync(logPath, "utf-8");
        return { content: redact(content), path: redact(logPath) };
      }
      // Read only the tail of the file to keep payload size bounded.
      const fd = fs.openSync(logPath, "r");
      try {
        const buf = Buffer.alloc(MAX_LOG_BYTES);
        fs.readSync(fd, buf, 0, MAX_LOG_BYTES, stat.size - MAX_LOG_BYTES);
        // Drop the first (likely partial) line so the first visible entry
        // is well-formed.
        const raw = buf.toString("utf-8");
        const firstNewline = raw.indexOf("\n");
        const truncated = firstNewline >= 0 ? raw.slice(firstNewline + 1) : raw;
        return {
          content: `…[log truncated to last ${MAX_LOG_BYTES / 1024}KB]…\n` + redact(truncated),
          path: redact(logPath),
        };
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return { content: "", path: redact(getLogFilePath()) };
    }
  });

  ipcMain.handle("magenta:ipc", async (_event, request) => {
    const requestType = request?.type ?? "unknown";
    console.log(`[main] IPC request: ${requestType}, daemonReady=${daemonReady}`);

    // If daemon isn't ready yet, wait for it instead of immediately failing.
    if (!daemonReady) {
      // If daemon errored but we might be restarting, give it a chance
      if (daemonError && !daemonProcess) {
        // Attempt a restart if possible
        if (canRestart() && !isQuitting) {
          console.log(`[main] Daemon not running — attempting restart for: ${requestType}`);
          writeLog("WARN", "main", `Daemon not running, triggering restart for IPC: ${requestType}`);
          restartDaemon();
        }
      }

      console.log(`[main] Daemon not ready yet — waiting for: ${requestType}`);
      const ready = await waitForDaemon();

      if (!ready) {
        const msg = daemonError
          ? `Daemon failed to start: ${daemonError}`
          : "Daemon did not start in time. Please restart the application.";
        console.warn(`[main] Daemon wait failed for: ${requestType} — ${msg}`);
        writeLog("ERROR", "main", `Daemon wait failed for ${requestType}: ${msg}`);
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

      // Timeout after 30 seconds — gives the daemon enough headroom for
      // legitimately slow operations (large repo git commands, first-time
      // spec sync) without masking real hangs.
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          console.warn(`[main] Request #${id} (${requestType}) timed out after 30s`);
          writeLog("WARN", "main", `IPC request #${id} (${requestType}) timed out after 30s`);
          resolve({ type: "error", message: "Daemon request timed out" });
        }
      }, 30_000);
    });
  });
}

/**
 * Start the daemon as a forked child process.
 */
function startDaemon() {
  daemonStoppedIntentionally = false;

  const daemonEntryPath = path.resolve(
    __dirname,
    "..",
    "..",
    "daemon",
    "dist",
    "daemon-ipc-worker.js"
  );

  console.log(`Forking daemon from: ${daemonEntryPath}`);
  writeLog("INFO", "main", `Starting daemon from: ${daemonEntryPath}`);

  try {
    const isPackaged = app.isPackaged;
    const daemonEnv: Record<string, string> = { ...process.env } as Record<string, string>;
    if (isPackaged) {
      // node-pty (and now lmdb) live in extraResources/node_modules (outside the asar).
      // Set NODE_PATH so the daemon's plain Node.js require() can find it.
      daemonEnv["NODE_PATH"] = path.join(process.resourcesPath, "node_modules");

      // macOS GUI apps launched from Finder inherit a minimal PATH that may
      // not include directories where git and other CLI tools live.
      // Ensure standard paths are present so child_process.execSync can find
      // /bin/sh and git commands succeed.
      const standardPaths = [
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
        "/opt/homebrew/bin",   // Apple Silicon Homebrew
      ];
      const currentPath = daemonEnv["PATH"] || "";
      const existingParts = new Set(currentPath.split(":").filter(Boolean));
      const missing = standardPaths.filter((p) => !existingParts.has(p));
      if (missing.length > 0) {
        daemonEnv["PATH"] = currentPath ? `${currentPath}:${missing.join(":")}` : missing.join(":");
      }
      writeLog("INFO", "main", `Daemon PATH: ${daemonEnv["PATH"]}`);

      // Resolve git to an absolute path — Electron's ELECTRON_RUN_AS_NODE
      // forked processes don't reliably search PATH with execFileSync.
      const gitCandidates = [
        "/usr/bin/git",
        "/opt/homebrew/bin/git",
        "/usr/local/bin/git",
      ];
      for (const candidate of gitCandidates) {
        if (fs.existsSync(candidate)) {
          daemonEnv["MAGENTA_GIT_PATH"] = candidate;
          writeLog("INFO", "main", `Resolved git: ${candidate}`);
          break;
        }
      }
    }

    // Always fork through Electron's bundled Node (via ELECTRON_RUN_AS_NODE=1)
    // so the daemon's native modules (lmdb, node-pty) run against the same
    // V8/ABI they were rebuilt for. In dev mode we previously used the
    // system `node` binary, but electron-rebuild targets Electron's V8 and
    // the resulting `.node` binaries V8-CHECK-crash when loaded under a
    // different V8 build that shares the same NODE_MODULE_VERSION.
    const nodeExecPath =
      process.env["MAGENTA_NODE_PATH"] || process.execPath;

    daemonProcess = fork(daemonEntryPath, [], {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      execPath: nodeExecPath,
      env: {
        ...daemonEnv,
        ELECTRON_RUN_AS_NODE: "1",
      },
    });

    daemonProcess.stdout?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      console.log(`[daemon] ${text}`);
      // Log warnings and errors from daemon stdout to file
      if (text.includes("WARN") || text.includes("ERROR") || text.includes("FATAL")) {
        writeLog("WARN", "daemon", text);
      }
    });

    daemonProcess.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      console.error(`[daemon] ${text}`);
      writeLog("ERROR", "daemon-stderr", text);
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
        daemonError = null;
        // Reset crash counters on successful startup
        resetRestartCounters();

        if (daemonReadyResolve) {
          daemonReadyResolve();
          daemonReadyResolve = null;
        }
        console.log("Daemon child process is ready");
        writeLog("INFO", "main", "Daemon child process is ready");
        return;
      }

      if (message.kind === "response" && message.id != null) {
        const pending = pendingRequests.get(message.id);
        if (pending) {
          pendingRequests.delete(message.id);
          pending.resolve(message.payload);
        }
        return;
      }

      if (message.kind === "event" && message.payload) {
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
      writeLog("ERROR", "daemon", `Process error: ${err.message}`);

      // Unblock waiters so they get the error
      if (daemonReadyResolve) {
        daemonReadyResolve();
        daemonReadyResolve = null;
      }
    });

    daemonProcess.on("exit", (code, signal) => {
      const msg = `Daemon process exited (code=${code}, signal=${signal})`;
      console.error(msg);
      writeLog(signal ? "CRASH" : "WARN", "daemon", msg);

      daemonReady = false;
      daemonProcess = null;

      const wasExpected = isQuitting || daemonStoppedIntentionally;

      if (!daemonError) {
        if (signal) {
          daemonError = `Daemon crashed with signal ${signal}.`;
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

      // ── Auto-restart logic ──
      if (!wasExpected && !isQuitting) {
        if (canRestart()) {
          const delay = RESTART_DELAY_MS * Math.pow(2, Math.min(consecutiveRestarts, 4));
          writeLog("WARN", "main", `Scheduling daemon restart in ${delay}ms (attempt ${consecutiveRestarts + 1})`);
          console.log(`[main] Daemon crashed — restarting in ${delay}ms (attempt ${consecutiveRestarts + 1}/${MAX_RESTARTS})`);

          setTimeout(() => {
            if (!isQuitting) {
              restartDaemon();
            }
          }, delay);
        } else {
          const crashMsg = `Daemon crashed ${MAX_RESTARTS} times within ${RESTART_WINDOW_MS / 1000}s — not restarting. Please restart the application.`;
          writeLog("CRASH", "main", crashMsg);
          console.error(`[main] ${crashMsg}`);
          daemonError = crashMsg;

          // Notify renderer of unrecoverable daemon failure
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("magenta:event", {
              type: "daemon:crash",
              message: crashMsg,
            });
          }
        }
      }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    daemonError = msg;
    console.error("Failed to fork daemon:", msg);
    writeLog("CRASH", "main", `Failed to fork daemon: ${msg}`);

    if (daemonReadyResolve) {
      daemonReadyResolve();
      daemonReadyResolve = null;
    }
  }
}

/**
 * Restart the daemon after a crash.
 * Resets state and starts a fresh daemon process.
 */
function restartDaemon(): void {
  recordRestart();
  writeLog("INFO", "main", `Restarting daemon (attempt ${consecutiveRestarts})`);
  console.log(`[main] Restarting daemon (attempt ${consecutiveRestarts})`);

  // Clean up any lingering process
  if (daemonProcess) {
    try {
      daemonProcess.kill();
    } catch {
      // already dead
    }
    daemonProcess = null;
  }

  // Reset daemon state
  daemonReady = false;
  daemonError = null;
  resetDaemonReadyPromise();

  startDaemon();
}

/**
 * Gracefully stop the daemon, giving it time to clean up.
 */
function stopDaemon(): Promise<void> {
  daemonStoppedIntentionally = true;

  return new Promise((resolve) => {
    if (!daemonProcess) {
      resolve();
      return;
    }

    const proc = daemonProcess;
    const GRACEFUL_TIMEOUT_MS = 5_000;

    // Set up a timeout to force-kill if graceful shutdown hangs
    const forceKillTimer = setTimeout(() => {
      console.warn("[main] Daemon did not exit gracefully — force killing");
      writeLog("WARN", "main", "Daemon did not exit gracefully within 5s — force killing");
      try {
        proc.kill("SIGKILL");
      } catch {
        // already dead
      }
      daemonProcess = null;
      resolve();
    }, GRACEFUL_TIMEOUT_MS);

    // Listen for clean exit
    proc.once("exit", () => {
      clearTimeout(forceKillTimer);
      daemonProcess = null;
      resolve();
    });

    // Send SIGTERM for graceful shutdown
    try {
      proc.kill("SIGTERM");
    } catch {
      clearTimeout(forceKillTimer);
      daemonProcess = null;
      resolve();
    }
  });
}

// ──────────────────────────────────────────────────────────────
// App lifecycle
// ──────────────────────────────────────────────────────────────

console.log("Electron app initialized");
ensureLogDir();
cleanOldLogs();
writeLog("INFO", "main", `Magenta IDE starting (platform=${process.platform}, pid=${process.pid})`);

app.setName("Magenta IDE");

app.on("ready", () => {
  console.log("Electron ready event fired");
  writeLog("INFO", "main", "Electron ready event fired");

  // Defense-in-depth: enforce CSP for every renderer response.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self'",
            "connect-src 'self'",
            "worker-src 'self' blob:",
            "object-src 'none'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
          ].join("; "),
        ],
      },
    });
  });

  if (process.platform === "darwin") {
    const dockIconPath = path.resolve(__dirname, "..", "..", "..", "build", "icons", "512x512.png");
    try {
      const icon = nativeImage.createFromPath(dockIconPath);
      if (!icon.isEmpty() && app.dock) {
        app.dock.setIcon(icon);
      }
    } catch {
      // Silently ignore
    }
  }

  registerIpcHandler();
  startDaemon();
  createWindow();
});

/**
 * before-quit fires before windows close. Mark the flag so the daemon
 * exit handler knows this is an intentional shutdown, not a crash.
 */
app.on("before-quit", () => {
  isQuitting = true;
  writeLog("INFO", "main", "App quitting — will stop daemon");
});

app.on("window-all-closed", async () => {
  console.log("All windows closed");
  writeLog("INFO", "main", "All windows closed");

  await stopDaemon();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

/**
 * macOS: user clicked the dock icon or switched back to the app.
 * If the daemon died while the window was closed, restart it.
 */
app.on("activate", () => {
  console.log("Activate event fired");
  writeLog("INFO", "main", "Activate event fired");

  // Restart daemon if it's not running (e.g. crashed while window was closed)
  if (!daemonProcess && !isQuitting) {
    console.log("[main] Daemon not running on activate — restarting");
    writeLog("INFO", "main", "Daemon not running on activate — restarting");

    // Reset error state so the renderer doesn't see stale errors
    daemonError = null;
    resetDaemonReadyPromise();
    restartTimestamps = [];
    consecutiveRestarts = 0;
    startDaemon();
  }

  if (mainWindow === null) {
    createWindow();
  }
});

// ──────────────────────────────────────────────────────────────
// Global error handlers
// ──────────────────────────────────────────────────────────────

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  writeLog("CRASH", "main", `Uncaught exception: ${err.stack || err.message}`);
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.stack || reason.message : String(reason);
  console.error("Unhandled rejection:", msg);
  writeLog("ERROR", "main", `Unhandled rejection: ${msg}`);
});
