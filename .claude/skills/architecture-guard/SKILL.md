---
name: architecture-guard
description: 'Run before claiming a daemon or renderer task is complete. Greps the codebase for the specific anti-patterns documented in CLAUDE.md (payload casts, try/catch in handlers, cross-store imports, manual IPC error checks, direct fs/git in handlers, sessionStore.updateX methods). Returns a list of any violations found, with file and line references. Cheap to run — pure grep.'
user-invocable: false
---

# Architecture Guard

Run this skill on the file paths that were modified in the current task BEFORE reporting completion. It is fast (pure grep) and catches the violations that CLAUDE.md's anti-pattern table is meant to prevent.

## Procedure

For each modified file, run the matching checks below. Report the FULL list of violations found at the end (or "no violations" if clean). Do not silently fix violations — surface them so the user can decide.

### Daemon checks (`packages/daemon/src/`)

Handlers now live in each feature module's `handlers/` folder (`packages/daemon/src/modules/*/handlers/`). Run these greps and report any matches:

```bash
# Forbidden casts on already-typed IPC payloads
grep -rnE 'as Record<string, unknown>|as any|as unknown as' packages/daemon/src/modules/*/handlers/

# try/catch is banned in handlers — safeHandle wraps errors
grep -rnE '\btry\s*\{|\bcatch\s*\(' packages/daemon/src/modules/*/handlers/
```

Run these against all daemon handler files:

```bash
# Direct I/O bypassing the gateway layer
grep -rnE "from\s+['\"]node:fs|from\s+['\"]fs['\"]|from\s+['\"]simple-git['\"]" packages/daemon/src/modules/*/handlers/

# Direct LMDB usage in handlers
grep -rnE "from\s+['\"]lmdb['\"]" packages/daemon/src/modules/*/handlers/
```

### Renderer checks (`packages/ui/src/renderer/`)

Cross-store imports are banned:

```bash
# A store importing another store
grep -nE "from\s+['\"]\.\./stores/|from\s+['\"]\./[a-z]+Store" packages/ui/src/renderer/stores/
# Filter results to keep only matches where the importing file is itself a store
```

Deferred dynamic store imports are banned:

```bash
grep -nE "Promise\.resolve\(\)\.then.*import" packages/ui/src/renderer/
```

Manual IPC error checks are banned (use `sendOrThrow`):

```bash
grep -nrE "response\.type\s*===\s*['\"]error['\"]" packages/ui/src/renderer/
```

`updateXxx` methods on sessionStore are banned (use `patchSession`):

```bash
grep -nE "useSessionStore\.[A-Za-z]*\(\)\.update[A-Z]" packages/ui/src/renderer/
grep -nE "^\s*update[A-Z][A-Za-z]+:\s*\(.*\)\s*=>" packages/ui/src/renderer/stores/sessionStore.ts
```

### Cross-cutting checks

Service-constructs-service pattern (services should be wired in `DaemonContainer`, not constructed inline):

```bash
grep -rnE "new [A-Z][A-Za-z]+Service\(" packages/daemon/src/modules/*/app/
grep -rnE "new [A-Z][A-Za-z]+Gateway\(" packages/daemon/src/modules/*/app/
# Hits inside DaemonContainer.ts are fine; flag hits elsewhere.
```

## Reporting

Output format:

```
## Architecture Guard Report

### Violations: [N]

[For each violation, list:]
- packages/.../foo.ts:42 — <rule>: <one-line excerpt>
  Fix: <concrete next step>

### Clean checks: [list which categories had zero hits]
```

If everything is clean, say so in one line and stop.

## When to skip

Skip running this when:
- The change touches only `packages/shared/`, docs, configs, or tests
- The change is a pure rename with no behavior change
- The user has already acknowledged a known intentional violation in this session
