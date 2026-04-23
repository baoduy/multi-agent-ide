# Feature Specification: AI Extensions Management

**Feature Branch**: `003-ai-extensions`
**Created**: 2026-04-21
**Updated**: 2026-04-21
**Status**: Draft
**Source**: `docs/features/AI-Extensions/SRS.md`, `docs/features/AI-Extensions/mockup.html`

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Browse and control all AI extensions from one place (Priority: P1)

As a developer working with Magenta IDE, I want a single surface where I can see every AI artifact registered in my workspace — agents, skills, prompts, hooks, instructions, MCP servers, and plugins — so that I always know what the AI can do and can confidently turn things on or off.

**Why this priority**: Discoverability and control are the core value proposition. Every other story depends on users being able to navigate the extension inventory.

**Independent Test**: Can be fully tested by opening the AI Extensions panel, verifying all installed extensions appear, and toggling one on/off — delivering a working read + control surface before any authoring tools exist.

**Acceptance Scenarios**:

1. **Given** the user opens Magenta IDE in any repository, **When** they click the AI Extensions icon in the activity bar, **Then** a sidebar opens showing all seven extension categories, each with an accurate count of installed extensions.
2. **Given** the sidebar is open, **When** the user clicks any extension row, **Then** a detail panel shows the extension's name, description, scope (user, workspace, or built-in), current status, and whether it is enabled.
3. **Given** an extension is currently enabled, **When** the user toggles it off, **Then** the change is persisted and survives an app restart without requiring any file editing.
4. **Given** the user's workspace contains extensions at both user scope and workspace scope, **When** the extension list loads, **Then** user-scope, workspace-scope, and built-in extensions are visually distinguished from one another.
5. **Given** an extension fails to load on startup, **When** the user views the extension list, **Then** the failed extension is clearly flagged and a diagnostic message is accessible without leaving the IDE.

---

### User Story 2 — See global extensions at top, workspace extensions at bottom, in every category (Priority: P1)

As a developer who has both global (user-level) and project-specific extensions, I want each category section in the sidebar to show my globally-registered extensions first and my workspace-specific extensions below, so I can immediately distinguish what applies everywhere from what is local to this project.

**Why this priority**: The global-top, local-bottom layout is the primary navigation model. Without it, users cannot tell at a glance what scope they are looking at and managing.

**Independent Test**: Can be tested by adding one user-scope agent and one workspace-scope agent in the same category, opening the sidebar, and verifying the user-scope entry appears in the "User / Global" subsection above the "Workspace" subsection.

**Acceptance Scenarios**:

1. **Given** a category has extensions at both user and workspace scope, **When** the sidebar accordion section is expanded, **Then** a "User (Global)" subsection appears at the top and a "Workspace (Local)" subsection appears below it; built-in extensions appear at the bottom if present.
2. **Given** the user scope has no extensions in a category, **When** the accordion section is expanded, **Then** the "User (Global)" subsection shows an empty state with a prompt to add a global extension, rather than being hidden.
3. **Given** the center grid tab is open for a category, **When** extensions are displayed, **Then** cards are grouped with the same top-to-bottom order: User (Global) → Workspace (Local) → Built-in, each group separated by a visible labelled divider.
4. **Given** the user selects the scope switcher at the top of the sidebar and chooses "User (Global)", **When** the view updates, **Then** only user-scope extensions are shown across all categories, with workspace-specific items hidden.
5. **Given** the scope switcher is set to "Workspace (Local)", **When** the view updates, **Then** only workspace-scope extensions are shown, with user-scope items hidden.

---

### User Story 3 — Configure settings for individual agents (Priority: P1)

As a developer using multiple agents with different configurations, I want to view and edit the settings for each agent — such as the AI model, system prompt override, allowed tools, and response parameters — so I can tune each agent's behaviour precisely without manually editing files.

**Why this priority**: Settings management is equally foundational to discoverability; an agent that cannot be configured is only half-managed.

**Independent Test**: Can be tested independently by selecting any agent in the Inspector, modifying a setting, saving, and verifying the change persists after an app restart.

**Acceptance Scenarios**:

1. **Given** the user selects an agent, **When** the Inspector opens, **Then** the Settings panel shows all configurable fields with their current effective values, and each field clearly indicates whether its value comes from workspace scope, user scope, or the built-in default.
2. **Given** a setting has a value defined at user scope but no workspace override, **When** the field is displayed, **Then** the inherited value is shown with a lock icon and "inherited from User" label; an "Override" button allows setting a workspace value.
3. **Given** the user clicks "Override" on an inherited field and enters a new value, **When** they save, **Then** the workspace-scope value takes effect immediately; the user-scope value remains unchanged and is shown as "User default: X" below the field.
4. **Given** a workspace-scope override exists, **When** the user clicks "Reset to inherited", **Then** the workspace value is removed and the field reverts to showing the inherited user or built-in value.
5. **Given** a required setting has no value at any scope, **When** the user tries to enable the agent, **Then** the missing fields are highlighted in the settings panel and the agent stays disabled until they are filled in.
6. **Given** the user enters an invalid value (e.g., a model name that does not match the allowed list), **When** they leave the field, **Then** an inline validation error appears and the Save button remains disabled.

---

### User Story 4 — Configure the Claude AI provider and reuse those settings for Copilot (Priority: P1)

As a developer who uses Claude as the primary AI provider and also uses GitHub Copilot, I want to configure Claude's model, authentication, and behaviour once and then apply the same settings to Copilot with minimal duplication, so I can manage all AI providers from one place.

**Why this priority**: Claude is the primary provider in this codebase and Copilot is the IDE integration layer. Having a shared configuration model prevents separate per-tool setup and makes switching or testing providers fast.

**Independent Test**: Can be tested by setting a model, temperature, and system prompt in the Claude provider panel, then applying those settings to a Copilot-linked agent and verifying it uses the same values.

**Acceptance Scenarios**:

1. **Given** the user opens the Agents category and selects any agent, **When** the Inspector's Settings panel opens, **Then** an "AI Provider" section shows the currently configured provider (Claude or Copilot), the active model, and connection status.
2. **Given** the user selects "Claude" as the provider for an agent, **When** the settings are shown, **Then** configurable fields include: model, API key (stored securely), system prompt override, temperature, maximum response length, and thinking mode toggle.
3. **Given** the user has Claude settings configured for one agent, **When** they create or configure a second agent using Copilot as provider, **Then** the system offers to copy over the compatible shared settings (system prompt, temperature, maximum response length) from the Claude configuration as a starting point.
4. **Given** a Claude model is configured at user scope, **When** the user opens a workspace-scope agent that has no explicit model set, **Then** the agent inherits the user-scope Claude model without any additional setup.
5. **Given** the user switches an agent's provider from Claude to Copilot, **When** the settings panel updates, **Then** Copilot-specific fields (GitHub token, Copilot model) are shown alongside the shared fields (system prompt, temperature) that carry over automatically.
6. **Given** an API key or token for a provider is saved, **When** it is displayed in the settings panel, **Then** the credential is masked and only a "Change" action is available; the raw value is never shown in plaintext.

---

### User Story 5 — Manage extensions and settings at user level (global) and repository level (Priority: P1)

As a developer who works across multiple repositories, I want to define extensions and agent settings once at a global user level and have them apply everywhere, while still being able to override individual settings per repository, so I don't have to repeat configuration for every project.

**Why this priority**: Without a user-level scope, every new repository starts from scratch. This is the core multi-repo workflow enabler.

**Independent Test**: Can be tested by adding an agent at user scope, opening two different repositories, and verifying the agent appears in both — then adding a workspace-scope override in one repo and verifying the other is unaffected.

**Acceptance Scenarios**:

1. **Given** the user creates or enables an extension at user scope, **When** they open any repository in Magenta IDE, **Then** that extension appears in the extension list for every repository without additional setup.
2. **Given** an extension exists at both user scope and workspace scope with the same name, **When** the extension list is viewed, **Then** a single merged entry is shown with a clear "Workspace override active" indicator.
3. **Given** a user-scope agent setting (e.g., model) exists, **When** the user opens a repository that has no workspace override for that setting, **Then** the user-scope value is active and labelled accordingly.
4. **Given** the user removes a workspace-scope override for an extension or setting, **When** the list refreshes, **Then** the user-scope version is restored as active with no further action needed.

---

### User Story 6 — Search across all extensions (Priority: P2)

As a power user managing a large number of extensions, I want to type a term and see all matching extensions across every category, so I can quickly find and manage what I need.

