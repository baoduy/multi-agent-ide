---
name: add-ipc-endpoint
description: 'Use whenever adding a new IPC request/response between the daemon and the renderer in the Magenta IDE codebase. Fires on phrases like "add an IPC endpoint", "add a daemon endpoint", "expose this from the daemon", "wire this up to the renderer", or any change that introduces a new variant in IpcRequestSchema. Walks the strict 5-step checklist from CLAUDE.md — shared schema, application service, handler, registerHandlers, ipcClient ResponseForRequest map.'
---

# Adding an IPC Endpoint (Magenta IDE)

The IPC contract lives in five files. Skipping any one of them produces silent type drift between daemon and renderer (memory shows this is the #1 source of regressions in this codebase). Touch them in this exact order; do not return to the user with the task complete until all five are updated.

## Step 1 — Define the schema (`packages/shared/src/ipc.ts`)

Add a new variant to BOTH discriminated unions:

```typescript
// IpcRequestSchema: add a new z.object variant with a unique "type" literal
const MyNewRequestSchema = z.object({
  type: z.literal("my-new-request"),
  // typed payload fields here
});

// IpcResponseSchema: add the matching success variant
const MyNewResponseSchema = z.object({
  type: z.literal("my-new-request:ok"), // follow existing naming convention
  // typed response payload here
});
```

Update the discriminated unions to include both. The error variant is shared.

## Step 2 — Application Service (`packages/daemon/src/application/`)

Either extend an existing service or create a new one in `packages/daemon/src/application/`. The service method contains ALL orchestration logic for this endpoint.

```typescript
export class MyService {
  constructor(
    private readonly fileSystemGateway: FileSystemGateway,
    private readonly someRepository: SomeRepository,
  ) {}

  async doSomething(input: InputType): Promise<OutputType> {
    // orchestration logic
    // throw new AppError("CODE", "message") on failure
  }
}
```

Rules:
- No `fs.*`, `git.*`, or LMDB calls directly — delegate to a Gateway in `packages/daemon/src/infrastructure/`.
- Errors are `AppError` with a code from `AppErrorCode` (`packages/daemon/src/errors/AppError.ts`). Add a new code if needed.
- Domain logic (pure functions over data) goes in `packages/daemon/src/domain/`, NOT in the service.

## Step 3 — Handler (`packages/daemon/src/ipc/handlers/`)

Create a thin handler using `safeHandle()`:

```typescript
export function registerMyHandlers(bridge: IPCBridge, myService: MyService) {
  safeHandle(bridge, "my-new-request", async (req) => {
    return myService.doSomething(req.someField);
  });
}
```

Hard rules (anti-patterns from CLAUDE.md):
- NO `try/catch` — `safeHandle` normalizes errors via `toAppError()`.
- NO casts on `req` (`as Record<string, unknown>` etc.) — it is already typed by Zod parsing at the bridge.
- NO direct `fs`, `git`, or LMDB calls.
- One service call per handler. If you need orchestration, that goes in the service.

## Step 4 — Wire into composition root (`packages/daemon/src/ipc/registerHandlers.ts`)

- Instantiate any new application service inside `DaemonContainer` (NOT inside another service).
- Expose it as a `readonly` property on the container.
- Pass it into the new handler-registration function from `registerHandlers.ts`.

## Step 5 — Renderer typing (`packages/ui/src/renderer/services/ipcClient.ts`)

Add an entry to `ResponseForRequest`:

```typescript
type ResponseForRequest = {
  // ... existing entries
  "my-new-request": MyNewResponseSchema; // the SUCCESS variant payload type
};
```

This is what gives `sendOrThrow<"my-new-request">()` its return type. Forgetting it makes the renderer fall back to `unknown`.

## Step 6 — Renderer call site

In a store action or service:

```typescript
const response = await sendOrThrow({
  type: "my-new-request",
  someField: value,
});
// response is fully typed; sendOrThrow throws IpcError on the daemon error variant
```

Never write manual `if (response.type === 'error')` — `sendOrThrow` throws automatically.

## Verification

Per project convention (`feedback_verification.md`), stop at:

```bash
pnpm typecheck   # all 5 packages must pass
pnpm build       # all 5 packages must build
```

Do NOT launch the app. The user tests UI manually.

## Self-check before reporting done

- [ ] New variant added to BOTH `IpcRequestSchema` and `IpcResponseSchema` in `packages/shared/src/ipc.ts`
- [ ] Application service method added; throws `AppError` with valid code on failure
- [ ] Handler uses `safeHandle()`, no try/catch, no casts, no direct I/O
- [ ] Service instantiated in `DaemonContainer`, handler registered in `registerHandlers.ts`
- [ ] `ResponseForRequest` updated in `packages/ui/src/renderer/services/ipcClient.ts`
- [ ] Renderer call uses `sendOrThrow`, not manual error checking
- [ ] `pnpm typecheck` clean across all packages
- [ ] `pnpm build` clean across all packages
