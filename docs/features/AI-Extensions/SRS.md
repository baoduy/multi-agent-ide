# AI Extensions — Software Requirements Specification

| Field              | Value                                          |
| ------------------ | ---------------------------------------------- |
| Feature            | AI Extensions Management                       |
| Document status    | Draft v1.0                                     |
| Owner              | Steven Hoang (steven.hoang@transwap.com)       |
| Target product     | Magenta IDE                                    |
| Target release     | TBD                                            |
| Related artifacts  | `./mockup.html` (interactive UI reference)     |
| Dependencies       | DockManager, ThemeProvider, IPC framework, SQLite cache |

---

## 1. Purpose and scope

### 1.1 Purpose
Define the functional and non-functional requirements for the **AI Extensions** feature inside Magenta IDE. AI Extensions is a centralized management surface for every AI-adjacent artifact the user can register with the IDE — custom agents, skills, instructions, prompts, hooks, MCP servers, and plugins — with a single UX pattern for discovering, enabling, editing, generating, and inspecting them.

### 1.2 Scope
In scope:
- A new top-level workbench area reachable from the ActivityBar.
- Seven extension categories (Agents, Skills, Instructions, Prompts, Hooks, MCP Servers, Plugins) each with consistent CRUD, enable/disable, search, generate, and import flows.
- Two scopes per category: **Workspace** (per-repo, stored on disk under `.magenta/`) and **Built-in** (ships with Magenta, read-only or reset-only).
- Integration with DockManager for the left-sidebar tree, center tabbed grid, right-sidebar inspector, and bottom-panel logs.
- IPC contract, daemon application service, data model, and UI state needed to support the above.

Out of scope for this document:
- A public marketplace or remote sync. A marketplace section is *surfaced* in the UI but deferred in implementation (see §17 Rollout).
- Authoring UX details for each category's domain-specific schema (YAML shape of an Agent vs. a Hook). Covered by per-category RFCs.
- Per-organization policy enforcement beyond the existing permission modes already implemented by the AI Terminal feature.

### 1.3 Target audience
Magenta IDE engineering team: UI, daemon, and shared-package authors. Also useful for design review and for future contributors writing a new extension category.

### 1.4 Related documents
- `packages/ui/src/renderer/components/dock/*` — existing DockManager implementation.
- `packages/shared/src/ipc.ts` — current IPC contract to be extended.
- `packages/daemon/src/` — layered architecture conventions (IPC → Application → Domain → Data).
- `packages/ui/src/renderer/styles/colours.css` — theme tokens to be extended.
- Existing AI Terminal feature, which provides the precedent for provider registry + permission modes.

---

## 2. Glossary

| Term | Definition |
| ---- | ---------- |
| Extension | Any user- or system-registered AI artifact — Agent, Skill, Instruction, Prompt, Hook, MCP Server, or Plugin. |
| Category | One of the seven extension types. Mutually exclusive. |
| Scope | Where an extension lives: `workspace` (on disk under `.magenta/`) or `builtin` (shipped with Magenta). |
| Registry | The in-memory index the daemon builds from disk + SQLite cache. |
| Source of truth | The YAML/JSON/MD file on disk for workspace extensions, or the compiled resource for built-in extensions. SQLite is a derived cache only. |
| View | A DockManager view registered via `ViewRegistry`. Rendered as accordion section in a sidebar, or as a tab in center/bottom regions. |
| Inspector | The right-sidebar view that shows the details of the currently selected extension. |
| Generate | An AI-assisted wizard that produces a new extension from a natural-language description. |
| Status | One of `pending` (blue), `review` (yellow), `approved` (green). Mirrors Magenta's unified workflow palette. |

---

## 3. Motivation and goals

### 3.1 Motivation
Magenta already exposes multiple forms of AI extensibility across separate parts of the IDE:
- Agents live inside the AI Terminal provider registry.
- Skills are file-based and loaded implicitly.
- Hooks, prompts, instructions, and MCP servers exist in separate config surfaces.