**Why this priority**: Critical for users with many extensions; prevents the feature from becoming unusable at scale.

**Independent Test**: Can be tested independently by entering a search term in the search bar and verifying results filter live across all visible extension cards.

**Acceptance Scenarios**:

1. **Given** extensions are loaded across multiple categories and scopes, **When** the user types a search term, **Then** only extensions whose name or description contains the term remain visible, with results updating as the user types.
2. **Given** a search returns no results, **When** the user views the panel, **Then** a clear empty-state message is shown rather than a blank panel.
3. **Given** a search is active, **When** the user clears the search field, **Then** all extensions reappear immediately.

---

### User Story 7 — Generate a new extension from a natural-language description (Priority: P2)

As a developer who routinely creates custom agents and hooks, I want to describe what I need in plain language and have the IDE produce a ready-to-use draft, so I can author extensions without writing YAML from scratch.

**Why this priority**: Significantly reduces the time to create new extensions and makes the feature valuable for authoring, not just management.

**Independent Test**: Can be tested by opening the Generate wizard for any category, entering a description, choosing a target scope, and verifying a draft file is created and appears in the correct scope section on confirmation.

**Acceptance Scenarios**:

1. **Given** the user clicks Generate in any category, **Then** a wizard opens prompting for a description, optional template selection, and the target scope (user or workspace).
2. **Given** the user submits a description, **When** the draft is generated, **Then** a preview is shown for review before anything is saved to disk.
3. **Given** the user approves the draft, **When** they confirm, **Then** the extension is saved to the chosen scope and appears in the correct scope subsection immediately.
4. **Given** the draft has validation errors, **Then** specific errors are shown inline so the user can correct them before saving.
5. **Given** the user closes the wizard without confirming, **Then** no file is written and no extension is added.

---

### User Story 8 — Import extensions from files (Priority: P3)

As a developer sharing or migrating extensions between repositories, I want to import extension files from disk into a chosen scope so I can reuse existing work without manual copy-paste.

**Independent Test**: Can be tested by selecting one or more extension files via the Import action, choosing a target scope, and verifying they appear in that scope's subsection.

**Acceptance Scenarios**:

1. **Given** the user clicks Import and selects valid extension files with a target scope, **Then** the extensions are added to the chosen scope and appear in the list.
2. **Given** an imported file conflicts with an existing name in the target scope, **Then** a conflict summary is shown and the user can skip or overwrite before any changes are written.
3. **Given** an imported file is invalid, **Then** it is rejected with a clear error and no other extensions are affected.

---

### User Story 9 — Diagnose extension load errors from a dedicated log view (Priority: P3)

As a developer investigating unexpected AI behaviour, I want to see a live log of every extension lifecycle event so I can diagnose problems without leaving the IDE.

**Independent Test**: Can be tested by corrupting an extension file and verifying the error appears in the Extension Logs panel without restarting the app.

**Acceptance Scenarios**:

1. **Given** the IDE is running, **When** any extension is loaded, enabled, disabled, or fails validation, **Then** a corresponding log entry appears in the Extension Logs panel, tagged with its scope.
2. **Given** there are unread error log entries, **Then** the bottom panel tab shows a count badge.
3. **Given** the user clicks on a failed extension, **Then** the specific error and a shortcut to open the source file are visible in the Inspector.

---

### Edge Cases

- What happens when an extension file on disk is deleted outside the IDE while it is enabled?
- How does the system handle two extensions in the same category with identical names at different scopes?
- What happens when a workspace-scope setting value conflicts with a type-incompatible user-scope setting value?
- What happens when the workspace has no `.magenta/extensions/` directory at all?
- How does toggling an agent that is actively in use by an open AI Terminal session behave?
- What happens when an extension file contains secrets (tokens, API keys) during import?
- How does the panel behave when opened in a repository with 500+ extensions across all scopes?
- What happens if the user-scope settings directory does not exist on first launch?
- What happens if the Claude API key is revoked while an agent session is active?
- What happens when the user has Claude settings at user scope and opens a repo where another developer has Copilot settings at workspace scope — which provider wins?

---

## UI Design

### Left sidebar layout

The AI Extensions feature is integrated into the existing left sidebar — it does not replace or hide the current file explorer (RepoTree). The sidebar is divided into two vertically-stacked regions:

```
┌─────────────────────────────────────┐
│  RepoTree (unchanged)               │  ← existing file explorer, unchanged
│    ▶ src/                           │
│    ▶ packages/                      │
│    ▶ docs/                          │
│    …                                │
├─────────────────────────────────────┤  ← resizable divider
│  AI Extensions                      │  ← new accordion below RepoTree
│                                     │
│  ▼ Agents                           │
│    ── User (Global) ──────────────  │  ← ~/.claude/ items first
│      ◆ arch.review          ● on   │
│      ◆ speckit              ● on   │
│    ── Workspace (Local) ─────────  │  ← .claude/ items second
│      ◆ project-reviewer    ● off  │
│    ── Built-in ──────────────────  │  ← read-only last
│      ◆ Ask                  ● on   │
│                                     │
│  ▶ Skills                           │
│  ▶ Prompts                          │
│  ▶ MCP Servers                      │
│  ▶ Hooks                            │
│  ▶ Instructions                     │
│  ▶ Plugins                          │
└─────────────────────────────────────┘
```

Within each accordion section, items are always grouped in the fixed top-to-bottom order: **User (Global) → Workspace (Local) → Built-in**. A labelled divider separates each group. Each item shows its name, an enabled toggle, and a status dot.

---

### File-editor model

All extension configuration is stored in ordinary files on disk — either **Markdown (`.md`)** or **JSON (`.json`)**. When the user clicks any extension item in the sidebar accordion, the IDE opens that file in the **existing code editor** (the same editor used for any other file in the RepoTree). There is no custom settings form, no inspector panel with individual field controls, and no approval button — the user edits the file directly and saves with the standard `Cmd/Ctrl+S` shortcut.

The sidebar accordion items are essentially a structured view into the actual files on disk, surfaced by category rather than by directory.

---

### Claude scope paths

For Claude (the primary AI provider), the IDE respects Claude Code's own directory conventions. No Magenta-specific directories are created for Claude configuration; the existing Claude directories are read directly:

| Scope | Directory / File | Contents | Writable |
|---|---|---|---|
| User (Global) | `~/.claude/` | User-level agent configs, instructions, settings | Yes |
| User (Global) settings | `~/.claude/settings.json` | Global Claude settings (model, permissions, etc.) | Yes |
| User (Global) instructions | `~/.claude/CLAUDE.md` | System-wide instructions injected into every session | Yes |
| Workspace (Local) | `.claude/` | Project-level agent configs, instructions, settings | Yes |
| Workspace (Local) settings | `.claude/settings.json` | Project Claude settings (overrides user settings) | Yes |
| Workspace (Local) instructions | `.claude/CLAUDE.md` | Project instructions injected into every session | Yes |
| Workspace personal | `.claude/settings.local.json` | Personal local overrides; git-ignored by convention | Yes |
| Built-in | Compiled into IDE | Default agent definitions | No |

Scope resolution order: `settings.local.json` → `.claude/settings.json` → `~/.claude/settings.json` → built-in defaults.

When the user clicks a Claude config item in the sidebar, the IDE opens the actual file (`CLAUDE.md`, `settings.json`, or `settings.local.json`) in the code editor at the correct path. The user edits the JSON or Markdown content and saves normally. The sidebar reflects the updated state without any additional confirmation step.

---

### Sidebar item metadata strip

Clicking an item opens its file in the editor. A compact metadata strip is shown at the top of the editor tab (not a separate panel) to provide context without interrupting editing:

```
  ◆ arch.review  │  Agent  │  User (Global) · ~/.claude/agents/arch-review.md  │  ● approved  │  [Enable] [Reveal in RepoTree]
```

This strip is read-only and dismissible. It does not contain editable form fields. The enable/disable toggle in the strip is the only action that does not require opening the file — it writes the `enabled` flag directly to the relevant scope's settings file.

---

### Scope switcher

A compact scope switcher dropdown sits at the top of the AI Extensions accordion. Selecting a scope filters all accordion sections to show only items from that scope:

- **All** (default) — User (Global) + Workspace (Local) + Built-in visible across all categories
- **User (Global)** — only `~/.claude/` (and equivalent for Copilot) items shown
- **Workspace (Local)** — only `.claude/` items shown

The switcher does not filter the RepoTree above it.

---

## Clarifications

