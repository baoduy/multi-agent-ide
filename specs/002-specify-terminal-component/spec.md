# Feature Specification: MagentaTerminal Reuse and Sidebar Terminal

**Feature Branch**: `002-run-feature-hook`  
**Created**: 2026-04-11  
**Status**: Draft  
**Input**: User description: "Build a reusable terminal component named MagentaTerminal. It must support full interaction with the OS terminal and also a readonly attribute that behaves like the current Specify onboarding/upgrade dialog output view. Reuse this component in Specify dialogs with readonly mode, and add one full functionality terminal in the right sidebar below the Legend section."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Monitor Specify Scripts in Readonly Dialog Mode (Priority: P1)

As a user running Specify onboarding or upgrade from the app, I want the dialog terminal to stream command output in real time without allowing edits, so I can monitor progress and outcomes safely.

**Why this priority**: This is the current critical workflow for onboarding and upgrade; preserving and improving visibility is required to avoid regressions.

**Independent Test**: Can be fully tested by starting an onboard or upgrade run and confirming output appears in chronological order, completion status is visible, and user input is blocked in readonly mode.

**Acceptance Scenarios**:

1. **Given** an onboarding run is active in readonly mode, **When** new output lines are produced, **Then** the terminal view appends the new lines without replacing existing output.
2. **Given** an upgrade run completes successfully in readonly mode, **When** the process exits, **Then** the terminal view clearly shows completion and final output.
3. **Given** a readonly terminal is shown, **When** a user attempts to type or submit input, **Then** no command is accepted and no process input is sent.

---

### User Story 2 - Use Full Terminal in Right Sidebar (Priority: P2)

As a user needing manual control, I want a full interactive terminal in the right sidebar below the Legend section, so I can run terminal commands directly from the app without switching tools.

**Why this priority**: Interactive execution expands utility, but the app still delivers value with readonly monitoring alone.

**Independent Test**: Can be fully tested by opening the right sidebar, locating the terminal below Legend, entering commands, executing them, and verifying both command echo and resulting output are shown in the same session.

**Acceptance Scenarios**:

1. **Given** the right sidebar is visible, **When** a user views the area below Legend, **Then** a full interactive terminal is available there.
2. **Given** a terminal session is available in the sidebar terminal, **When** a user submits a valid command, **Then** the command is executed and output is displayed in the terminal stream.
3. **Given** a command fails in the sidebar terminal, **When** the failure output is shown, **Then** the session remains usable for subsequent commands.

---

### User Story 3 - Reuse One MagentaTerminal Component Across App Areas (Priority: P3)

As a user of onboarding, upgrade, and sidebar terminal experiences, I want one consistent terminal interface and behavior, so I do not need to relearn controls between locations.

**Why this priority**: Consistency improves usability and maintenance, but depends on the two core capabilities above.

**Independent Test**: Can be fully tested by opening onboarding and upgrade dialogs plus the right sidebar terminal and verifying all use the same component behavior model with mode-specific controls.

**Acceptance Scenarios**:

1. **Given** the onboarding flow opens a terminal, **When** the terminal renders, **Then** it uses the shared MagentaTerminal component in readonly mode.
2. **Given** the upgrade flow opens a terminal, **When** the terminal renders, **Then** it uses the shared MagentaTerminal component in readonly mode.
3. **Given** the right sidebar terminal is shown, **When** it renders below Legend, **Then** it uses the same MagentaTerminal component in full interactive mode.

### Edge Cases

- What happens when the terminal session disconnects while output is streaming?
- How does the system handle very large output bursts without losing line ordering or freezing the terminal view?
- What happens when a user rapidly toggles between readonly and full mode while a process is running?
- How is command submission handled when full mode is visible but no active execution context is available?
- What happens when the right sidebar is collapsed or resized while a long-running terminal command is active?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a standalone reusable component named MagentaTerminal that can be embedded by multiple app areas.
- **FR-002**: The standalone terminal component MUST support a readonly mode that displays execution output without accepting user-entered commands.
- **FR-003**: The standalone terminal component MUST support a full interactive mode that allows users to type, submit, and run commands.
- **FR-004**: The terminal component MUST stream and display output in chronological order for both readonly and full modes.
- **FR-005**: The terminal component MUST preserve session output history for the duration of an active flow so users can review earlier lines.
- **FR-006**: The system MUST visibly differentiate execution states, including idle, running, success, canceled, and failed.
- **FR-007**: The system MUST allow cancellation of running script execution from terminal-enabled flows when cancellation is supported by the flow.
- **FR-008**: The system MUST reuse MagentaTerminal in both Specify onboarding and Specify upgrade dialogs in readonly mode.
- **FR-009**: The system MUST prevent readonly mode from sending any user-typed input to execution processes.
- **FR-010**: The system MUST keep the terminal session usable after command failures in full mode, allowing subsequent commands.
- **FR-011**: The system MUST display clear error information when command execution cannot be started or when a session becomes unavailable.
- **FR-012**: The system MUST include one full interactive MagentaTerminal in the right sidebar, positioned below the Legend section.
- **FR-013**: The system MUST maintain consistent controls and terminal interaction patterns across onboarding dialog, upgrade dialog, and sidebar terminal contexts.

### Key Entities *(include if feature involves data)*

- **Terminal Session**: Represents one running terminal context for a flow, including current state, accumulated output, and lifecycle status.
- **Terminal Mode**: Represents whether a terminal instance is readonly or full interactive and governs allowed user actions.
- **Command Submission**: Represents a user-entered command request in full mode, including command text, submit time, and execution outcome.
- **Execution Output Event**: Represents each output chunk emitted during execution, including ordering and origin metadata for rendering.
- **Flow Context**: Represents the parent area using the terminal (onboarding dialog, upgrade dialog, or right sidebar) and associated capabilities such as cancel support.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of onboarding and upgrade runs display visible terminal output updates within 1 second of output emission under normal app operation.
- **SC-002**: In readonly mode, 0 user-entered commands are executed across validation test runs.
- **SC-003**: In full mode validation, at least 95% of submitted commands begin execution on first attempt when the session is available.
- **SC-004**: 100% of validated UI states show a full interactive terminal in the right sidebar below Legend when the sidebar is available.
- **SC-005**: At least 90% of test users complete a basic onboarding or upgrade monitoring task and a basic sidebar command task without assistance.
- **SC-006**: Onboarding, upgrade, and sidebar flows show no behavior drift in shared terminal controls across regression scenarios.

## Assumptions

- Existing onboarding and upgrade execution backends remain available and can provide output streams to MagentaTerminal.
- Access control for who can run interactive commands is handled by current app-level permissions and does not change in this feature.
- Initial release targets desktop users of the existing app and does not introduce new platform-specific variants.
- The app continues to support cancellation only in flows that already expose cancel capability.
- A single active terminal session per location instance (dialog or sidebar) is sufficient for the first release of this feature.