There is no single place for a user to see *everything the AI can do*, toggle it, or author a new one. This creates three problems:
1. **Discoverability** — users don't know what is installed or enabled.
2. **Consistency** — each category has its own authoring UX.
3. **Debuggability** — when an AI behaves unexpectedly, there is no single registry view that confirms what was loaded.

### 3.2 Goals
G1. Give every extension category a consistent list/search/toggle/inspect experience.
G2. Make it obvious which extensions are enabled in the current workspace vs. built-in.
G3. Let the user generate a new extension in any category through an AI-assisted wizard.
G4. Persist enablement per workspace while keeping the source of truth on disk (rebuildable cache).
G5. Reuse the DockManager layout so the feature looks and feels native to Magenta.
G6. Emit lifecycle logs to the bottom panel so issues are diagnosable without leaving the app.

### 3.3 Non-goals
N1. Cloud sync of extensions across machines.
N2. Multi-user collaboration on the same extension.
N3. Sandboxing of extension code beyond the permission modes already in place.

---

## 4. Personas and key user stories

**Persona P1 — Full-stack developer (primary, Steven).** Builds Magenta itself and wants a fast way to inspect and toggle the growing list of extensions without editing YAML by hand.

**Persona P2 — Downstream user.** Opens a fresh repo that contains `.magenta/` with pre-configured extensions. Wants to see what will run and optionally turn things off before trusting them.

**Persona P3 — Power user.** Authors custom agents and hooks routinely. Wants to duplicate, tweak, and test quickly.

| ID | Story |
| -- | ----- |
| US-1 | As P1, I click the AI Extensions icon in the ActivityBar and immediately see every category with a count of installed extensions. |
| US-2 | As P2, I see a clear visual distinction between Workspace extensions (from this repo) and Built-in extensions (shipped with Magenta). |
| US-3 | As P3, I search "commit" and find `speckit.git.commit` across every category. |
| US-4 | As P1, I toggle an extension off without opening a file; the change is persisted and the daemon reloads. |
| US-5 | As P3, I click *Generate Agent* and describe what I want in natural language; a draft YAML is produced, opened for review, and saved on approval. |
| US-6 | As P1, I select an extension and see its source file path, permission mode, tools list, and a YAML preview in the Inspector. |
| US-7 | As P2, when an extension fails to load, I see the error in the Extension Logs bottom-panel tab. |
| US-8 | As P1, I switch the IDE theme and the AI Extensions surface flips with it — no hardcoded colours. |

---

## 5. Functional requirements

Requirement IDs are stable: do not renumber. Add new FRs with the next free integer.

### 5.1 Categories
- **FR-1** The system shall support seven extension categories: `agents`, `skills`, `instructions`, `prompts`, `hooks`, `mcp`, `plugins`.
- **FR-2** Each category shall display an accurate count of items in its scope (workspace + built-in).
- **FR-3** Each category shall expose, at minimum: list, search, open-inspector, toggle-enable, generate, import, delete (workspace only), duplicate (workspace only).

### 5.2 Scope and source of truth
- **FR-4** Each extension shall have exactly one scope: `workspace` or `builtin`.
- **FR-5** Workspace extensions shall be read from files under `.magenta/extensions/` (see §10). These files are the source of truth; SQLite is a cache and must be reconstructible by scanning disk.
- **FR-6** Built-in extensions shall be loaded from compiled resources inside the Magenta install. They are read-only; the user may only enable/disable them.
- **FR-7** Enablement (on/off) is user state and shall persist per workspace. For built-in extensions, enablement persists in the local config under the workspace scope, not globally.

### 5.3 Left sidebar — category tree
- **FR-8** The left sidebar shall render one accordion section per category using `AccordionSection`, sorted alphabetically within each section by name.
- **FR-9** Each row shall show: extension name, a small status dot (pending/review/approved), and an active highlight when selected.
- **FR-10** Clicking a category header shall (a) expand the section and (b) open or focus its center tab.
- **FR-11** Clicking a row shall select the extension, open its center tab, and populate the right-sidebar Inspector.