### Session 2026-04-22

- Q: Where should the AI Extensions UI live in the left sidebar? → A: Below the existing RepoTree as an accordion; the RepoTree is unchanged and the two regions share the left sidebar with a resizable divider.
- Q: How should extension configuration be edited — custom form or file editor? → A: File-editor model: clicking any extension item opens its source file (MD or JSON) in the existing IDE code editor. No custom settings form is shown. No approval button. A read-only metadata strip appears at the top of the editor tab.
- Q: What are the canonical scope paths for Claude configuration? → A: `~/.claude/` for user (global) scope, `.claude/` for workspace (project) scope, `.claude/settings.local.json` for local personal overrides (git-ignored by convention). The IDE reads and writes these Claude Code directories directly; no Magenta-specific equivalent is created for Claude.

---



### Functional Requirements

- **FR-001**: The system MUST display all seven extension categories in the AI Extensions accordion in the existing left sidebar, below the RepoTree. Each category MUST show an accurate count of installed extensions across all active scopes.
- **FR-002**: Within each category accordion section, extensions MUST be grouped in a fixed top-to-bottom order: User (Global) first, Workspace (Local) second, Built-in last. Each group MUST have a visible labelled divider.
- **FR-003**: Each extension MUST be classified with exactly one storage scope — `user` (global), `workspace` (current repository), or `builtin` (read-only, shipped with IDE) — and the scope MUST be visually clear at all times in both the accordion and the editor tab metadata strip.
- **FR-004**: Users MUST be able to enable or disable any extension from the sidebar accordion without opening the file; the enabled state MUST be written to the relevant scope's settings file and MUST persist across app restarts.
- **FR-005**: Users MUST be able to search for extensions by name or description within the accordion, with results filtering as they type.
- **FR-006**: The AI Extensions accordion MUST include a scope switcher dropdown that filters all sections to show only User (Global), only Workspace (Local), or All scopes simultaneously.
- **FR-007**: Clicking an extension item in the accordion MUST open its source file (Markdown or JSON) in the existing IDE code editor. The editor opens at the exact file path for the selected scope. No custom settings form is shown; editing is done directly in the file.
- **FR-008**: When an extension file is opened in the editor, a compact read-only metadata strip MUST appear at the top of the editor tab showing: extension name, type, scope, file path, status, and an enable/disable toggle. This strip does NOT contain editable form fields.
- **FR-009**: The scope resolution order for Claude settings MUST be: `.claude/settings.local.json` → `.claude/settings.json` → `~/.claude/settings.json` → built-in defaults. The IDE MUST follow this order when determining the effective value of any Claude configuration key.
- **FR-010**: Claude user-scope configuration MUST be read from and written to `~/.claude/` (settings as `settings.json`, instructions as `CLAUDE.md`). The IDE MUST NOT create any alternative global settings directory for Claude.
- **FR-011**: Claude workspace-scope configuration MUST be read from and written to `.claude/` at the repository root (settings as `settings.json`, instructions as `CLAUDE.md`, personal local overrides as `settings.local.json`).
- **FR-012**: `settings.local.json` MUST be treated as a personal local override file. When a workspace is opened for the first time and `.claude/settings.local.json` does not exist, a `.gitignore` entry for it MUST be suggested (but not automatically added without user confirmation).
- **FR-013**: All provider credentials (API keys, tokens) found in settings files MUST be masked in the editor's metadata strip. The raw file content shown in the code editor is outside the masking scope — the user is responsible for not committing secrets.
- **FR-014**: The system MUST support Claude and GitHub Copilot as AI providers. Shared configuration fields (system prompt, temperature, maximum response length, permission mode, allowed tools) MUST be expressed in a common schema that both providers can read. Provider-specific fields are defined per provider and stored only when that provider is configured.
- **FR-015**: When the user clicks a Claude config entry (e.g., `~/.claude/CLAUDE.md` or `.claude/settings.json`), the existing code editor MUST open the file with syntax highlighting appropriate to its type (Markdown or JSON). There is no separate approval step.
- **FR-016**: The accordion MUST surface the following Claude config files as named, categorised entries — not as raw file paths:
  - Under **User (Global)**: `~/.claude/CLAUDE.md` (labelled "User Instructions"), `~/.claude/settings.json` (labelled "User Settings"), and any agent definition files in `~/.claude/`
  - Under **Workspace (Local)**: `.claude/CLAUDE.md` (labelled "Project Instructions"), `.claude/settings.json` (labelled "Project Settings"), `.claude/settings.local.json` (labelled "Local Overrides"), and any agent definition files in `.claude/`
