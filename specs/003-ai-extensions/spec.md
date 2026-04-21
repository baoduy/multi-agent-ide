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

## UI Design *(per extension type)*

This section describes the user-facing configuration panel that appears in the right-sidebar Inspector when an extension is selected. All panels follow the same structural pattern: **Identity → Provider/Settings → Scope fields → Actions**.

### Layout model

The left sidebar accordion follows a fixed top-to-bottom grouping within every category section:

```
▼ Agents                         (category section header, count badge)
    ── User (Global) ──────────────────────────────  ← user scope first
      ◆ arch.review                        ● approved
      ◆ speckit.git.commit                 ● approved
    ── Workspace (Local) ──────────────────────────  ← workspace scope second
      ◆ project-reviewer                   ● pending
    ── Built-in ───────────────────────────────────  ← built-in last (read-only)
      ◆ Ask                                ● approved
      ◆ Explore                            ● approved
```

The scope switcher at the top of the sidebar filters across all categories at once. The center grid tab mirrors the same three-group layout with labelled horizontal dividers.

---

### Agent Inspector panel

```
[ ◆ Icon ]  arch.review                    ● approved
            Architecture review, code review, security audit…

  Type        Agent
  Scope       User (Global)                  [Edit location]
  Enabled     ●──── ON                       [Disable]

  ── AI Provider ──────────────────────────────────────────
  Provider    [ Claude ▾ ]
  Model       [ claude-sonnet-4.6 ▾ ]        (inherited: User default)
  API Key     ••••••••••••••••               [Change]
  Base URL    https://api.anthropic.com      (default)  [Override]

  ── Behaviour ────────────────────────────────────────────
  System      [____________________________________]
  Prompt      [  (inherited: "You are a senior…")  ]  [Reset]
  Temperature  ●────────── 0.3               (inherited: 0.3)  [Override]
  Max tokens   4096                          (workspace override)  [Reset]
  Thinking     OFF                           [Enable]

  ── Tool Permissions ─────────────────────────────────────
  Mode        [ review ▾ ]  (ask before running tools)
  Allowed     [x] Read  [x] Grep  [x] WebFetch  [ ] Bash  [ ] Edit

  ── Source ───────────────────────────────────────────────
  Path        ~/.magenta/extensions/agents/arch-review.yaml

  [Save]  [Cancel]  [Duplicate]  [Open file]  [Delete]
```

**Configurable fields for agents**:

| Field | Description | Scope |
|---|---|---|
| Provider | Claude or Copilot (dropdown) | Per-agent or inherited from user default |
| Model | Model name from the selected provider's available list | Per-agent or inherited |
| API Key / Token | Credential for the provider; stored in secret store | User scope only |
| Base URL | Provider endpoint override (e.g., for enterprise deployments) | User or workspace |
| System Prompt | Freeform text prepended to every conversation with this agent | Per-agent; inheritable |
| Temperature | 0.0 – 1.0 slider; lower = more deterministic | Per-agent or inherited |
| Max tokens | Maximum response length | Per-agent or inherited |
| Thinking mode | Enables extended reasoning (Claude-specific; harmlessly ignored by Copilot) | Per-agent |
| Permission mode | One of six modes: auto, review, semi-auto, manual, disabled, locked | Per-agent |
| Allowed tools | Multi-select checkbox list of declared tools | Per-agent; workspace can restrict subset of user list |

**Copilot reuse model**: When provider is switched to Copilot, the fields System Prompt, Temperature, Max tokens, and Tool permissions carry over directly. The only Copilot-specific fields are the GitHub token and the Copilot model identifier. This means a user who has configured a Claude agent can clone it and switch to Copilot with two field changes.

---

### Skill Inspector panel

```
[ ★ Icon ]  docx                           ● approved
            Create, read, and edit Word documents.

  Type        Skill
  Scope       Workspace (Local)
  Enabled     ●──── ON                       [Disable]

  ── Skill Parameters ─────────────────────────────────────
  (Skills have no AI provider settings — they are tool bundles.)
  No configurable parameters for this skill.

  ── Source ───────────────────────────────────────────────
  Path        .magenta/extensions/skills/docx/SKILL.md

  [View SKILL.md]  [Duplicate to User scope]  [Delete]
```

