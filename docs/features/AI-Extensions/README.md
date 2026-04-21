# AI Extensions

Centralized management surface for agents, skills, instructions, prompts, hooks, MCP servers, and plugins inside Magenta IDE.

## Contents

- [`SRS.md`](./SRS.md) — Software Requirements Specification (functional + non-functional, data model, IPC contract, rollout plan, acceptance criteria).
- [`mockup.html`](./mockup.html) — Interactive UI reference (open in a browser). Supports light/dark toggle, category tabs, search, inspector, and bottom-panel logs.

## Quick links inside the SRS

- Goals and personas — §3, §4
- Functional requirements — §5 (FR-1 through FR-35)
- UI/UX spec and layout — §7
- Data model (SQLite migration `0013`) — §9
- Filesystem layout for workspace extensions — §10
- IPC contract (requests + push events) — §11
- Daemon services and DI wiring — §12
- UI state (Zustand `extensionStore`) — §13
- Rollout phases — §17
- Acceptance criteria — §18
- Open questions — §19

## Status

Draft v1.0 — ready for review. See the change log in §21 of the SRS.