- **FR-017**: Skills, Prompts, Hooks, Instructions, and Plugin extension files MUST also follow the file-editor model: clicking opens the file in the existing editor; no custom form is shown.
- **FR-018**: Plugin extensions MUST display the list of included skills and allow the user to toggle individual skills on or off within the plugin bundle. Marketplace plugins MUST show installed vs. latest version and an update action.
- **FR-019**: Users MUST be able to generate a new extension in any category by providing a natural-language description; the wizard MUST ask for a target scope (user or workspace) before saving, and MUST save to the correct scope directory.
- **FR-020**: Generated and imported extensions MUST be validated against their category's schema before being persisted; the user MUST see specific errors if validation fails.
- **FR-021**: Users MUST be able to import extension files from disk into either user or workspace scope; conflicting names within the target scope MUST trigger a confirmation dialog before any changes are written.
- **FR-022**: User-scope extensions for Claude are stored at `~/.claude/`; user-scope extensions for other providers or generic extensions are stored at `~/.magenta/extensions/`. Both directories are created automatically if they do not exist.
- **FR-023**: When the same extension name exists at both user and workspace scope, the accordion MUST show a single merged entry with a "Workspace override active" indicator; clicking it opens the workspace-scope file.
- **FR-024**: The system MUST display a dedicated Extension Logs tab in the bottom panel streaming lifecycle events (load, enable, disable, file-save, validation errors, provider connection events) in real time, each event tagged with its scope and file path.
- **FR-025**: The log panel tab MUST show a count badge when unread error-level events exist since the panel was last viewed.
- **FR-026**: All interactive elements MUST be navigable by keyboard with visible focus indicators; the accordion tree MUST support arrow-key navigation, Enter to open file, and Space to toggle enabled state.
- **FR-027**: The entire surface MUST honour the IDE's light, dark, and system theme without any hardcoded colour values.
- **FR-028**: Extensions that declare tool requirements not present in the current environment MUST surface a warning in the metadata strip when the file is opened; the system MUST NOT silently drop required tools.
- **FR-029**: Write operations from Generate and Import MUST be confined to the target scope's designated directory; any path escaping the scope root MUST be rejected.
- **FR-030**: A command-palette shortcut (`Cmd/Ctrl+K → "Go to Extension…"`) MUST list all extensions across all categories and scopes for rapid navigation, opening the selected item's file in the editor.
- **FR-031**: The feature MUST be deliverable in phases behind a feature flag; Phase 1 covers Claude Agents end-to-end, including the file-editor model, scope-aware accordion layout (global top, local bottom), and dual-scope path support (`~/.claude/` and `.claude/`).

### Key Entities