Skills are capability bundles, not conversation participants. They have no provider, model, or prompt settings. The only configurable state is enable/disable and scope. If a skill exposes optional parameters (defined in SKILL.md frontmatter), those are shown as simple key-value fields.

---

### MCP Server Inspector panel

```
[ ⚙ Icon ]  github-mcp                     ● approved
            Read repos, PRs, and issues via Model Context Protocol.

  Type        MCP Server
  Scope       Workspace (Local)
  Enabled     ●──── ON                       [Disable]

  ── Connection ───────────────────────────────────────────
  Transport   [ stdio ▾ ]          (stdio | sse | websocket)
  Command     npx @modelcontextprotocol/server-github
  Args        [ --port 3000 ]
  Env vars    GITHUB_TOKEN  ••••••••••••      [Change]
              GITHUB_ORG    myorg             [Edit]
                                              [+ Add variable]

  ── Status ───────────────────────────────────────────────
  Connection  Connected (pid 81422)
  Last ping   2s ago

  ── Source ───────────────────────────────────────────────
  Path        .magenta/extensions/mcp/github-mcp.json

  [Reconnect]  [Edit]  [Duplicate to User scope]  [Delete]
```

**Configurable fields for MCP servers**:

| Field | Description | Notes |
|---|---|---|
| Transport | How the server is started: stdio (subprocess), SSE (HTTP), or websocket | |
| Command | The executable and arguments to launch (stdio only) | |
| Args | Additional command-line arguments | |
| Env vars | Key-value pairs passed to the server process; secret values stored in secret store | Secret values masked |
| Base URL | Server URL (SSE/websocket only) | |

MCP credentials (tokens, API keys in env vars) are always stored in the system secret store. Plain-text values are accepted in the form but are moved to the secret store on save and replaced with a reference token.

---

### Hook Inspector panel

```
[ ⚡ Icon ]  on-save.lint                   ● approved
            Run linter after every file save.

  Type        Hook
  Scope       Workspace (Local)
  Enabled     ●──── ON                       [Disable]

  ── Trigger ──────────────────────────────────────────────
  Event       [ on-save ▾ ]   (on-save | on-commit | pre-push | on-open | on-error)
  Condition   *.ts, *.tsx                    (glob pattern, optional)

  ── Execution ────────────────────────────────────────────
  Command     pnpm lint --fix
  Permission  [ review ▾ ]   (ask before running)
  Timeout     30s

  ── Source ───────────────────────────────────────────────
  Path        .magenta/extensions/hooks/on-save.lint.yaml

  [Save]  [Cancel]  [Test hook]  [Open file]  [Delete]
```

**Configurable fields for hooks**:

| Field | Description |
|---|---|
| Trigger event | Lifecycle event that fires the hook |
| Condition | Optional glob or expression that limits when the hook fires |
| Command | Shell command to execute |
| Permission mode | One of the six modes from the AI Terminal feature (default: review) |
| Timeout | Maximum seconds before the hook is killed |

---

### Prompt Inspector panel

```
[ ❯ Icon ]  review-pr                      ● approved
            Review a pull request for correctness and style.

  Type        Prompt
  Scope       Workspace (Local)
  Enabled     ●──── ON                       [Disable]

  ── Content ──────────────────────────────────────────────
  [ Review this pull request for:                         ]
  [ 1. Correctness — does the change do what it claims?   ]
  [ 2. Style — does it match the project conventions?     ]
  [ …                                                     ]
  [Edit inline ↗]

  ── Variables ────────────────────────────────────────────
  {{repo}}    auto-filled from workspace context
  {{branch}}  auto-filled from git HEAD

  ── Source ───────────────────────────────────────────────
  Path        .magenta/extensions/prompts/review-pr.md

  [Save]  [Cancel]  [Open file]  [Duplicate]  [Delete]
```