### 5.4 Center — tabbed grid
- **FR-12** Each category shall open as its own tab in the center `TabView`. Multiple tabs may be open simultaneously.
- **FR-13** Each tab shall display extensions as cards grouped by sub-section (`Workspace`, `Built-in`, optionally `Installed`/`Marketplace` for plugins).
- **FR-14** Each card shall show: icon, name (monospace), 1–2 line description, status tag (pending/review/approved), optional `Built-in` tag, and an enable toggle.
- **FR-15** The search input shall filter cards within the active tab by name and description (case-insensitive). Debounce ≥ 120ms.
- **FR-16** A split "Generate" primary button shall (a) open the generate wizard for the active category and (b) offer a dropdown caret for alternative authoring modes (from-scratch, duplicate, import-from-URL).
- **FR-17** An `Import` secondary button shall accept files or a folder containing extensions and merge them into the workspace scope.

### 5.5 Right sidebar — Inspector
- **FR-18** When no extension is selected, the Inspector shall show a hint and keyboard tips.
- **FR-19** When an extension is selected, the Inspector shall show: name, description, type, scope, status, enabled, tools list (when applicable), source path (workspace only), and a YAML/JSON preview.
- **FR-20** The Inspector shall expose actions: Enable/Disable (toggle), Edit (open source file), Duplicate (workspace), Open file (reveal in OS file manager).

### 5.6 Bottom panel — logs
- **FR-21** The bottom panel shall include an `Extension Logs` tab alongside existing Terminal/Problems/Output tabs.
- **FR-22** Extension Logs shall stream events from the daemon over the IPC push channel: load, enable, disable, validation errors, and generate completions.
- **FR-23** The tab title shall show a count badge when there are ≥ 1 problems since last view.

### 5.7 Theme, colour, accessibility
- **FR-24** All surfaces shall follow `ThemeProvider` — light, dark, and system — via CSS variables. No hex literals in components (see `feedback_hardcoded_colors.md`).
- **FR-25** Status indicators shall use the unified palette: Pending = Blue, Review = Yellow, Approved = Green. No Eye icon on hover.
- **FR-26** Every interactive element shall be reachable by keyboard and have a visible focus ring. Arrow keys navigate the tree and grid; Enter opens; Space toggles enable.
- **FR-27** The Cmd/Ctrl+K palette shall include "Go to Extension…" listing all extensions across categories.

### 5.8 Generate wizard
- **FR-28** The wizard shall accept: a natural-language description, a category-specific template choice, and optional tools/permissions.
- **FR-29** On submit, the wizard shall call the AI provider to produce draft content, preview it in the Inspector, and save only on user confirmation.
- **FR-30** Generated content must pass category validation before being persisted (see §5.9). If validation fails, the wizard shall show errors inline and let the user iterate.

### 5.9 Validation and error handling
- **FR-31** Each category shall define a Zod schema in `packages/shared`. The daemon shall validate before persisting.
- **FR-32** Validation errors shall be surfaced both inline (Inspector or wizard) and as a bottom-panel log line with a severity tag.
- **FR-33** Daemon handlers shall use the existing `safeHandle` pattern with `AppError` codes `EXT_NOT_FOUND`, `EXT_VALIDATION_FAILED`, `EXT_IO_ERROR`, `EXT_CONFLICT`, `EXT_PERMISSION_DENIED`.

### 5.10 Permissions
- **FR-34** Agents and Hooks shall declare the tools they may invoke. The system shall honour the existing six permission modes (see AI Terminal feature) and show the mode in the Inspector.
- **FR-35** Enabling an extension that requires tools the workspace does not have shall surface a warning with a one-click *Install required tools* flow (non-destructive — no auto-install).

---

## 6. Non-functional requirements