- **Extension**: A registered AI artifact with a category, name, storage scope, status (pending/review/approved), enabled state, optional description, and a source file path on disk (MD or JSON).
- **Category**: One of seven mutually exclusive types (agents, skills, instructions, prompts, hooks, MCP servers, plugins) that determine what files are surfaced in the accordion section.
- **Storage Scope**: Where an extension's source file physically lives — `user` (global, `~/.claude/` for Claude; `~/.magenta/extensions/` for others), `workspace` (`.claude/` for Claude; project-relative path for others), or `builtin` (compiled into IDE, read-only).
- **Claude Scope Files**: The actual files on disk that Claude Code uses — `~/.claude/settings.json`, `~/.claude/CLAUDE.md`, `.claude/settings.json`, `.claude/CLAUDE.md`, `.claude/settings.local.json`. The IDE surfaces these as named extension entries, not raw paths.
- **Metadata Strip**: The compact read-only bar shown at the top of the editor tab when a Claude/extension config file is opened. Shows name, type, scope, file path, status, and the enable/disable toggle. Contains no editable form fields.
- **Effective Settings**: The resolved configuration computed by the IDE by merging scope layers: `settings.local.json` → workspace `settings.json` → user `settings.json` → built-in defaults. Used by the running agent.
- **Extension Log Entry**: A timestamped lifecycle record with severity, originating scope, file path, and optional extension reference.
- **Generate Draft**: The intermediate unsaved output of the AI-assisted wizard, validated before the user confirms saving to a chosen scope directory.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can open the AI Extensions panel and see all extensions grouped by scope (User → Workspace → Built-in) across all categories in under 1 second for workspaces with up to 200 extensions.
- **SC-002**: Within each category, User (Global) extensions always appear above Workspace (Local) extensions in both the sidebar tree and the center grid — verified in 100% of renders.
- **SC-003**: Search results filter in real time for workspaces with up to 500 extensions across all scopes, with updates visible within 200ms of keypress.
- **SC-004**: An extension toggled off in one session remains off after the IDE is restarted, even if the database cache is deleted, in 100% of cases.
- **SC-005**: Saving a config file in the editor (Cmd/Ctrl+S) causes the updated setting to take effect within 1 second, without any secondary confirmation step.
- **SC-006**: Switching the scope switcher between All / User / Workspace completes in under 500ms with no full reload required.
- **SC-007**: A user-scope extension appears in the extension list of every repository opened in Magenta IDE without any per-repository configuration, verified across at least two separate repositories.
- **SC-008**: When a user opens a Claude extension file in the editor, the metadata strip appears within 200ms and shows the correct scope, file path, and status without any additional navigation.
- **SC-009**: Provider credentials are never shown in plaintext anywhere in the UI, log output, or exported files — verified by audit of all Inspector renders and log lines.
- **SC-010**: A generated extension passes schema validation and appears in the chosen scope's section within 5 seconds of the user confirming the draft (excluding AI response latency).
- **SC-011**: An imported extension file with a naming conflict never silently overwrites an existing extension — the conflict dialog appears 100% of the time.
- **SC-012**: Every extension load failure, settings change, and provider connection event produces a visible log entry in the Extension Logs panel within 2 seconds.
- **SC-013**: All extension management actions (toggle, open, edit settings, switch scope, search) are fully operable via keyboard without a mouse.
- **SC-014**: The panel renders correctly in light and dark themes with no loss of scope indicator, status indicator, or override indicator meaning.
- **SC-015**: No performance regression is introduced in existing DockManager panels when the AI Extensions feature is enabled.

---

## Assumptions

- The IDE's existing DockManager, ActivityBar, RepoTree, and code editor are available and stable. The AI Extensions accordion is added below the RepoTree in the existing left sidebar; no new sidebar panel is introduced.
- The existing code editor (used for all other files) is the editing surface for extension config files. No custom settings form is built. The metadata strip is a lightweight overlay, not a separate panel.
- Claude Code's directory conventions (`~/.claude/`, `.claude/`, `.claude/settings.local.json`) are treated as canonical. The IDE reads and writes these paths directly; no Magenta-specific equivalent directories are created for Claude.
- For non-Claude extensions and generic extension metadata, `~/.magenta/extensions/` (user scope) and `.magenta/extensions/` (workspace scope) remain in use. Both are created automatically if absent.
- The AI Terminal feature's six permission modes are reused as-is for agents and hooks; this spec adds no new modes.
- Claude is the primary AI provider in Phase 1. GitHub Copilot is the secondary provider. The shared settings schema is designed to accommodate both without requiring provider-specific directories.
- `.claude/settings.local.json` is git-ignored by convention. The IDE MUST NOT add it to git automatically; it MAY suggest a `.gitignore` entry on first creation.
- Scope resolution for Claude settings is fixed at four layers: `settings.local.json` → `.claude/settings.json` → `~/.claude/settings.json` → built-in defaults. No team or org scope exists in this version.
- Cloud sync of user-scope settings across machines is out of scope; users manage `~/.claude/` independently per machine.
- Plugin marketplace and installation lifecycle are deferred to Phase 5; Phase 1–4 cover local management only.
- When two IDE windows modify the same scope file simultaneously, the last write wins; the push channel reconciles the other window's state.
- Phase 1 minimum shippable increment: Claude Agents accordion with file-editor model, scope-aware grouping (global top, local bottom), `~/.claude/` and `.claude/` path support, metadata strip, and enable/disable toggle.
- The existing editor's JSON schema validation can be leveraged for `.claude/settings.json` and `settings.local.json` by registering the Claude settings schema; this is an implementation detail, not a new user-facing feature.

