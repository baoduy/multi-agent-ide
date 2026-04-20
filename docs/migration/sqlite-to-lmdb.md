# SQLite → LMDB Migration Plan

**Status:** Proposed · **Owner:** Steven · **Date:** 2026-04-20

This document is the authoritative handover brief for a code-mode session that will migrate Magenta IDE's daemon persistence from SQLite (sql.js WASM) to LMDB. It is written to be executed without re-exploring the codebase.

---

## 1. Why we're migrating

The daemon DB is **a cache layer for UI responsiveness**, not a source of truth. Authoritative state lives in:

- Git repos and worktrees (branch/worktree state)
- Filesystem (spec files, stage markdown)
- AI provider session files on disk (Claude Code / Copilot)

This is important because it means **no user-data migration is required** — the cache is rebuildable from a background refresh. We can ship LMDB empty and let existing sync services repopulate it on first run.

Current pain points driving the change:

1. **sql.js WASM performance** — WASM overhead on every query, no native mmap.
2. **Migration / schema pain** — 16 hand-written migrations for a cache that could be rebuilt instead.
3. **Concurrency / locking** — background refresh jobs contend with UI reads; occasional lock/busy behaviour.

LMDB solves all three: memory-mapped reads (microsecond latency), schemaless (no migrations), and MVCC (readers never block writers, writers never block readers).

---

## 2. Target architecture

### 2.1 Dependency change

Add `lmdb` (npm — native module). Remove `sql.js` and `@types/sql.js`.

### 2.2 Sub-database layout

Each current table becomes an LMDB named sub-database opened via `env.openDB(name)`. Keys are strings; values are msgpack-encoded objects (LMDB built-in).

| Sub-DB              | Primary key          | Secondary index keys (same sub-db, prefix-scan)          | Notes                                        |
| ------------------- | -------------------- | -------------------------------------------------------- | -------------------------------------------- |
| `repos`             | `repo:${id}`         | `repo:path:${path}` → `${id}`                            | Path uniqueness via secondary                |
| `working_dirs`      | `workdir:${id}`      | `workdir:path:${path}` → `${id}`                         |                                              |
| `session_state`     | `session` (singleton)| —                                                        | Single row replaced in full                  |
| `specs`             | `spec:${id}`         | `spec:repo:${repoId}:${branch}:${name}` → `${id}`        | Range scan by `spec:repo:${repoId}:` for list-by-repo |
| `spec_stages`       | `stage:${id}`        | `stage:spec:${specId}:${name}` → `${id}`                 | Range scan by `stage:spec:${specId}:` for list-by-spec |
| `synced_sessions`   | `session:${id}`      | `session:file:${syncedFilePath}` → `${id}` · `session:provider:${provider}:${invertedStartedAt}:${id}` → `${id}` | Inverted timestamp gives DESC order on range scan |
| `worktrees`         | `worktree:${path}`   | `worktree:repo:${repoPath}:${name}` → `${path}`          | Primary key is already the path              |

Plus one meta sub-db:

| Sub-DB   | Key        | Value                                  | Purpose                          |
| -------- | ---------- | -------------------------------------- | -------------------------------- |
| `_meta`  | `version`  | `{ version: number, appliedAt: ISO }`  | Cache schema version for rebuild |

**Rule:** On daemon startup, if `_meta.version` is missing or below the current app version, wipe all sub-dbs and let background jobs rehydrate. This replaces the entire SQL migration system.

### 2.3 Gateway surface — preserve unchanged

The application layer calls the following repository methods today and should continue to work identically after migration:

- `RepoRepository`: `listAll()`, `findByPath(path)`, `upsert(repo)`, `flush()` (now no-op)
- `SpecRepository`: `getByRepoPath(repoPath)`, `syncSpecs(repoPath, fresh)`, ...
- `SyncedSessionRepository`: `list()`, `listByProvider(p)`, `upsert(r)`, `archiveById(id)`, `deleteByProvider(p)`, `countByProvider(p)`, `getFileSync(filePath)`
- `WorktreeRepository`: `list()`, `listByRepo(repoPath)`, `getByPath(worktreePath)`, `upsert(r)`, `deleteByPath(worktreePath)`, `deleteStale(...)`, `flush()` (now no-op)

