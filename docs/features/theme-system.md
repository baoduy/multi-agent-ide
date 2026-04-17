# Theme System

## Purpose

Magenta IDE supports three theme preferences — `light`, `dark`, and `system` — with a `system` choice that live-updates as the OS preference changes. The theme resolves to either light or dark at runtime and is applied to `<html>` as a `.dark` class; CSS custom properties defined in globals.css then drive every color in the UI. No React component stores color values directly: `utils/colors.ts` exposes semantic names that evaluate to `var(--…)` strings.

## User-visible surface

Theme selection is exposed in Settings (see [`configuration.md`](./configuration.md)) and can also be toggled programmatically via the `ThemeProvider` context. A theme change applies instantly — no reload, no flicker — because the `.dark` class is applied in a synchronous `useEffect` before the first paint.

## IPC contract

None. Theme is client-side only.

## Daemon

Not involved.

## Renderer

- `packages/ui/src/renderer/theme/ThemeProvider.tsx` — React context provider. Tracks preference (`light | dark | system`), resolves to `light | dark`, and listens for `matchMedia('(prefers-color-scheme: dark)')` changes so that `system` updates live. Persists the preference to `localStorage` under `magenta.theme` and sets both `.dark` on `<html>` and `data-theme` / `data-themePreference` attributes for CSS selectors that need them.
- `packages/ui/src/renderer/utils/colors.ts` — the semantic color map. Every entry is a string like `"var(--primary)"` or `"var(--status-active)"`. Components reference `colors.textPrimary`, `colors.error`, `colors.repoBadgeSpecBg`, etc., rather than hex literals.
- `packages/ui/src/renderer/styles/` hosts the `globals.css` (or equivalent) token definitions. `:root` holds the light tokens; `.dark` overrides the ones that differ for dark mode.

The context exposes `{ preference, resolved, setPreference, cyclePreference }`. `cyclePreference` rotates `light → dark → system → light`.

## Data model

- `localStorage` key `magenta.theme` — one of `light`, `dark`, `system`. Invalid values fall back to `system` on read.
- CSS custom properties in `:root` + `.dark` blocks. Token groups include:
  - Base palette (`--primary`, `--foreground`, `--border`, etc.).
  - Status colors (`--status-active`, `--status-waiting`, `--status-error`, `--status-idle`).
  - Repo badge colors (`--repo-badge-*`).
  - Stage colors (`--stage-pending`, `--stage-review`, `--stage-approved`) used by `StageDots`.
  - Icon colors (resolved to muted-foreground to keep file tree icons monochrome).

## Flows

### Theme resolution

```mermaid
flowchart TD
    Boot[App boot] --> Read[Read localStorage magenta.theme]
    Read --> Pref{preference}
    Pref -- light --> Light[resolved = light]
    Pref -- dark --> Dark[resolved = dark]
    Pref -- system --> Query[matchMedia prefers-color-scheme]
    Query -- dark --> Dark
    Query -- light --> Light
    OS[OS preference changes] --> Query
    Light --> Apply[remove .dark on html]
    Dark --> Apply2[add .dark on html]
    Apply --> CSS[CSS vars resolve light palette]
    Apply2 --> CSS2[CSS vars resolve dark palette]
    Toggle[setPreference 'light'|'dark'|'system'] --> WriteLS[Write localStorage] --> Pref
```

### Startup

1. `ThemeProvider` mounts, reads `magenta.theme`, and computes `systemTheme` via `matchMedia`.
2. It calls `setPreference` on itself with the stored value (or `system` as fallback) and derives the `resolved` value.
3. A synchronous effect applies `.dark` to `<html>` if `resolved === 'dark'`, then renders children.

### OS preference changes

A `matchMedia` event listener updates `systemTheme` whenever the OS toggles light/dark. If `preference === 'system'`, the resolved value re-computes and the UI re-renders with the new palette.

### Toggle theme

`setPreference('dark' | 'light' | 'system')` updates the context, re-applies (or removes) the `.dark` class, and writes to `localStorage`.

## Guardrails

- `getSystemTheme()` defaults to `light` if `window.matchMedia` is unavailable (edge case in test environments).
- `readStoredPreference()` validates against the three valid strings; any unexpected value resets to `system` on the next write.
- There is no pre-paint theme flicker because the `.dark` class is applied inside a synchronous `useEffect` before the first child render.
- Dark-mode specific overrides are scoped to the properties that actually need them — for example, `--repo-badge-spec-bg` bumps from a 14 % primary mix in light mode to 32 % in dark mode so amber text remains readable.

## Notes

- `utils/colors.ts` exports **string references** to CSS variables, not resolved values. All color resolution happens in CSS, which means theme swaps are free (no React re-render needed) and also means any component that interpolates a color into an inline style must use the provided `colors.*` constants rather than hex literals. This is enforced by convention rather than tooling.
- Hardcoded hex values are explicitly discouraged (`feedback_hardcoded_colors` in project memory). Terminal and brand SVG palettes are the only exception.
- The theme module is small enough to live outside the `components/theme/` directory (which is currently empty); the provider lives directly under `renderer/theme/`.
