# Feature Specification: AI Extensions Management

**Feature Branch**: `003-ai-extensions`
**Created**: 2026-04-21
**Status**: Draft
**Source**: `docs/features/AI-Extensions/SRS.md`

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Browse and control all AI extensions from one place (Priority: P1)

As a developer working with Magenta IDE, I want a single surface where I can see every AI artifact registered in my workspace — agents, skills, prompts, hooks, instructions, MCP servers, and plugins — so that I always know what the AI can do and can confidently turn things on or off.

**Why this priority**: Discoverability and control are the core value proposition. Every other story depends on users being able to navigate the extension inventory.

**Independent Test**: Can be fully tested by opening the AI Extensions panel, verifying all installed extensions appear, and toggling one on/off — delivering a working read + control surface before any authoring tools exist.

**Acceptance Scenarios**:

1. **Given** the user opens Magenta IDE in any repository, **When** they click the AI Extensions icon in the activity bar, **Then** a sidebar opens showing all seven extension categories, each with an accurate count of installed extensions.
2. **Given** the sidebar is open, **When** the user clicks any extension row, **Then** a detail panel shows the extension's name, description, scope (workspace vs. built-in), current status, and whether it is enabled.
3. **Given** an extension is currently enabled, **When** the user toggles it off, **Then** the change is persisted and survives an app restart without requiring any file editing.
4. **Given** the user's workspace contains `.magenta/extensions/` files, **When** the extension list loads, **Then** workspace extensions are visually distinguished from built-in extensions.
5. **Given** an extension fails to load on startup, **When** the user views the extension list, **Then** the failed extension is clearly flagged and a diagnostic message is accessible without leaving the IDE.

---

### User Story 2 — Search across all extensions (Priority: P2)

As a power user managing a large number of extensions, I want to type a term and see all matching extensions across every category, so I can quickly find and manage what I need.

**Why this priority**: Critical for users with many extensions; prevents the feature from becoming unusable at scale.

**Independent Test**: Can be tested independently by entering a search term in the search bar and verifying results filter live across all visible extension cards.

**Acceptance Scenarios**:

1. **Given** extensions are loaded across multiple categories, **When** the user types a search term, **Then** only extensions whose name or description contains the term remain visible, with results updating as the user types.
2. **Given** a search returns no results, **When** the user views the panel, **Then** a clear empty-state message is shown rather than a blank panel.
3. **Given** a search is active, **When** the user clears the search field, **Then** all extensions reappear immediately.

---

### User Story 3 — Generate a new extension from a natural-language description (Priority: P2)

As a developer who routinely creates custom agents and hooks, I want to describe what I need in plain language and have the IDE produce a ready-to-use draft, so I can author extensions without writing YAML from scratch.

**Why this priority**: Significantly reduces the time to create new extensions and makes the feature valuable for authoring, not just management.

**Independent Test**: Can be tested by opening the Generate wizard for any category, entering a description, and verifying a draft file is created and appears in the extension list on confirmation.

**Acceptance Scenarios**:

1. **Given** the user is viewing any extension category, **When** they click the Generate button, **Then** a wizard opens prompting for a description and optional template selection.
2. **Given** the wizard is open and the user submits a description, **When** the draft is generated, **Then** a preview is shown for review before anything is saved to disk.
3. **Given** the user reviews and approves the draft, **When** they confirm, **Then** the extension is saved to the workspace and appears in the list immediately.
4. **Given** the generated draft has validation errors, **When** the user reviews it, **Then** specific errors are shown inline so the user can correct them before saving.
5. **Given** the user closes the wizard without confirming, **When** the wizard closes, **Then** no file is written and no extension is added to the list.

---

### User Story 4 — Import extensions from files (Priority: P3)

As a developer sharing or migrating extensions between repositories, I want to import extension files from disk so I can reuse existing work without manual copy-paste.

**Why this priority**: Useful for teams and power users, but not needed for basic usage.