- **NFR-1 Performance.** Listing a category with up to 500 items shall render in under 100ms after data is in-memory. Cold load from disk+DB shall complete in under 750ms for a typical workspace (≤200 extensions total).
- **NFR-2 Rerender prevention.** All list item components shall be `React.memo`-wrapped; event handlers shall be stable (`useCallback`); derived lists shall be memoised (`useMemo`). Writes to stores that do not change values shall be guarded (see `feedback_rerender_prevention.md`).
- **NFR-3 Rebuildable cache.** SQLite data for this feature must be fully rebuildable by re-scanning disk. Deleting `magenta.db` must not lose any workspace extension (it may lose only enablement state — acceptable).
- **NFR-4 Theme neutrality.** The feature shall look correct in light and dark modes out of the box. Every colour used shall exist as a token in `colours.css` with both `:root` and `.dark` values.
- **NFR-5 Telemetry.** Every enable/disable/generate/import action shall emit a structured log line with `{ ts, category, action, name, result }`.
- **NFR-6 Backwards compatibility.** Existing YAML schemas used by the AI Terminal provider registry and by Skills shall continue to work with no migration required. The new surface is a reader/authoring layer on top.
- **NFR-7 Internationalisation readiness.** User-visible strings shall be routed through the existing i18n string registry (even if only `en` is currently defined).
- **NFR-8 Accessibility.** Meet WCAG 2.1 AA for colour contrast on both themes. Status colours must be distinguishable by shape (dot + tag label) not colour alone.

---

## 7. UI/UX specification

### 7.1 Layout
The feature lives inside the existing DockManager shell. The composition is:

```
┌────────────────────────────────────────────────────────────────┐
│ TitleBar                                                       │
├──┬──────────────┬─────────────────────────────────┬───────────┤
│  │              │ TabBar                          │           │
│  │              ├─────────────────────────────────┤           │
│A │ Left Sidebar │ Toolbar (search, Generate, Imp) │ Right     │
│ct│ (Accordion)  ├─────────────────────────────────┤ Sidebar   │
│iv│              │                                 │(Inspector)│
│  │ ⌄ Agents     │ Editor area                     │           │
│B │ ⌄ Skills     │ - Section: Workspace            │           │
│a │ ⌄ Prompts    │ - Grid of extension cards       │           │
│r │ ⌄ Hooks      │                                 │           │
│  │ ⌄ MCP        ├─────────────────────────────────┤           │
│  │ ⌄ Plugins    │ Bottom Panel (tabs)             │           │
│  │              │ - Extension Logs / Terminal ... │           │
├──┴──────────────┴─────────────────────────────────┴───────────┤
│ StatusBar                                                      │
└────────────────────────────────────────────────────────────────┘
```

Reference mockup: open [`./mockup.html`](./mockup.html). Use the Light/Dark toggle in the title bar to verify both themes.

### 7.2 Components to register with DockManager
| ViewDescriptor ID                | Container                | Notes |
| -------------------------------- | ------------------------ | ----- |
| `ai-extensions.treeview`         | Left `SideContainer`     | Accordion with one section per category. |
| `ai-extensions.categoryView`     | Center `TabView`         | One instance per category, opened on demand. Supports multi-instance. |
| `ai-extensions.inspector`        | Right `SideContainer`    | Single accordion section `Inspector`. |
| `ai-extensions.logs`             | Bottom `PanelContainer`  | Tab entry `Extension Logs`. |

Activity bar entry: add `ai-extensions` to `ActivityBarGroup` with a plug icon and a badge dot when updates are available.

### 7.3 Interaction flows

**Flow 1 — Browse and toggle.** Click ActivityBar → plug icon. Left sidebar opens with `Agents` expanded by default. Click a row to select; center tab opens; Inspector populates. Click the card toggle or the Inspector `Enable/Disable` to flip state. Status bar updates the "N enabled" counter. Daemon reloads the registry and emits a log line.

**Flow 2 — Search.** Type in the toolbar search. Cards filter live (debounced). Section headers with zero hits collapse automatically. Empty state shown if no hits.

**Flow 3 — Generate.** Click `Generate Agent` (label adapts to active category). Wizard opens as a modal over the editor area. User types a description, optionally picks a template. Draft is generated via the AI provider; preview renders in the Inspector. On *Save*, file is written to `.magenta/extensions/<category>/<slug>.yaml` and registry is refreshed.

