/**
 * Long-running debug session for the Magenta IDE Electron app.
 *
 * Usage:
 *   pnpm -C packages/e2e debug:launch          # starts the app, blocks
 *
 * While running, other scripts (inspect.ts, click.ts, eval.ts, ...) — or
 * Claude via Bash — talk to it by POSTing JSON to http://127.0.0.1:<port>/cmd.
 *
 * The chosen port and endpoint path are written to
 *   packages/e2e/.debug-endpoint
 * so sibling scripts can find it without arguments.
 */

import { _electron, type ElectronApplication, type Page } from "playwright";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const MAIN_ENTRY = path.join(REPO_ROOT, "packages", "main", "dist", "index.js");
const ENDPOINT_FILE = path.resolve(__dirname, "..", ".debug-endpoint");

type Command =
  | { kind: "inspect"; selector: string; styles?: string[] }
  | { kind: "click"; selector: string; doubleClick?: boolean }
  | { kind: "fill"; selector: string; value: string }
  | { kind: "eval"; expression: string }
  | { kind: "snapshot" }
  | { kind: "screenshot"; pathName?: string }
  | { kind: "console"; level?: "all" | "error" | "warn"; lines?: number }
  | { kind: "title" }
  | { kind: "stop" };

type ConsoleEntry = { level: string; text: string; ts: number };

async function main() {
  if (!fs.existsSync(MAIN_ENTRY)) {
    console.error(
      `[debug-electron] Main entry not found: ${MAIN_ENTRY}\n` +
        `Run \`pnpm build\` at the repo root first.`,
    );
    process.exit(1);
  }

  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "magenta-e2e-debug-"));
  console.log(`[debug-electron] Using temp HOME: ${tempHome}`);

  const app: ElectronApplication = await _electron.launch({
    args: [MAIN_ENTRY],
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: "1",
      MAGENTA_E2E: "1",
      HOME: tempHome,
      USERPROFILE: tempHome,
    },
    timeout: 30_000,
  });

  const window: Page = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  // Collect renderer console messages so Claude can inspect them.
  const consoleBuffer: ConsoleEntry[] = [];
  const MAX_CONSOLE = 500;
  window.on("console", (msg) => {
    consoleBuffer.push({ level: msg.type(), text: msg.text(), ts: Date.now() });
    if (consoleBuffer.length > MAX_CONSOLE) consoleBuffer.shift();
  });
  window.on("pageerror", (err) => {
    consoleBuffer.push({ level: "error", text: err.stack || err.message, ts: Date.now() });
    if (consoleBuffer.length > MAX_CONSOLE) consoleBuffer.shift();
  });

  // Start command server on an OS-chosen free port bound to loopback.
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/cmd") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Not found" }));
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    let cmd: Command;
    try {
      cmd = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as Command;
    } catch (err) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: `Bad JSON: ${(err as Error).message}` }));
      return;
    }

    try {
      const result = await dispatch(cmd, app, window, consoleBuffer);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, result }));

      if (cmd.kind === "stop") {
        // Close the server/app after responding.
        setTimeout(() => void shutdown(app, server), 50);
      }
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ ok: false, error: (err as Error).message, stack: (err as Error).stack }),
      );
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("Unable to determine server port");
  const endpoint = `http://127.0.0.1:${addr.port}/cmd`;
  fs.writeFileSync(ENDPOINT_FILE, JSON.stringify({ endpoint, pid: process.pid }, null, 2));
  console.log(`[debug-electron] Ready. Command endpoint: ${endpoint}`);
  console.log(`[debug-electron] Endpoint file: ${ENDPOINT_FILE}`);
  console.log(`[debug-electron] Press Ctrl-C to stop, or POST {"kind":"stop"}.`);

  const cleanup = () => void shutdown(app, server);
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

async function dispatch(
  cmd: Command,
  app: ElectronApplication,
  window: Page,
  consoleBuffer: ConsoleEntry[],
): Promise<unknown> {
  switch (cmd.kind) {
    case "inspect": {
      const locator = window.locator(cmd.selector).first();
      const exists = (await locator.count()) > 0;
      if (!exists) return { exists: false };
      const [tagName, id, className, textContent, box, styles] = await Promise.all([
        locator.evaluate((el) => el.tagName.toLowerCase()),
        locator.evaluate((el) => (el as HTMLElement).id),
        locator.evaluate((el) => (el as HTMLElement).className),
        locator.evaluate((el) => (el.textContent || "").slice(0, 500)),
        locator.boundingBox(),
        locator.evaluate((el, props: string[]) => {
          const cs = getComputedStyle(el as HTMLElement);
          const out: Record<string, string> = {};
          for (const p of props) out[p] = cs.getPropertyValue(p);
          return out;
        }, cmd.styles ?? ["color", "background-color", "font-size", "font-family", "padding", "margin", "display"]),
      ]);
      return { exists: true, tagName, id, className, textContent, box, styles };
    }

    case "click": {
      const locator = window.locator(cmd.selector).first();
      if (cmd.doubleClick) await locator.dblclick();
      else await locator.click();
      return { clicked: cmd.selector };
    }

    case "fill": {
      await window.locator(cmd.selector).first().fill(cmd.value);
      return { filled: cmd.selector };
    }

    case "eval": {
      const value = await window.evaluate((expr: string) => {
        // eslint-disable-next-line no-new-func
        return Promise.resolve(new Function(`return (${expr})`)());
      }, cmd.expression);
      return { value };
    }

    case "snapshot": {
      // Playwright's public Page doesn't expose the accessibility API in all
      // versions; cast to access it when present. Returns the a11y tree.
      const a11y = (window as unknown as { accessibility?: { snapshot: () => Promise<unknown> } })
        .accessibility;
      if (!a11y) {
        throw new Error("Accessibility snapshot is unavailable on this Playwright version");
      }
      const tree = await a11y.snapshot();
      return { tree };
    }

    case "screenshot": {
      const outPath =
        cmd.pathName ??
        path.resolve(
          __dirname,
          "..",
          "test-results",
          `debug-${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
        );
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      await window.screenshot({ path: outPath, fullPage: true });
      return { path: outPath };
    }

    case "console": {
      const level = cmd.level ?? "all";
      const lines = cmd.lines ?? 50;
      const filtered = consoleBuffer.filter((e) => {
        if (level === "all") return true;
        if (level === "error") return e.level === "error";
        if (level === "warn") return e.level === "warning" || e.level === "error";
        return true;
      });
      return { entries: filtered.slice(-lines) };
    }

    case "title":
      return { title: await window.title(), url: window.url() };

    case "stop":
      return { stopping: true };

    default: {
      const _exhaustive: never = cmd;
      throw new Error(`Unknown command kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

async function shutdown(app: ElectronApplication, server: http.Server) {
  try {
    fs.rmSync(ENDPOINT_FILE, { force: true });
  } catch {
    // ignore
  }
  try {
    server.close();
  } catch {
    // ignore
  }
  try {
    await app.close();
  } catch {
    // ignore
  }
  process.exit(0);
}

void main().catch((err) => {
  console.error("[debug-electron] Fatal:", err);
  process.exit(1);
});
