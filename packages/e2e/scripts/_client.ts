/**
 * Tiny HTTP client that sends a command to the running debug-electron session.
 * Shared by the wrapper scripts (inspect, click, eval, ...).
 */

import fs from "node:fs";
import path from "node:path";

const ENDPOINT_FILE = path.resolve(__dirname, "..", ".debug-endpoint");

export async function sendCommand(cmd: unknown): Promise<unknown> {
  if (!fs.existsSync(ENDPOINT_FILE)) {
    throw new Error(
      `No debug session running. Start one with \`pnpm -C packages/e2e debug:launch\` (run in the background).`,
    );
  }
  const { endpoint } = JSON.parse(fs.readFileSync(ENDPOINT_FILE, "utf-8")) as {
    endpoint: string;
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const body = (await res.json()) as { ok: boolean; result?: unknown; error?: string };
  if (!body.ok) {
    throw new Error(body.error ?? "Unknown error");
  }
  return body.result;
}

export function printJson(value: unknown): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(value, null, 2));
}

export async function runCli(buildCmd: (argv: string[]) => unknown): Promise<void> {
  const argv = process.argv.slice(2);
  try {
    const cmd = buildCmd(argv);
    const result = await sendCommand(cmd);
    printJson(result);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