**Flow 4 — Import.** Click `Import`. File picker accepts `.yaml`, `.md`, `.json`, or a folder. Daemon validates and writes into the workspace directory, skipping conflicts (with a confirmation dialog listing them).

**Flow 5 — Inspect error.** If a load fails, a toast and a bottom-panel log line appear; the problematic card shows status `review` (yellow) with a warning badge. Clicking the card shows the parsed error in the Inspector along with a `Fix in editor` shortcut.

### 7.4 Visual tokens
Extend `colours.css` with (at minimum):
```
--ext-icon-agent-bg     / --ext-icon-agent-fg
--ext-icon-skill-bg     / --ext-icon-skill-fg
--ext-icon-hook-bg      / --ext-icon-hook-fg
--ext-icon-prompt-bg    / --ext-icon-prompt-fg
--ext-icon-mcp-bg       / --ext-icon-mcp-fg
--ext-icon-plugin-bg    / --ext-icon-plugin-fg
--ext-card-border
--ext-card-border-selected
--ext-tag-builtin-bg    / --ext-tag-builtin-fg
```
All other colours (status, accent, backgrounds) reuse existing tokens.

---

## 8. Architecture alignment

### 8.1 Package responsibilities
- **`packages/shared`** — Zod schemas for each category, discriminated union request/response types, constants (category list, status enum), error codes.
- **`packages/daemon`** — `ExtensionApplicationService` coordinates domain+infra. `ExtensionLoader` scans disk and builds the registry. `ExtensionRepository` backs the SQLite cache. `ExtensionValidator` domain object uses the Zod schemas.
- **`packages/main`** — No new code beyond routing `magenta:ipc` traffic. Existing bridge is sufficient.
- **`packages/ui`** — `extensionStore` (Zustand), four new view components, four `ViewDescriptor` registrations, new accordion icons.

### 8.2 Cross-store operations
Use `SessionCoordinator` for operations that touch multiple stores. Example: enabling an agent that is referenced by an open AI Terminal session must refresh the terminal store as well. Stores must not import each other.

### 8.3 The 5-file IPC checklist
Every new IPC must be threaded through:
1. `packages/shared/src/ipc.ts` — request/response types.
2. `packages/daemon/src/ipc/handlers/extensions.ts` — `safeHandle` wrapper.
3. `packages/daemon/src/ipc/registerHandlers.ts` — registration.
4. `packages/shared/src/ipc.ts` — `ResponseForRequest<T>` mapping.
5. `packages/ui/src/renderer/stores/extensionStore.ts` — `sendOrThrow()` call site.

---

## 9. Data model

### 9.1 Source of truth — on disk
Workspace extensions are flat files under `.magenta/extensions/`. See §10 for layout. The daemon scans this tree on startup and on filesystem change events.

### 9.2 SQLite cache — new tables
Migration `0013_extensions.sql` adds:

```sql
CREATE TABLE extensions (
  id             TEXT PRIMARY KEY,            -- "{category}:{name}" (stable composite)
  category       TEXT NOT NULL,                -- agents|skills|instructions|prompts|hooks|mcp|plugins
  name           TEXT NOT NULL,
  scope          TEXT NOT NULL CHECK (scope IN ('workspace','builtin')),
  enabled        INTEGER NOT NULL DEFAULT 1,
  status         TEXT NOT NULL DEFAULT 'pending', -- pending|review|approved
  source_path    TEXT,                         -- NULL for builtin
  description    TEXT,
  content_hash   TEXT,                         -- for dirty-detection
  version        TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_extensions_cat_name ON extensions(category, name);

CREATE TABLE extension_tools (
  extension_id   TEXT NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
  tool_name      TEXT NOT NULL,
  PRIMARY KEY (extension_id, tool_name)
);

CREATE TABLE extension_logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  extension_id   TEXT REFERENCES extensions(id) ON DELETE SET NULL,
  level          TEXT NOT NULL,                -- info|ok|warn|error
  message        TEXT NOT NULL,
  ts             INTEGER NOT NULL
);

CREATE INDEX idx_extension_logs_ts ON extension_logs(ts DESC);
```