If a method signature must change, surface the change via `DaemonContainer` wiring and update every call site in the same PR.

---

## 3. Current-state inventory (verified)

### 3.1 Files that import SQLite / sql.js

- `packages/daemon/src/db/DatabaseService.ts` — singleton factory
- `packages/daemon/src/db/SqliteCompat.ts` — sql.js WASM wrapper (prepare/get/run/all/transaction)
- `packages/daemon/src/db/MigrationRunner.ts` — migration orchestrator
- `packages/daemon/src/db/migrations/` — 16 migration files (`0001_initial.ts` through `0016_add_worktrees.ts`)
- `packages/daemon/src/daemon-ipc-worker.ts` — calls `DatabaseService.create()`
- `packages/daemon/src/types/sql.js.d.ts` — type declarations
- `packages/daemon/src/services/RepoRepository.ts`
- `packages/daemon/src/services/SpecRepository.ts`
- `packages/daemon/src/services/SyncedSessionRepository.ts`
- `packages/daemon/src/services/WorktreeRepository.ts`
- `packages/daemon/src/services/ScanQueue.ts` — calls `repoRepository.flush()`
- `packages/daemon/build.mjs` — copies `sql-wasm.wasm` into `dist/`

### 3.2 DB lifecycle hooks today

- Open: `DatabaseService.create(path?)` — async factory at daemon startup, path defaults to `~/.magenta/magenta.db`.
- Pragmas: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`.
- Auto-save: 5-second timer in the service constructor, plus explicit `flush()` on writes that must be durable.
- Close: `close()` in graceful shutdown (flushes first).
- WASM resource: `process.env.MAGENTA_RESOURCES_PATH` (set by the Electron main process) or dev fallback.
- Testing hook: `DatabaseService.resetInstanceForTesting()`.

All of these lifecycle hooks must be preserved in `LmdbDatabaseService` with the same method names and async contract so callers in `daemon-ipc-worker.ts` don't need to change.

---

## 4. Phased execution plan

Each phase produces a working build. Cleanup happens in the final phase so that any rollback before then is trivial.

### Phase 1 — Core LMDB infrastructure (no behaviour change)

**Add:**

- `packages/daemon/src/db/LmdbStore.ts`
  - Thin wrapper around `lmdb` env: `openDb(name, opts)`, `get`, `put`, `remove`, `range(opts)`, `transaction(fn)`, `close()`.
  - Single shared env; one sub-db per logical table.
- `packages/daemon/src/db/LmdbDatabaseService.ts`
  - Singleton factory mirroring `DatabaseService`: `static async create(path?)`, `getInstance()`, `resetInstanceForTesting()`, `close()`.
  - Exposes `getDb(name)` returning a typed sub-db handle.
  - `flush()` becomes a no-op (LMDB commits are durable on transaction boundary).
- `packages/daemon/src/db/LmdbMigrationRunner.ts`
  - Reads `_meta.version`. If behind the app constant `CACHE_SCHEMA_VERSION`, drops all sub-dbs and writes the new version.
- `packages/daemon/src/db/CACHE_SCHEMA_VERSION.ts` — exports `export const CACHE_SCHEMA_VERSION = 1;`

**Modify:**

- `packages/daemon/package.json` — add `lmdb` dependency.
- `packages/daemon/build.mjs` — stop copying `sql-wasm.wasm`; mark `lmdb` as external so esbuild doesn't try to bundle the native module.

**Tests to add:**

- `packages/daemon/src/db/LmdbStore.test.ts` — put/get/remove/range basics.
- `packages/daemon/src/db/LmdbDatabaseService.test.ts` — singleton lifecycle, `resetInstanceForTesting()`.
- `packages/daemon/src/db/LmdbMigrationRunner.test.ts` — version bump triggers wipe.

**Verification:**

- `pnpm typecheck && pnpm build` clean.
- Daemon still compiles even though nothing calls LMDB yet.

---

### Phase 2 — Repository migration

**Add (new files, do NOT rename existing yet):**

- `packages/daemon/src/services/LmdbRepoRepository.ts`
- `packages/daemon/src/services/LmdbSpecRepository.ts`
- `packages/daemon/src/services/LmdbSyncedSessionRepository.ts`
- `packages/daemon/src/services/LmdbWorktreeRepository.ts`

Each implements the exact public interface of its SQLite counterpart (see §2.3). Multi-write operations use `lmdbStore.transaction(fn)`.

**Modify:**

- `packages/daemon/src/daemon-ipc-worker.ts` — swap:
  ```ts
  const databaseService = await LmdbDatabaseService.create();
  const repoRepository = new LmdbRepoRepository(databaseService);
  const specRepository = new LmdbSpecRepository(databaseService);
  const syncedSessionRepository = new LmdbSyncedSessionRepository(databaseService);
  const worktreeRepository = new LmdbWorktreeRepository(databaseService);
  ```
  No other wiring changes.

**Tests to add:**

- `LmdbRepoRepository.test.ts` — `listAll`, `findByPath`, `upsert`, path-uniqueness via secondary key.
- `LmdbSpecRepository.test.ts` — the LEFT-JOIN-equivalent `getByRepoPath` with stages.
- `LmdbSyncedSessionRepository.test.ts` — provider filter + DESC-by-startedAt via inverted-timestamp index.
- `LmdbWorktreeRepository.test.ts` — list-by-repo prefix scan and `deleteStale`.

**Verification:**

- Launch `pnpm dev`. In the UI:
  1. Add a working directory → repos list populates.
  2. Open a repo with specs → specs + stages render.
  3. Sync sessions → activity panel fills.
  4. Quit + relaunch → cache warm on first paint.
- `ls -la ~/.magenta/` should show an LMDB `data.mdb` / `lock.mdb` pair (not a SQLite file).

---

### Phase 3 — Electron native module integration

**Modify:**

- Root `package.json` `postinstall` — add `lmdb` to the electron-rebuild invocation alongside the existing `node-pty`:
  ```json
  "postinstall": "electron-rebuild -f -w node-pty lmdb"
  ```
- `electron-builder.yml` — confirm `asarUnpack` already includes `**/*.node`; remove the sql-wasm.wasm entry from `extraResources` if present.
- `packages/main/src/*` — remove any code that sets `MAGENTA_RESOURCES_PATH` for sql.js (the daemon no longer needs it).

**Verification:**

- `rm -rf node_modules dist release && pnpm install`
- `pnpm exec electron-rebuild -f -w node-pty lmdb`
- `pnpm dist:<platform>` and launch the packaged app. Confirm daemon logs show LMDB open path, no WASM errors.

---

### Phase 4 — Legacy SQLite cleanup

**Delete files:**

- `packages/daemon/src/db/SqliteCompat.ts`
- `packages/daemon/src/db/DatabaseService.ts`
- `packages/daemon/src/db/MigrationRunner.ts`
- `packages/daemon/src/db/migrations/` (entire directory — 16 files)
- `packages/daemon/src/types/sql.js.d.ts`
- `packages/daemon/src/services/RepoRepository.ts`
- `packages/daemon/src/services/SpecRepository.ts`
- `packages/daemon/src/services/SyncedSessionRepository.ts`
- `packages/daemon/src/services/WorktreeRepository.ts`

**Rename** the Lmdb-prefixed files back to their plain names (drop the `Lmdb` prefix) so the rest of the codebase doesn't carry a legacy naming artefact:

- `LmdbDatabaseService.ts` → `DatabaseService.ts`
- `LmdbStore.ts` → keep as `LmdbStore.ts` (implementation detail is fine to name)
- `LmdbMigrationRunner.ts` → `CacheSchemaManager.ts` (rename reflects new purpose)
- `LmdbRepoRepository.ts` → `RepoRepository.ts`
- `LmdbSpecRepository.ts` → `SpecRepository.ts`
- `LmdbSyncedSessionRepository.ts` → `SyncedSessionRepository.ts`
- `LmdbWorktreeRepository.ts` → `WorktreeRepository.ts`

Update all import sites accordingly. This rename step is what makes the codebase look like LMDB was always the design, instead of leaving a `Lmdb*` naming scar.

**Remove dependencies:**

- `packages/daemon/package.json` — `sql.js`
- Root `package.json` — `@types/sql.js`
- Run `pnpm install` to regenerate lockfile.

**Remove scripts / configs:**

- No `drizzle.config.ts` exists (confirmed). No `drizzle-kit` scripts in any `package.json` (confirmed). Nothing to delete beyond files listed.

**Update documentation:**

- `CLAUDE.md` — change the tech-stack line from `SQLite (sql.js WASM) + Drizzle ORM` to `LMDB (embedded, memory-mapped key-value store)`. Remove the "Boolean columns stored as `true`/`false` in SQLite" anti-pattern row — no longer applicable (msgpack preserves booleans natively).
- `docs/architecture/architecture-overview.md` — update the persistence section.

**Verification after deletion:**

```bash
# Zero hits expected for each:
grep -r "sql\.js\|SqliteCompat\|sql-wasm" packages --include="*.ts" --include="*.mjs" --include="*.json"
grep -r "from '\./MigrationRunner'" packages --include="*.ts"
ls packages/daemon/src/db/migrations 2>/dev/null  # should fail: no such directory
```

---

### Phase 5 — Final verification

- `pnpm typecheck` — zero errors.
- `pnpm test` — full suite green.
- Grep sweeps from Phase 4 produce no hits.
- `pnpm dist:<platform>` — packaged app launches and passes the Phase 2 smoke test.
- Delete `~/.magenta/magenta.db` (legacy SQLite), launch app, confirm LMDB is created fresh and data rehydrates from background sync.

---

## 5. Risk register

| # | Risk                                                        | Likelihood | Impact                    | Mitigation                                                                                                  |
| - | ----------------------------------------------------------- | ---------- | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1 | `lmdb` native module fails to build for Electron ABI        | Med        | Daemon won't start        | `electron-rebuild -w lmdb` in postinstall; test on macOS arm64 + x64, Windows x64, Linux x64 in CI          |
| 2 | Corruption on hard crash                                    | Low        | Cache loss (recoverable)  | LMDB copy-on-write + fsync; add `--reset-cache` CLI flag; detect-and-wipe on open failure                   |
| 3 | First-boot empty cache before background jobs run           | High       | Brief empty-list UI       | Already the status quo with SQLite auto-save; accepted behaviour for cache layer                            |
| 4 | Prefix-scan slower than SQL index                            | Neg.       | —                         | Dataset is small (≤10k rows); LMDB B-tree range is sub-ms                                                   |
| 5 | Msgpack encoding mismatch with existing mapper output       | Low        | Round-trip bugs           | Integration tests per repository; fall back to JSON encoding per-sub-db if needed                           |
| 6 | Renames in Phase 4 break uncommitted branches               | Med        | Merge conflicts           | Hold the rename to a single commit; announce before merging                                                 |

---

## 6. Rollback strategy

Because the cache is rebuildable, rollback is a code-only revert:

- Phases 1–3 leave SQLite code in place — `git revert` the daemon-ipc-worker change and SQLite is live again.
- After Phase 4, rollback requires restoring deleted files from git history. Keep the Phase 4 commit separate so revert is a single commit.
- No user data migration means no user-facing rollback path is required.

---

## 7. Definition of done

- [ ] All six task IDs in the task list marked completed.
- [ ] `grep` sweeps in §Phase 5 produce zero hits.
- [ ] `pnpm typecheck && pnpm test && pnpm dist:<host-platform>` all green.
- [ ] Packaged app smoke test: add repo → see specs → restart → cache warm on first paint.
- [ ] `CLAUDE.md` tech-stack line updated.
- [ ] `docs/architecture/architecture-overview.md` persistence section updated.

---

## 8. Handover notes for the code-mode session

- Start at **Phase 1**. Do not skip ahead — the later phases depend on `LmdbStore` and `LmdbDatabaseService` being in place and tested.
- Keep each phase as its own commit (or PR) so reviewing is tractable.
- The existing `*Repository.ts` files and their tests are the reference implementations for gateway behaviour. Read them alongside the new `Lmdb*Repository.ts` before writing the new tests — the semantics must match.
- `msgpack` encoding: prefer `env.openDB({ name, encoding: 'msgpack' })`. Only switch to JSON encoding for a sub-db if a msgpack issue is observed in tests.
- Do NOT attempt to import data from the old SQLite file. Per §1, the cache is rebuildable and migration is not required.
- Do NOT leave `Lmdb*`-prefixed filenames in the final state. Phase 4 renames them.
