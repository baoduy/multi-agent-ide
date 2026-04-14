import { test as bddTest } from "playwright-bdd";
import { _electron, type ElectronApplication, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { WelcomePage } from "../pages/WelcomePage";
import { DockMainPage } from "../pages/DockMainPage";
import { SidebarPage } from "../pages/SidebarPage";
import { TitleBarPage } from "../pages/TitleBarPage";
import { NewSessionDialogPage } from "../pages/NewSessionDialogPage";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Resolves the absolute path to the compiled Electron main entry.
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

function makeTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "magenta-e2e-"));
}

type AllFixtures = {
  tempHome: string;
  electronApp: ElectronApplication;
  mainWindow: Page;
  welcomePage: WelcomePage;
  dockMainPage: DockMainPage;
  sidebarPage: SidebarPage;
  titleBarPage: TitleBarPage;
  newSessionDialog: NewSessionDialogPage;
  testWorkdir: string;
};

/**
 * Extends playwright-bdd's test with Electron fixtures + page objects.
 * This chains: playwright-bdd base → Electron app → page objects.
 */
export const test = bddTest.extend<AllFixtures>({
  tempHome: async ({}, use) => {
    const dir = makeTempHome();
    await use(dir);
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
    try {
      await app.close();
    } catch {
      // ignore — app may already be closed
    }
  },

  mainWindow: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await use(window);
  },

  welcomePage: async ({ mainWindow }, use) => {
    await use(new WelcomePage(mainWindow));
  },
  dockMainPage: async ({ mainWindow }, use) => {
    await use(new DockMainPage(mainWindow));
  },
  sidebarPage: async ({ mainWindow }, use) => {
    await use(new SidebarPage(mainWindow));
  },
  titleBarPage: async ({ mainWindow }, use) => {
    await use(new TitleBarPage(mainWindow));
  },
  newSessionDialog: async ({ mainWindow }, use) => {
    await use(new NewSessionDialogPage(mainWindow));
  },
  testWorkdir: async ({ tempHome }, use) => {
    await use(path.join(tempHome, "workdir"));
  },
});

export const { Given, When, Then } = createBdd(test);