All columns in this cache are derivable from disk + user actions. Deleting `magenta.db` loses only the `enabled` column and `extension_logs`; enablement should additionally be mirrored to `~/.magenta/config.json` under a `workspaces.<path>.extensions` key for durability.

### 9.3 Configuration file
`~/.magenta/config.json` gains:
```jsonc
{
  "workspaces": {
    "/Users/steven/repos/magenta-ide": {
      "extensions": {
        "agents:arch.review": { "enabled": true, "status": "approved" },
        "skills:docx":         { "enabled": true, "status": "approved" }
      }
    }
  }
}
```

---

## 10. Filesystem layout

Workspace-scope source files:

```
.magenta/
└── extensions/
    ├── agents/
    │   ├── arch.review.yaml
    │   └── speckit.git.commit.yaml
    ├── skills/
    │   └── docx/
    │       └── SKILL.md
    ├── prompts/
    │   └── review-pr.md
    ├── hooks/
    │   └── on-save.lint.yaml
    ├── instructions/
    │   └── coding-style.md
    ├── mcp/
    │   └── servers.json
    └── plugins/
        └── installed.json
```

File naming rules:
- Extension name is derived from the filename stem (no extension).
- Names must match `^[a-z0-9][a-z0-9._-]*$`. Validation enforced on save.
- Two extensions in the same category must not share a name.

---

## 11. IPC contract

Add the following to the shared IPC union. All types are illustrative; final names should follow the repo convention.

### 11.1 Requests (renderer → daemon)

| Request                  | Payload                                                 | Response                         |
| ------------------------ | ------------------------------------------------------- | -------------------------------- |
| `extensions.list`        | `{ category?: Category; scope?: Scope; query?: string }` | `{ items: Extension[] }`         |
| `extensions.get`         | `{ id: string }`                                        | `{ item: Extension; preview: string }` |
| `extensions.toggle`      | `{ id: string; enabled: boolean }`                      | `{ item: Extension }`            |
| `extensions.create`      | `{ category: Category; draft: CreateDraft }`            | `{ item: Extension }`            |
| `extensions.update`      | `{ id: string; patch: Partial<Extension> }`             | `{ item: Extension }`            |
| `extensions.delete`      | `{ id: string }`                                        | `{ ok: true }`                   |
| `extensions.import`      | `{ paths: string[]; overwrite?: boolean }`              | `{ imported: Extension[]; skipped: string[] }` |
| `extensions.generate`    | `{ category: Category; prompt: string; template?: string }` | `{ draft: CreateDraft; warnings?: string[] }` |
| `extensions.validate`    | `{ category: Category; content: string }`               | `{ valid: boolean; errors?: ValidationError[] }` |
| `extensions.reveal`      | `{ id: string }`                                        | `{ ok: true }` (opens in OS file manager) |

### 11.2 Push events (daemon → renderer)

| Event                    | Payload                             | Notes |
| ------------------------ | ----------------------------------- | ----- |
| `extensions.updated`     | `{ item: Extension }`               | Fired after toggle/update/create/delete. |
| `extensions.reloaded`    | `{ counts: Record<Category, number> }` | Fired after a full registry rebuild. |
| `extensions.log`         | `{ level; message; extensionId?; ts }` | Streamed to bottom panel. |

### 11.3 Shared types

```ts
type Category = 'agents' | 'skills' | 'instructions' | 'prompts' | 'hooks' | 'mcp' | 'plugins';
type Scope = 'workspace' | 'builtin';
type Status = 'pending' | 'review' | 'approved';

interface Extension {
  id: string;              // "{category}:{name}"
  category: Category;
  name: string;
  scope: Scope;
  enabled: boolean;
  status: Status;
  description: string;
  sourcePath?: string;     // workspace only
  version?: string;
  tools?: string[];        // agents, hooks
  builtin?: boolean;
  updatedAt: number;
}
```

