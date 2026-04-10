# Architecture + Rerender Review (Round 2)

This is a read-only review. No code was changed.

## Findings (Ordered by Severity)

### 1. High: Main page owns too much state and emits unstable callbacks into large subtrees

Why this matters:
`MainPage` is a high fan-out component. It subscribes to many store slices and also creates non-memoized callbacks during render. That pattern causes broad rerender propagation to children that receive function props.

Evidence:
- Large set of store subscriptions in [packages/ui/src/renderer/pages/Main.tsx](../packages/ui/src/renderer/pages/Main.tsx#L136-L150).
- Non-memoized handlers recreated each render in [packages/ui/src/renderer/pages/Main.tsx](../packages/ui/src/renderer/pages/Main.tsx#L301-L330).
- Content renderer function recreated each render in [packages/ui/src/renderer/pages/Main.tsx](../packages/ui/src/renderer/pages/Main.tsx#L374).

Rerender risk:
Even when only one state slice changes, callback identity changes can force child rerenders, especially in `TabBar`, `WorktreesView`, and `WorkflowView` prop chains.

Best-practice refactor:
- Split `MainPage` into state container + presentational segments (`MainShell`, `MainTabs`, `MainPanels`).
- Memoize prop callbacks that cross component boundaries (`useCallback`).
- Convert expensive child components to `React.memo` where props can be made stable.

---

### 2. High: Worktree view recomputes grouping/sorting/lookup on every render

Why this matters:
`WorktreesView` rebuilds grouped maps and repeatedly searches `repos` during sort/render. This is O(n*m) work that reruns whenever parent state changes.

Evidence:
- Group map built per render in [packages/ui/src/renderer/components/main/WorktreesView.tsx](../packages/ui/src/renderer/components/main/WorktreesView.tsx#L317).
- Sorting and repeated repo lookups in [packages/ui/src/renderer/components/main/WorktreesView.tsx](../packages/ui/src/renderer/components/main/WorktreesView.tsx#L325-L329).
- Additional repeated lookup during render map in [packages/ui/src/renderer/components/main/WorktreesView.tsx](../packages/ui/src/renderer/components/main/WorktreesView.tsx#L361).

Rerender risk:
Unrelated parent updates trigger repeated heavy transforms and list reconciliation.

Best-practice refactor:
- Memoize derived structures: `repoNameByPath`, grouped worktrees, sorted entries.
- Use `useMemo` with narrow dependency arrays.
- Keep `RepoGroup` and `WorktreeCard` memoized with stable handlers.

---

### 3. High: Store updates write fresh objects/arrays even when semantic values are unchanged

Why this matters:
In Zustand, any state change not passing equality guards can notify subscribers. Several store actions assign fresh objects each call, even when values are the same.

Evidence:
- Config writes set spread values repeatedly in [packages/ui/src/renderer/store/configStore.ts](../packages/ui/src/renderer/store/configStore.ts#L40-L79).
- Event handler sets config object blindly in [packages/ui/src/renderer/store/configStore.ts](../packages/ui/src/renderer/store/configStore.ts#L95).
- Session optimistic patch writes arbitrary partials in [packages/ui/src/renderer/store/sessionStore.ts](../packages/ui/src/renderer/store/sessionStore.ts#L60-L62).

Rerender risk:
Components subscribed to `workingDirs`, `specifyCommand`, or session fields may rerender even for no-op updates.

Best-practice refactor:
- Add shallow equality guards before `set` for unchanged scalar/array values.
- Normalize writes through helper methods that compare previous and next state.
- For session patches, skip `set` when patch does not actually change any field.

---

### 4. Medium-High: Broad store subscriptions in list-heavy components amplify render fan-out

Why this matters:
Components like `RepoList` and `ActivityPanel` subscribe to broad data slices, then derive local values in render. Large collection updates trigger rerender of entire sections.

Evidence:
- Multiple subscriptions in [packages/ui/src/renderer/components/sidebar/RepoList.tsx](../packages/ui/src/renderer/components/sidebar/RepoList.tsx#L11-L20).
- Whole `specs` array subscription in [packages/ui/src/renderer/components/activity/ActivityPanel.tsx](../packages/ui/src/renderer/components/activity/ActivityPanel.tsx#L81).
- Selection computed via `.find` each render in [packages/ui/src/renderer/components/activity/ActivityPanel.tsx](../packages/ui/src/renderer/components/activity/ActivityPanel.tsx#L84).

Rerender risk:
Changes to any spec entry can rerender activity panel even if selected spec is unchanged.

Best-practice refactor:
- Introduce selector helpers (`selectSelectedSpec`, `selectVisibleRepos`) to subscribe to minimal slices.
- Use selector equality (`zustand/shallow`) when selecting object tuples.
- Keep list item components memoized and pass stable primitive props when possible.

---

### 5. Medium: Duplicate subscription initialization paths create avoidable effect churn

Why this matters:
Initialization is triggered from more than one location. While guarded by `subscriptionsReady`, these duplicate effects still run and add complexity.

Evidence:
- App-level initialization in [packages/ui/src/renderer/pages/Main.tsx](../packages/ui/src/renderer/pages/Main.tsx#L113-L116).
- Repo list initialization also runs in [packages/ui/src/renderer/components/sidebar/RepoList.tsx](../packages/ui/src/renderer/components/sidebar/RepoList.tsx#L22).

Rerender risk:
Not a direct major render cost, but it increases effect activity and makes state-flow harder to reason about.

Best-practice refactor:
- Centralize store subscription bootstrap once at app root.
- Keep leaf components render-only where possible.

---

### 6. Medium: Non-memoized list item component with local hover state in large trees

Why this matters:
`RepoItem` is used in dynamic lists and trees but is not memoized. Parent updates can cause many item rerenders even if item props did not change.

Evidence:
- Component is non-memoized in [packages/ui/src/renderer/components/sidebar/RepoItem.tsx](../packages/ui/src/renderer/components/sidebar/RepoItem.tsx#L42).
- Local state is managed per item in [packages/ui/src/renderer/components/sidebar/RepoItem.tsx](../packages/ui/src/renderer/components/sidebar/RepoItem.tsx#L44).

Rerender risk:
Large repo lists can feel less responsive during scan progress and search/filter updates.

Best-practice refactor:
- Wrap `RepoItem` in `React.memo`.
- Ensure parent passes stable callbacks (`onSelect`, `onTogglePin`) and stable primitive props.
- Consider moving hover styles to CSS-only for zero state updates where feasible.

---

### 7. Medium: Session restoration effects can trigger repeated coordination work

Why this matters:
Session restoration hooks run based on `repos`/`specs` changes and call coordinator methods that may perform updates repeatedly.

Evidence:
- Restore call effect in [packages/ui/src/renderer/hooks/useSessionRestoration.ts](../packages/ui/src/renderer/hooks/useSessionRestoration.ts#L36).
- Spec validation effect in [packages/ui/src/renderer/hooks/useSessionRestoration.ts](../packages/ui/src/renderer/hooks/useSessionRestoration.ts#L44).

Rerender risk:
Potential for repeated no-op updates during startup and repository refresh cycles.

Best-practice refactor:
- Add idempotent guards in coordinator methods (return early if target state already matches).
- Use explicit restoration phase flags (`idle`, `restoring`, `restored`) to avoid repeated orchestration.

## SOLID/DRY Follow-up (Delta from prior review)

- Positive: cross-store dynamic imports were replaced by `SessionCoordinator`, which is a clear improvement for dependency direction and maintainability.
- Remaining DRY opportunity: async action boilerplate still repeats across stores (`isLoading`/`error` lifecycle patterns).
- Remaining SRP opportunity: `MainPage` still combines orchestration, UI state restoration, navigation state, and render composition.

## Rerender Prevention Playbook (Recommended Standard)

1. Component boundaries:
- Keep container components thin; move heavy derivations and handlers into memoized child modules.

2. Store selectors:
- Subscribe to the smallest possible slice.
- Use selector equality (`shallow`) for object/tuple selectors.

3. State writes:
- Guard `set` calls with previous vs next checks.
- Avoid replacing arrays/objects when values are unchanged.

4. Lists and trees:
- Memoize item components (`React.memo`).
- Keep keys stable and callbacks stable.
- Precompute lookup maps with `useMemo`.

5. Effects:
- Centralize initialization effects at root.
- Make coordinator operations idempotent.

## Suggested Refactor Sequence

1. Stabilize `MainPage` prop identities and extract memoized child boundaries.
2. Memoize `WorktreesView` derivations and convert list rows/cards to memoized components.
3. Add no-op guards in `configStore` and `sessionStore` writes.
4. Introduce selector helpers for `ActivityPanel` and `RepoList`.
5. Consolidate subscription initialization and harden session restoration idempotency.

## Conclusion

The architecture direction is improving, especially around cross-store coordination. The current top performance risk is render fan-out in page-level composition and list-heavy views. Applying the rerender playbook above will reduce unnecessary paint/update work without requiring major architecture upheaval.
