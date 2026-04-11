# Data Model: MagentaTerminal Reuse and Sidebar Terminal

**Phase**: 1 — Design  
**Date**: 2026-04-11  
**Feature**: [spec.md](spec.md)

---

## Entities

### TerminalSession

Represents one active PTY session managed by the daemon. Lives in-memory only (no database persistence). Keyed by a ULID-generated `sessionId`.

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | `string` (ULID) | Unique identifier for this session |
| `cwd` | `string` | Working directory the shell was spawned in |
| `cols` | `number` | Terminal column width (characters) |
| `rows` | `number` | Terminal row height (lines) |
| `pid` | `number` | OS process ID of the spawned shell |
| `status` | `"active" \| "closed"` | Whether the PTY process is still running |

**Lifecycle**: Created by `TerminalApplicationService.spawn()`, destroyed by `close()` or natural process exit.

---

### TerminalMode

Represents the operational mode of a `MagentaTerminal` component instance.

| Value | Description |
|-------|-------------|
| `readonly` | Displays output piped from an app-managed script (e.g., onboard/upgrade). No user input. |
| `interactive` | Full PTY session. User can type commands and see real-time output. |

**Governance**: Set by the `readonly` prop at render time. Not toggled at runtime.

---

### CommandSubmission

Represents a single user-entered command sent to a PTY session in interactive mode. Not persisted.

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | `string` | Target PTY session |
| `data` | `string` | Raw keystrokes or command string (may include newline) |

---

### TerminalOutputEvent

Represents a chunk of output emitted from a PTY session and streamed to the UI via IPC.

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | `string` | Source PTY session |
| `data` | `string` | ANSI-stripped plain text output chunk |

---

### ReadonlyOutputEvent

Represents a chunk of output emitted from an app-managed process (onboard/upgrade) streamed to the UI. This is the existing model; unchanged.

| Field | Type | Description |
|-------|------|-------------|
| `repoPath` | `string` | Identifies which onboard/upgrade process emitted the output |
| `data` | `string` | Output text (already plain text from `child_process.spawn`) |

---

## State Transitions

### TerminalSession lifecycle (daemon side)

```
[not exists]
     │
     ▼  terminal:spawn received
  active  ──────────────────────────────► closed
     │                                      │
     │ terminal:data events stream           │
     │ terminal:input writes to PTY          │
     │ terminal:resize resizes PTY           │
     ▼                                      ▼
  (ongoing)                        terminal:exited event sent
                                   session removed from Map
```

### MagentaTerminal (readonly) — UI side

```
[mounted by dialog, output="" ]
     │
     ▼  process starts
  output growing via appendOutput()
     │
     ▼  process completes
  output frozen, success/error state shown
     │
     ▼  dialog closed / dismissed
  [unmounted]
```

### MagentaTerminal (interactive) — UI side

```
[mounted in ActivityPanel]
     │
     ▼  useEffect on mount → terminalStore.spawn(cwd)
  status: "connecting"
     │
     ▼  terminal:spawned IPC response
  status: "active"
     │
     ├─ terminal:data events → output appended
     ├─ user input → terminalStore.write(sessionId, data)
     ├─ resize → terminalStore.resize(sessionId, cols, rows)
     │
     ▼  terminal:exited event OR component unmounts
  status: "closed"
  terminalStore.close(sessionId) called if needed
     │
     ▼  [unmounted]
```

---

## UI Store Shape: TerminalStoreState

```typescript
type TerminalSession = {
  sessionId: string;
  cwd: string;
  status: "connecting" | "active" | "closed" | "error";
  output: string;        // accumulated plain-text output for rendering
  error: string | null;
};

type TerminalStoreState = {
  sessions: Record<string, TerminalSession>;  // keyed by sessionId
  subscriptionsReady: boolean;

  // Actions
  spawn(cwd: string, cols: number, rows: number): Promise<string>;   // returns sessionId
  write(sessionId: string, data: string): void;
  resize(sessionId: string, cols: number, rows: number): void;
  close(sessionId: string): void;
  appendOutput(sessionId: string, data: string): void;
  setExited(sessionId: string): void;
  initializeSubscriptions(): void;
};
```

---

## Component Props Shape: MagentaTerminalProps

```typescript
type MagentaTerminalProps = {
  // Mode control
  readonly: boolean;

  // Readonly mode props (ignored when readonly=false)
  output?: string;           // controlled output string from parent
  status?: "idle" | "running" | "done" | "error";
  successMessage?: string;   // shown on status=done + success
  errorMessage?: string;     // shown on status=done + error

  // Interactive mode props (ignored when readonly=true)
  cwd?: string;              // working directory for new PTY session

  // Shared
  label?: string;            // optional header label
  maxHeight?: number;        // max height of the output <pre> (default: 300)
};
```

---

## Validation Rules

- `sessionId` MUST be a valid ULID (22 characters).
- `cols` and `rows` MUST be positive integers; minimum 1.
- `cwd` MUST be a resolvable filesystem path; if absent, defaults to `process.cwd()` at spawn time in the daemon.
- In readonly mode: `output`, `status`, `successMessage`, `errorMessage` are all purely display-driven; no validation needed beyond type checking.
- In interactive mode: `data` in a `terminal:input` request MUST reference an active (non-closed) `sessionId`; the daemon silently drops writes to closed sessions.