Prompts are edited directly inline in the Inspector. Template variables (double-brace syntax) are discovered automatically and listed with their resolution source. No AI provider settings — prompts are templates, not agents.

---

### Instructions Inspector panel

```
[ I Icon ]  coding-style.md                ● approved
            House coding conventions and review expectations.

  Type        Instruction
  Scope       Workspace (Local)
  Enabled     ●──── ON                       [Disable]

  ── Content ──────────────────────────────────────────────
  [ # Coding Style                                        ]
  [ Use TypeScript 6 strict mode. No `any`.               ]
  [ Class-first OOP in daemon services.                   ]
  [ …                                                     ]
  [Edit inline ↗]

  Path        .magenta/extensions/instructions/coding-style.md

  [Save]  [Cancel]  [Open file]  [Duplicate]  [Delete]
```

Instructions are free-form markdown documents injected into every AI conversation. No provider or parameter settings. The only configuration is the markdown content itself and the enable/disable toggle.

---

### Plugin Inspector panel

```
[ ⊞ Icon ]  engineering                    ● approved
            Bundle of skills: review, debug, standup, system design.

  Type        Plugin
  Scope       Workspace (Installed)
  Enabled     ●──── ON                       [Disable]

  ── Included skills ──────────────────────────────────────
  [x] review     [x] debug     [x] standup     [ ] system-design

  ── Version ──────────────────────────────────────────────
  Installed   1.2.0
  Latest      1.2.0    ● Up to date

  ── Source ───────────────────────────────────────────────
  Registry    marketplace.magenta.dev
  Local path  .magenta/extensions/plugins/engineering/

  [Disable]  [Uninstall]  [Check for updates]
```