**Independent Test**: Can be tested by selecting one or more extension files via the Import action and verifying they appear in the workspace list.

**Acceptance Scenarios**:

1. **Given** the user clicks Import, **When** they select valid extension files, **Then** the extensions are added to the workspace scope and appear in the list.
2. **Given** an imported file conflicts with an existing extension name, **When** the import is processed, **Then** the user is shown a conflict summary and given the option to skip or overwrite before any changes are made.
3. **Given** an imported file does not conform to the category's expected format, **When** import is attempted, **Then** the file is rejected with a clear error message and no other extensions are affected.

---

### User Story 5 — Diagnose extension load errors from a dedicated log view (Priority: P3)

As a developer investigating unexpected AI behaviour, I want to see a live log of every extension lifecycle event — loads, enables, disables, validation failures — so I can diagnose problems without switching to an external log file.

**Why this priority**: Important for debuggability but secondary to the core management flow.

**Independent Test**: Can be tested by intentionally corrupting an extension file and verifying the error appears in the Extension Logs panel without restarting the app.

**Acceptance Scenarios**:

1. **Given** the IDE is running, **When** any extension is loaded, enabled, disabled, or fails validation, **Then** a corresponding log entry appears in the Extension Logs panel in real time.
2. **Given** there are unread error log entries, **When** the user looks at the bottom panel tab, **Then** the tab shows a count badge indicating how many problems have occurred since last viewed.
3. **Given** the user clicks on a failed extension in the list, **When** the detail panel opens, **Then** the specific error and a shortcut to open the source file are visible.

---

### Edge Cases

