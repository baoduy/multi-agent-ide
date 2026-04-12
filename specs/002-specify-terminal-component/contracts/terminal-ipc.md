# IPC Contract: Terminal Sessions

**Package**: `packages/shared/src/ipc.ts`  
**Date**: 2026-04-11  
**Feature**: MagentaTerminal Reuse and Sidebar Terminal

All message types listed here must be added to both `IpcRequestSchema` and `IpcResponseSchema` discriminated unions in `packages/shared/src/ipc.ts`. The UI's `ResponseForRequest` type map in `packages/ui/src/renderer/services/ipcClient.ts` must also be updated.

---

## Request Messages

### `terminal:spawn`

Spawns a new PTY shell session in the daemon.

```typescript
{
  type: "terminal:spawn";
  cwd: string;    // Working directory for the shell
  cols: number;   // Initial terminal width in columns
  rows: number;   // Initial terminal height in rows
}
```

**Response**: `terminal:spawned`

---

### `terminal:input`

Sends keystrokes or command data to an active PTY session's stdin.

```typescript
{
  type: "terminal:input";
  sessionId: string;  // Target PTY session (ULID)
  data: string;       // Raw input (may include control characters, newline)
}
```

**Response**: `terminal:input:ack`  
**Side effects**: Data written to PTY stdin immediately.

---

### `terminal:resize`

Resizes a PTY session (e.g., when the terminal container is resized).

```typescript
{
  type: "terminal:resize";
  sessionId: string;
  cols: number;
  rows: number;
}
```

**Response**: `terminal:resize:ack`

---

### `terminal:close`

Terminates an active PTY session.

```typescript
{
  type: "terminal:close";
  sessionId: string;
}
```

**Response**: `terminal:close:ack`

---

## Response Messages (direct replies)

### `terminal:spawned`

```typescript
{
  type: "terminal:spawned";
  sessionId: string;  // ULID identifying the new session
}
```

---

### `terminal:input:ack`

```typescript
{
  type: "terminal:input:ack";
  sessionId: string;
}
```

---

### `terminal:resize:ack`

```typescript
{
  type: "terminal:resize:ack";
  sessionId: string;
}
```

---

### `terminal:close:ack`

```typescript
{
  type: "terminal:close:ack";
  sessionId: string;
}
```

---

## Event Messages (daemon → UI, streamed asynchronously)

These are emitted via `bridge.emit()` (same pattern as `repo:onboard:output`). The UI subscribes via `onEvent()`.

### `terminal:data`

Emitted when the PTY produces output. Data is ANSI-stripped by the daemon before emission.

```typescript
{
  type: "terminal:data";
  sessionId: string;
  data: string;  // Plain text, ANSI escape codes stripped
}
```

---

### `terminal:exited`

Emitted when the PTY process exits (normally or due to error).

```typescript
{
  type: "terminal:exited";
  sessionId: string;
  exitCode: number;  // Exit code of the shell process
}
```

---

## ResponseForRequest Type Map Update

The following entry must be added to the `ResponseForRequest` map in `ipcClient.ts`:

```typescript
"terminal:spawn"  → terminal:spawned
"terminal:input"  → terminal:input:ack
"terminal:resize" → terminal:resize:ack
"terminal:close"  → terminal:close:ack
```

---

## Existing Contract: Unchanged

The following existing event types are NOT modified by this feature. `MagentaTerminal` in readonly mode continues to receive output through the existing subscription path in `onboardStore`:

- `repo:onboard:output`
- `repo:onboard:complete`
- `repo:upgrade-specify:output`
- `repo:upgrade-specify:complete`