Plugins are bundles. Configuration is limited to selecting which included skills are active. Marketplace plugins additionally show version and update status.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST display all seven extension categories in a single accessible panel, each showing an accurate count of installed extensions across all active scopes.
- **FR-002**: Within each category's sidebar section and center grid, extensions MUST be grouped in a fixed top-to-bottom order: User (Global) first, Workspace (Local) second, Built-in last. Each group MUST have a visible labelled divider.
- **FR-003**: Each extension MUST be classified with exactly one storage scope — `user` (global), `workspace` (current repository), or `builtin` (read-only, shipped with IDE) — and the scope MUST be visually clear at all times.
- **FR-004**: Users MUST be able to enable or disable any extension without editing files directly; the enabled state MUST persist across app restarts and MUST survive deletion of the database cache.
- **FR-005**: Users MUST be able to search for extensions by name or description across all categories and scopes, with results filtering as they type.
- **FR-006**: The sidebar MUST include a scope switcher that filters the entire panel to show only User (Global) or only Workspace (Local) extensions when selected, or all scopes when set to "All".
- **FR-007**: Selecting an extension MUST open the Inspector showing the extension's identity, all configurable settings with their current effective values, and a clear indication of whether each value comes from workspace scope, user scope, or the built-in default.
- **FR-008**: For each inherited setting value, the Inspector MUST show an "Override" action that creates a workspace-scope value and a "Reset" action (when an override exists) that removes the workspace value and restores the inherited one.
- **FR-009**: The scope resolution order for all settings MUST be: workspace overrides → user defaults → built-in defaults. This order MUST be enforced consistently across all extension types.
- **FR-010**: Agent extensions MUST expose the following configurable settings in the Inspector: AI provider (Claude or Copilot), model, system prompt, temperature, maximum response length, thinking mode (Claude-specific), permission mode, and allowed tools list.
- **FR-011**: The system MUST support Claude and Copilot as AI providers for agents. The settings schema for both MUST share the fields: system prompt, temperature, maximum response length, permission mode, and allowed tools. Provider-specific fields (Claude: API key, base URL, thinking mode; Copilot: GitHub token, Copilot model) MUST be shown only when that provider is selected.
- **FR-012**: When an agent's provider is changed, shared settings (system prompt, temperature, max tokens, tools) MUST carry over automatically; only the provider-specific credential fields MUST be re-entered.
- **FR-013**: All provider credentials (API keys, tokens) MUST be stored in the system secret store. They MUST be masked in the Inspector UI and MUST never appear in plaintext on screen or in log output.
- **FR-014**: MCP server extensions MUST expose the following configurable settings: transport type (stdio, SSE, websocket), launch command and arguments (stdio), server URL (SSE/websocket), environment variables, and connection timeout. Environment variable values that are treated as secrets MUST be stored in the secret store.
- **FR-015**: Hook extensions MUST expose the following configurable settings: trigger event, optional condition expression or glob, shell command, permission mode (from the six AI Terminal modes), and execution timeout.
- **FR-016**: Prompt and Instruction extensions MUST be editable inline in the Inspector with a rich-text or code editor appropriate to the content type (markdown for instructions, freeform for prompts). Template variables MUST be auto-discovered and shown with their resolution source.
- **FR-017**: Skill extensions MUST display any parameters declared in their definition file as editable fields, or a "no configurable parameters" message if none are declared. Skills do not have AI provider settings.
- **FR-018**: Plugin extensions MUST display the list of included skills and allow the user to toggle individual skills on or off within the plugin bundle. Marketplace plugins MUST show installed vs. latest version and an update action.
- **FR-019**: Users MUST be able to generate a new extension in any category by providing a natural-language description; the wizard MUST ask for a target scope (user or workspace) before saving.
- **FR-020**: Generated and imported extensions MUST be validated against their category's schema before being persisted; the user MUST see specific errors if validation fails.
- **FR-021**: Users MUST be able to import extension files from disk into either user or workspace scope; conflicting names within the target scope MUST trigger a confirmation dialog before any changes are written.
- **FR-022**: User-scope extensions MUST be stored at `~/.magenta/extensions/` independent of any repository; the system MUST create this directory structure if it does not exist.
- **FR-023**: When the same extension name exists at both user and workspace scope, the list MUST show a single merged entry with a "Workspace override active" indicator; the user MUST be able to inspect or remove the override.
- **FR-024**: The system MUST display a dedicated Extension Logs panel streaming lifecycle events (load, enable, disable, settings changes, validation errors, provider connection events) in real time, each event tagged with its scope.
- **FR-025**: The log panel tab MUST show a count badge when unread error-level events exist since the panel was last viewed.
- **FR-026**: All interactive elements MUST be navigable by keyboard with visible focus indicators; the tree and grid MUST support arrow-key navigation, Enter to open, and Space to toggle.
- **FR-027**: The entire surface MUST honour the IDE's light, dark, and system theme without any hardcoded colour values. All new colour tokens MUST be defined with both light and dark variants.
- **FR-028**: Extensions that declare tool requirements not present in the current environment MUST surface a warning when enabled; the system MUST NOT silently drop required tools.
- **FR-029**: Write operations from Generate and Import MUST be confined to the target scope's designated directory; any path escaping the scope root MUST be rejected.
- **FR-030**: A command-palette shortcut (`Cmd/Ctrl+K → "Go to Extension…"`) MUST list all extensions across all categories and scopes for rapid navigation.
- **FR-031**: The feature MUST be deliverable in phases behind a feature flag; Phase 1 covers Agents end-to-end, including per-agent settings, Claude/Copilot provider configuration, and dual-scope support.

### Key Entities