---

## 12. Daemon services

### 12.1 `ExtensionApplicationService`
Methods map 1:1 to the IPC requests. Responsible for orchestration, transactions, validation, and emitting push events.

### 12.2 `ExtensionLoader` (infrastructure)
Scans `.magenta/extensions/` and Magenta's built-in resources. Produces in-memory `Extension` records. Watches the directory for changes via `chokidar` or the existing `FileSystemGateway`. Throttled to avoid rebuild storms (debounce 200ms).

### 12.3 `ExtensionRepository` (data)
CRUD against the SQLite tables. All mutating methods take the pre-validated domain object.

### 12.4 `ExtensionValidator` (domain)
Thin adapter over the Zod schemas in shared. Converts Zod errors to `ValidationError[]` with field paths.

### 12.5 Dependency injection
Register in `DaemonContainer`:
```
container.extensionApp = new ExtensionApplicationService(
  container.extensionRepo,
  container.extensionLoader,
  container.extensionValidator,
  container.pushChannel
);
```

---

## 13. UI state

### 13.1 `extensionStore` (Zustand)
```ts
interface ExtensionStoreState {
  byId: Record<string, Extension>;
  order: Record<Category, string[]>;
  selectedId?: string;
  openTabs: Category[];
  activeTab?: Category;
  query: string;
  logs: ExtensionLogLine[];

  // actions (all wrap sendOrThrow / createAsyncAction)
  list(): Promise<void>;
  toggle(id: string, enabled: boolean): Promise<void>;
  select(id: string | undefined): void;
  openTab(category: Category): void;
  closeTab(category: Category): void;
  setQuery(q: string): void;
  generate(category: Category, prompt: string): Promise<Extension>;
}
```

Store integration notes:
- Subscribe to `extensions.updated` and `extensions.reloaded` to reconcile state.
- Do not write duplicate values — guard with a shallow-equal check (per `feedback_rerender_prevention.md`).
- Selector hooks (`useExtensionList`, `useExtensionById`) must return stable references.

### 13.2 `layoutStore` additions
Persist `openTabs`, `activeTab`, and per-accordion collapsed state under a namespaced key `ai-extensions:*`.

---

## 14. Security and permissions

- **Tool whitelist.** Agents and hooks declare the tools they may use. If an extension is enabled but declares a tool not present in the current environment, surface a warning; do not silently drop the tool.
- **Script execution.** Extensions that embed shell scripts (hooks) must run through the existing safe-execution wrapper (6 permission modes from the AI Terminal feature). The default mode for a newly generated hook is `review`.
- **Write sandbox.** All writes from Generate and Import are confined to `.magenta/extensions/`. Absolute paths or paths escaping the workspace root are rejected with `EXT_PERMISSION_DENIED`.
- **Network.** The Generate wizard is the only code path in this feature that may perform outbound network calls (via the AI provider). All other flows are local.
- **Secrets.** MCP server definitions that contain env vars or tokens must be stored in the existing secret store, not in plain JSON.

---

## 15. Observability

- **Bottom-panel logs.** Streamed live; can be filtered by `level`.
- **Disk log.** Appended to `~/.magenta/logs/extensions.log` with rotation at 5MB.
- **Metrics.** Emit counters for `extensions.enabled.{category}`, `extensions.generate.success`, `extensions.generate.failure`. Use the existing metrics bus.
- **Error reporting.** Route `EXT_*` errors through the standard error reporter with the category as a tag.

---

## 16. Accessibility and keyboard

| Shortcut              | Action                                        |
| --------------------- | --------------------------------------------- |
| Cmd/Ctrl+Shift+X      | Focus the AI Extensions sidebar tree.         |
| Cmd/Ctrl+K            | Open command palette with Extensions section. |
| ↑ / ↓                 | Navigate the tree or grid.                    |
| Enter                 | Open the selected extension in the Inspector. |
| Space                 | Toggle the selected extension's enabled state.|
| Cmd/Ctrl+F            | Focus the toolbar search.                     |
| Cmd/Ctrl+W            | Close the active category tab.                |

