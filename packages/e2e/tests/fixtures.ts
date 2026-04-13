import { test as base, _electron, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "os";
import path from "node:path";

/**
 * Resolves the absolute path to the compiled Electron main entry.
 * Fails fast with a helpful message if the build is missing.
 */
function resolveMainEntry(): string {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const mainEntry = path.join(repoRoot, "packages", "main", "dist", "index.js");
  if (!fs.existsSync(mainEntry)) {
    throw new Error(
      `Electron main entry not found at ${mainEntry}. ` +
        `Run \`pnpm build\` at the repo root before running e2e tests.`,
    );
  }
  return mainEntry;
}

/**
 * Creates a fresh temporary home directory for this test run so the app's
 * SQLite database, logs, and settings don't pollute the user's real
 * `~/.magenta/` folder. The main process and daemon should read `HOME`
 * (and `MAGENTA_E2E`) to decide where to put data.
 */
function makeTempHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "magenta-e2e-"));
  return dir;
}

type Fixtures = {
  electronApp: ElectronApplication;
  mainWindow: Page;
  tempHome: string;
};

export const test = base.extend<Fixtures>({
  tempHome: async ({}, use) => {
    const dir = makeTempHome();
    await use(dir);
    // Best-effort cleanup
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  },

  electronApp: async ({ tempHome }, use) => {
    const mainEntry = resolveMainEntry();

    const app = await _electron.launch({
      args: [mainEntry],
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: "1",
        MAGENTA_E2E: "1",
        HOME: tempHome,
        USERPROFILE: tempHome,
      },
      timeout: 30_000,
    });

    await use(app);

    // Teardown — triggers before-quit -> stopDaemon() in the main process.
    try {
      await app.close();
    } catch {
      // ignore — app may already be closed
    }
  },

  mainWindow: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    // Give the renderer + IPC a moment to finish bootstrapping.
    // We don't hard-require a custom readiness flag here; individual tests
    // can `await window.waitForSelector(...)` for the UI they need.
    await use(window);
  },
});

export { expect } from "@playwright/test";
