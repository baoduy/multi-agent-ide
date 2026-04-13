# Light Theme and CSS Guidelines

This repository currently enforces a light-only runtime theme.

## Rules

- Always style UI colors through semantic tokens from CSS variables in globals.css or the shared colors utility.
- Do not introduce runtime dark-mode toggles or apply the dark class to the root element.
- Keep dark-theme code paths dormant unless a dedicated feature re-enables them.
- Avoid hardcoded hex colors in renderer components when an existing semantic token can be used.
- Keep inline style usage for dynamic values only (for example measured width/height or runtime coordinates).

## Token Sources

- CSS variables: packages/ui/src/renderer/styles/globals.css
- Shared utility: packages/ui/src/renderer/utils/colors.ts

## Runtime Enforcement

- Renderer bootstrapping forces light theme by removing dark class and setting data-theme=light.
- Terminal uses the light terminal theme in both readonly and interactive branches.

## Future Dark Mode Re-enable

If dark mode is reintroduced later, it should be done via a dedicated feature flag and complete token parity in globals.css, not by ad-hoc component-level overrides.