Focus management: Inspector sets focus to its first action on open. Toggle actions must be announced to assistive tech (`aria-pressed`).

---

## 17. Rollout plan

Phased delivery, each phase independently shippable behind a feature flag `feature.aiExtensions`.

| Phase | Scope | Exit criteria |
| ----- | ----- | ------------- |
| **0**  | Feature flag + skeleton views registered. | ActivityBar icon opens empty sidebar/inspector. |
| **1**  | End-to-end for **Agents** (list, toggle, inspect, generate, import). | US-1, US-4, US-6 pass. |
| **2**  | Add **Skills** and **Prompts**. Extract shared card/list/inspector components. | Components reused across three categories with no duplication. |
| **3**  | Add **Hooks** and **Instructions**. Wire permission modes + validation errors. | Hook with invalid YAML surfaces a proper error row. |
| **4**  | Add **MCP Servers** (with secret handling) and **Plugins** (install + uninstall of local bundles). | MCP toggle restarts the server cleanly. |
| **5**  | Plugin **Marketplace** tab (browse remote index, install locally). Feature flag `feature.aiExtensions.marketplace`. | Fetches index, installs a sample plugin end-to-end. |

---

## 18. Acceptance criteria (summary)

A build is considered feature-complete for Phase 1 when all of the following hold:

1. ActivityBar shows an AI Extensions icon; clicking it routes to the new views.
2. Left sidebar lists Agents with the correct count, grouped by Workspace and Built-in.
3. Clicking an agent opens the category tab and populates the Inspector.
4. Toggling enabled persists across app restarts and survives deleting `magenta.db` (enablement stored in `config.json` as fallback).
5. Generating an agent writes a valid YAML file under `.magenta/extensions/agents/` and appears in the list immediately via the push channel.
6. Importing a YAML file merges it into the workspace, with conflict resolution UI.
7. All colours come from `colours.css` tokens; no hex literals in new components (verified by lint rule or code review).
8. Light/dark/system theme flips correctly; status dots and tags remain distinguishable on both.
9. Search filters the active category in under 120ms for 500 items.
10. No performance regressions in existing DockManager usage (tracked by the current benchmark harness).

---

## 19. Open questions

| # | Question | Owner |
| - | -------- | ----- |
| Q1 | Should enablement for Built-in extensions persist globally or per-workspace? Draft says per-workspace; verify with Steven. | Product |
| Q2 | Does Generate call the workspace's default AI provider, or is there a dedicated "authoring" provider? | Eng |
| Q3 | How does Plugin installation interact with Magenta updates — do installed plugins survive an IDE upgrade? | Eng |
| Q4 | What is the concurrency model when two renderer windows point at the same workspace and both toggle an extension? | Eng |
| Q5 | Do we need a "reset to defaults" action per category? (Not in FR list yet.) | Product |

---

## 20. Appendix A — Mockup

An interactive, self-contained HTML reference is bundled alongside this document at [`./mockup.html`](./mockup.html). The mockup supports:

- Light/dark theme toggle.
- Category switching via sidebar and tabs.
- Search filtering.
- Enable/disable toggles on each card.
- Inspector population on card or tree click.
- Bottom-panel log lines.

**Known differences between the mockup and the final implementation:**

- The mockup uses inline SVG strings; the real implementation should use shared icon components from `packages/ui/src/renderer/components/common/icons/`.
- The mockup's "Generate" button opens an `alert()` placeholder. The real wizard is defined in §5.8 and §12.
- The mockup's logs are static strings. Real logs stream over the IPC push channel (§11.2).
- The mockup inlines all colour values as CSS variables for portability. In the real app these must be imported from `colours.css`.

---

## 21. Appendix B — Change log

| Version | Date       | Author | Notes |
| ------- | ---------- | ------ | ----- |
| 1.0     | 2026-04-21 | Claude (assisting Steven) | Initial draft authored alongside the mockup. |