- What happens when an extension file on disk is deleted outside the IDE while it is enabled?
- How does the system handle two extensions in the same category with identical names?
- What happens when the workspace has no `.magenta/extensions/` directory at all?
- How does toggling an agent that is actively in use by an open AI Terminal session behave?
- What happens when an extension file contains secrets (tokens, API keys) during import?
- How does the panel behave when opened in a repository with 500+ extensions?

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST display all seven extension categories (agents, skills, instructions, prompts, hooks, MCP servers, plugins) in a single accessible panel, each showing an accurate count of installed extensions.
- **FR-002**: Each extension MUST be classified as either `workspace` scope (editable, sourced from the repository's `.magenta/extensions/` directory) or `built-in` scope (read-only, shipped with the IDE), and the distinction MUST be visually clear to users.
- **FR-003**: Users MUST be able to enable or disable any extension without editing files directly; the enabled state MUST persist across app restarts and MUST survive deletion of the database cache.
- **FR-004**: Users MUST be able to search for extensions by name or description across all categories, with results filtering as they type.
- **FR-005**: Selecting an extension MUST display a detail view showing its name, description, type, scope, status, permission requirements, and source file path (for workspace extensions).
- **FR-006**: Users MUST be able to generate a new extension in any category by providing a natural-language description; a draft MUST be produced for review before being saved to disk.
- **FR-007**: Generated and imported extensions MUST be validated against their category's schema before being persisted; the user MUST see specific errors if validation fails.
- **FR-008**: Users MUST be able to import extension files from disk; conflicting names MUST trigger a confirmation dialog listing the conflicts before any changes are written.
- **FR-009**: The system MUST display a dedicated log view streaming lifecycle events (load, enable, disable, validation errors, generate completions) in real time.
- **FR-010**: The log panel tab MUST show a count badge when unread error-level events exist since the panel was last viewed.
- **FR-011**: All interactive elements MUST be navigable by keyboard, with visible focus indicators; the extension tree and grid MUST support arrow-key navigation, Enter to open, and Space to toggle.
- **FR-012**: The entire surface MUST honour the IDE's light, dark, and system theme without any hardcoded colour values.
- **FR-013**: Extensions that declare tool requirements not present in the current workspace MUST surface a warning when enabled; the system MUST NOT silently drop required tools.
- **FR-014**: The Generate wizard MUST be the only flow capable of making outbound network calls; all other extension management operations MUST be fully local.
- **FR-015**: MCP server definitions containing credentials or tokens MUST be stored in the existing secret store, not in plain-text configuration files.
- **FR-016**: Write operations from Generate and Import MUST be confined to the workspace's `.magenta/extensions/` directory; any path escaping the workspace root MUST be rejected.
- **FR-017**: A command-palette shortcut (`Cmd/Ctrl+K → "Go to Extension…"`) MUST list all extensions across all categories for rapid navigation.
- **FR-018**: The feature MUST be deliverable in phases behind a feature flag so early phases are independently shippable; Phase 1 covers Agents end-to-end.

### Key Entities

- **Extension**: A registered AI artifact with a category, name, scope, status (pending/review/approved), enabled state, optional description, optional tools list, and — for workspace extensions — a source file path.
- **Category**: One of seven mutually exclusive types (agents, skills, instructions, prompts, hooks, MCP servers, plugins) that determine the extension's schema and authoring rules.
- **Scope**: Whether an extension is `workspace` (stored in the current repository's `.magenta/extensions/` tree, editable) or `builtin` (shipped with Magenta, read-only).
- **Extension Log Entry**: A timestamped record of an extension lifecycle event with a severity level (info, ok, warn, error) and optional association to a specific extension.
- **Generate Draft**: The intermediate, unsaved output of the AI-assisted wizard — validated content ready for user review before being committed to disk.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can open the AI Extensions panel and see a complete, categorised list of all installed extensions in under 1 second on a workspace with up to 200 extensions.
- **SC-002**: Search results filter in real time with no perceptible lag for workspaces with up to 500 extensions (updates visible within 200ms of keypress).
- **SC-003**: An extension toggled off in one session remains off after the IDE is restarted, even if the database cache is deleted, in 100% of cases.
- **SC-004**: A generated extension produced from a natural-language description passes schema validation and appears in the extension list within 5 seconds of the user confirming the draft (excluding AI response latency).
- **SC-005**: An imported extension file with a naming conflict never silently overwrites an existing extension — the conflict dialog appears 100% of the time.
- **SC-006**: Every extension load failure and enable/disable event produces a visible log entry in the Extension Logs panel within 2 seconds of the event occurring.
- **SC-007**: All interactive extension management actions (toggle, open, search) are fully operable via keyboard without requiring a mouse.
- **SC-008**: The AI Extensions panel renders correctly in both light and dark themes with no loss of status indicator meaning (status is distinguishable by shape as well as colour).
- **SC-009**: Enabling an agent that is already in use by an open AI Terminal session does not crash the session and surfaces a clear status update.
- **SC-010**: No performance regression is introduced in existing DockManager panels when the AI Extensions feature is enabled.

---

## Assumptions

- The IDE's existing DockManager, ActivityBar, and theme system are available and stable; no changes to these foundations are required before implementing this feature.
- The AI provider already integrated with the IDE (used by the AI Terminal) will be reused for the Generate wizard; a dedicated authoring provider is not needed.
- Enablement state for built-in extensions persists per workspace (not globally across all workspaces), matching the behaviour described in the SRS draft.
- Plugin installation interactions with IDE upgrades are out of scope for Phase 1–4; the marketplace and plugin lifecycle are deferred to Phase 5.
- When two IDE windows are open on the same workspace and both toggle an extension simultaneously, the last write wins and the push channel reconciles the other window's state automatically.
- There is no "reset to defaults" action in this specification; if needed, it can be added as a follow-on requirement.
- The six permission modes already implemented in the AI Terminal feature are reused for agents and hooks without modification.
- The workspace source of truth (`.magenta/extensions/` files on disk) takes precedence over the database cache at all times; the cache is purely a performance optimisation.
- Phase 1 (Agents only) is the minimum shippable increment; subsequent phases add categories without re-architecting the foundation.
