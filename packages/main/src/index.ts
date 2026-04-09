import { app, BrowserWindow } from "electron";
import path from "path";
import { spawn } from "child_process";

declare let __dirname: string;
declare let __filename: string;

let mainWindow: BrowserWindow | null = null;
let daemonProcess: any = null;

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

  // Load development server or static files
  const isDev = process.env.NODE_ENV === "development";
  // Load renderer HTML file
  const rendererPath = path.resolve(__dirname, "..", "renderer", "index.html");
  console.log(`Loading renderer from: ${rendererPath}`);
  mainWindow.loadFile(rendererPath);

  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    console.error("Failed to load:", errorCode, errorDescription);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer process gone:", details);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function startDaemon() {
  // __dirname is packages/main/dist, so go up to packages/main, then to packages/daemon/dist
  const daemonPath = path.resolve(__dirname, "..", "..", "daemon", "dist", "index.js");
  
  console.log(`Starting daemon from: ${daemonPath}`);
  daemonProcess = spawn("node", [daemonPath], {
    stdio: "inherit",
  });

  daemonProcess.on("error", (err: Error) => {
    console.error("Failed to start daemon:", err);
  });

  daemonProcess.on("exit", (code: number) => {
    console.log(`Daemon exited with code ${code}`);
  });
}

function stopDaemon() {
  if (daemonProcess) {
    daemonProcess.kill();
  }
}

console.log("Electron app initialized");

app.on("ready", () => {
  console.log("Electron ready event fired");
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
  process.exit(1);
});
