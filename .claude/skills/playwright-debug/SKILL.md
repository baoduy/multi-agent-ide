---
name: playwright-debug
description: Drive the running Magenta IDE Electron app via Playwright — inspect DOM, click, fill, eval JS in the renderer, read console logs, take screenshots. Use when debugging UI behavior, verifying styles, or reproducing user-reported issues in the desktop app.
---

# Playwright Debug — Magenta IDE

This skill lets Claude interactively debug the Magenta IDE Electron app. It launches the real packaged Electron app (main process + forked daemon + renderer) under Playwright control and exposes a small HTTP command API so Claude can inspect and manipulate the running UI.

## When to use

Trigger this skill when the user asks to:
- "Debug the UI" / "why isn't the X button working" / "what does the Y panel actually render"
- Verify that a renderer change actually displays the way it was intended
- Reproduce a crash or state the user is describing
- Check styles, layout, or accessibility tree of the live app

## Prerequisites

- The workspace must be built: `pnpm build` at the repo root.
- Playwright browsers must be installed once: `pnpm -C packages/e2e exec playwright install chromium` (Electron itself is already a dep — Playwright drives it directly, but Chromium is needed for some helpers).

## How to run

### 1. Start a debug session (background)

Start the session as a background Bash task so Claude can keep issuing commands:

```
pnpm debug:launch
```

(Equivalent: `pnpm -C packages/e2e debug:launch`.)

When ready, it writes `packages/e2e/.debug-endpoint` containing the local command URL. The app window opens and the daemon forks exactly as in production, but with a temporary `$HOME` so the user's real `~/.magenta/` is not touched.

### 2. Drive the app

Use the helper scripts (from the repo root):

```
pnpm -C packages/e2e debug:inspect ".some-selector"
pnpm -C packages/e2e debug:inspect "button.primary" padding color font-size
pnpm -C packages/e2e debug:click  "button[data-testid=new-session]"
pnpm -C packages/e2e debug:click  ".list-item" --double
pnpm -C packages/e2e debug:eval   "document.title"
pnpm -C packages/e2e debug:eval   "document.querySelectorAll('button').length"
pnpm -C packages/e2e debug:snapshot                  # accessibility tree
```

All wrappers POST to the endpoint stored in `.debug-endpoint` and print JSON results.

For commands not covered by a wrapper, POST directly:

```
curl -s -X POST "$(jq -r .endpoint packages/e2e/.debug-endpoint)" \
     -H content-type:application/json \
     -d '{"kind":"console","level":"error","lines":30}'
curl -s -X POST "$(jq -r .endpoint packages/e2e/.debug-endpoint)" \
     -H content-type:application/json \
     -d '{"kind":"screenshot"}'
curl -s -X POST "$(jq -r .endpoint packages/e2e/.debug-endpoint)" \
     -H content-type:application/json \
     -d '{"kind":"fill","selector":"input[name=path]","value":"/tmp/foo"}'
```

### 3. Stop the session

```
pnpm -C packages/e2e debug:stop
```

Or `TaskStop` the background Bash task. Both trigger a clean `app.close()` which SIGTERMs the daemon (see `packages/main/src/index.ts:516-555`).

## Supported commands

| kind | params | returns |
|---|---|---|
| `inspect` | `selector`, optional `styles[]` | tag, id, className, text (500 chars), bounding box, computed styles |
| `click` | `selector`, optional `doubleClick` | `{ clicked }` |
| `fill` | `selector`, `value` | `{ filled }` |
| `eval` | `expression` | `{ value }` (JSON-serialized return) |
| `snapshot` | — | accessibility tree |
| `screenshot` | optional `pathName` | `{ path }` (defaults to `packages/e2e/test-results/`) |
| `console` | optional `level`, `lines` | renderer console + pageerror entries (buffered, last 500) |
| `title` | — | `{ title, url }` |
| `stop` | — | closes the app |

## Running the full E2E test suite

Non-interactive, CI-style runs:

```
pnpm test:e2e             # headless
pnpm test:e2e:headed      # visible window
pnpm test:e2e:debug       # Playwright Inspector
```

Tests live in `packages/e2e/tests/` and use the fixture at `packages/e2e/tests/fixtures.ts`.

## Notes for Claude

- **Always prefer `inspect` over `screenshot`** for verifying text, colors, fonts, spacing — inspect returns exact values; screenshots are lossy and slow.
- **Check `console`** whenever a UI action doesn't behave as expected; renderer errors land there.
- The app takes up to 15 s for the daemon to become ready after launch; the first command may block briefly while the daemon starts.
- This package (`@magenta/e2e`) is **not** shipped to release builds — it's excluded by the `files:` allowlist in `electron-builder.yml`.