- **Extension**: A registered AI artifact with a category, name, storage scope, status (pending/review/approved), enabled state, optional description, type-specific settings, and — for non-builtin extensions — a source file path.
- **Category**: One of seven mutually exclusive types (agents, skills, instructions, prompts, hooks, MCP servers, plugins) that determine the extension's settings schema and authoring rules.
- **Storage Scope**: Where an extension's source file lives — `user` (`~/.magenta/extensions/`), `workspace` (`.magenta/extensions/`), or `builtin` (compiled into IDE, read-only).
- **Extension Settings**: Named configuration values specific to an extension instance. Each value can exist independently at user scope, workspace scope, or be inherited from a higher scope.
- **Effective Settings**: The resolved value set computed by merging workspace overrides on top of user defaults on top of built-in defaults. This is what the running agent actually uses.
- **Scope Override**: A workspace-scope value that shadows a user-scope value for the same setting key. Removing it restores inheritance.
- **AI Provider Config**: The provider identity (Claude or Copilot) plus provider-specific credentials and shared parameters (system prompt, temperature, max tokens, tools) for an agent.
- **Extension Log Entry**: A timestamped lifecycle record with severity, originating scope, and optional extension reference.
- **Generate Draft**: The intermediate unsaved output of the AI-assisted wizard, validated before the user confirms saving to a chosen scope.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can open the AI Extensions panel and see all extensions grouped by scope (User → Workspace → Built-in) across all categories in under 1 second for workspaces with up to 200 extensions.
- **SC-002**: Within each category, User (Global) extensions always appear above Workspace (Local) extensions in both the sidebar tree and the center grid — verified in 100% of renders.
- **SC-003**: Search results filter in real time for workspaces with up to 500 extensions across all scopes, with updates visible within 200ms of keypress.
- **SC-004**: An extension toggled off in one session remains off after the IDE is restarted, even if the database cache is deleted, in 100% of cases.
- **SC-005**: A workspace-scope settings override takes effect within 1 second of saving; the user-scope value is verifiably unchanged.
- **SC-006**: Switching the scope switcher between All / User / Workspace completes in under 500ms with no full reload required.
- **SC-007**: A user-scope extension appears in the extension list of every repository opened in Magenta IDE without any per-repository configuration, verified across at least two separate repositories.
- **SC-008**: When switching an agent's provider from Claude to Copilot, shared settings (system prompt, temperature, max tokens, tools) carry over in 100% of cases; no shared field is reset to blank.
- **SC-009**: Provider credentials are never shown in plaintext anywhere in the UI, log output, or exported files — verified by audit of all Inspector renders and log lines.
- **SC-010**: A generated extension passes schema validation and appears in the chosen scope's section within 5 seconds of the user confirming the draft (excluding AI response latency).
- **SC-011**: An imported extension file with a naming conflict never silently overwrites an existing extension — the conflict dialog appears 100% of the time.
- **SC-012**: Every extension load failure, settings change, and provider connection event produces a visible log entry in the Extension Logs panel within 2 seconds.
- **SC-013**: All extension management actions (toggle, open, edit settings, switch scope, search) are fully operable via keyboard without a mouse.
- **SC-014**: The panel renders correctly in light and dark themes with no loss of scope indicator, status indicator, or override indicator meaning.
- **SC-015**: No performance regression is introduced in existing DockManager panels when the AI Extensions feature is enabled.

---

## Assumptions

- The IDE's existing DockManager, ActivityBar, and theme system are available and stable; the AI Extensions panel plugs in as a new set of registered views.
- The AI Terminal feature's six permission modes are reused as-is for agents and hooks; this spec adds no new modes.
- Claude is the primary AI provider in Phase 1. GitHub Copilot is the secondary provider. The shared settings schema is designed to be provider-agnostic so additional providers (e.g., OpenAI, Gemini) can be added without schema changes.
- The user-scope storage location is `~/.magenta/extensions/`; this is created automatically if it does not exist.
- Scope resolution is strictly: workspace → user → built-in. There is no team, org, or project-group scope in this version.
- When provider is Claude and thinking mode is enabled for an agent, Copilot-linked copies of that agent silently ignore the thinking mode field (it is not an error).
- Built-in extension enable/disable is treated as a workspace-scope override (not a user-scope preference), so it can be different per repository.
- Cloud sync of user-scope settings across machines is out of scope; users must manage user-scope extensions independently per machine.
- Plugin marketplace and installation lifecycle are deferred to Phase 5; Phase 1–4 cover local management only.
- When two IDE windows modify the same scope simultaneously, the last write wins and the push channel reconciles the other window's state.
- Phase 1 (Agents only: settings management, Claude/Copilot provider config, dual-scope support, global-top / local-bottom layout) is the minimum shippable increment.

