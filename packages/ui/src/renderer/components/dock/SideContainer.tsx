/**
 * SideContainer — left or right sidebar.
 *
 * Renders N DockViews as an accordion stack. Each section can be
 * expanded/collapsed independently. Sections support drag-to-move
 * via grip handle → DragOverlay → drop on target region.
 */

import React, { useMemo, useCallback, createElement, useEffect, useRef } from "react";
import { useLayoutStore } from "./layoutStore";
import { viewRegistry } from "./ViewRegistry";
import { AccordionSection } from "./AccordionSection";
import { useViewSearchStore } from "../../store/viewSearchStore";
import { useMarkdownPreviewStore } from "../../store/markdownPreviewStore";
import type { SideContainerState, SectionState, ActivityBarGroup } from "./types";

type SideContainerProps = {
  region: "left" | "right";
  /** Extra props to pass down to individual view components */
  viewProps?: Record<string, Record<string, unknown>>;
};

export const SideContainer = React.memo(function SideContainer({
  region,
  viewProps,
}: SideContainerProps): React.ReactElement | null {
  const container: SideContainerState = useLayoutStore(
    (s) => s.layout[region]
  );
  const toggleSection = useLayoutStore((s) => s.toggleSection);
  const setSectionExpanded = useLayoutStore((s) => s.setSectionExpanded);

  // ── Context-aware auto-collapse for the right sidebar ──
  const centerActiveTabId = useLayoutStore((s) => s.layout.center.activeTabId);
  const centerTabs = useLayoutStore((s) => s.layout.center.tabs);

  // Resolve the active center tab's viewId
  const activeCenterViewId = useMemo(() => {
    const tab = centerTabs.find((t) => t.tabId === centerActiveTabId);
    return tab?.viewId ?? null;
  }, [centerTabs, centerActiveTabId]);

  // Track previous viewId so we only act on actual changes
  const prevCenterViewIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (region !== "right") return;
    if (activeCenterViewId === prevCenterViewIdRef.current) return;
    prevCenterViewIdRef.current = activeCenterViewId;

    if (!activeCenterViewId) return;

    const SPECS_VIEW_IDS = new Set(["specs-list", "file-viewer", "diff-viewer", "workflow", "worktrees"]);
    const AI_VIEW_IDS = new Set(["ai-sessions", "agent-session", "terminal-session"]);

    if (SPECS_VIEW_IDS.has(activeCenterViewId)) {
      // Specs / file context: show spec-files, hide repo-changes
      setSectionExpanded("right", "spec-files", true);
      setSectionExpanded("right", "repo-changes", false);
    } else if (AI_VIEW_IDS.has(activeCenterViewId)) {
      // AI context: show repo-changes, hide spec-files
      setSectionExpanded("right", "spec-files", false);
      setSectionExpanded("right", "repo-changes", true);
    }
  }, [region, activeCenterViewId, setSectionExpanded]);

  // For the left sidebar, filter sections to only those in the active group
  const activeGroupId = useLayoutStore((s) => s.layout.activityBar.activeGroupId);
  const groups = useLayoutStore((s) => s.layout.activityBar.groups);

  // Hide the markdown-toc panel entirely when no file is in preview mode —
  // the panel only earns its spot in the right sidebar alongside an active
  // markdown preview (user requirement).
  const previewActive = useMarkdownPreviewStore((s) => s.active !== null);

  const sections = useMemo(() => {
    const activeGroup = groups.find((g: ActivityBarGroup) => g.id === activeGroupId);
    if (!activeGroup) return container.sections;

    if (region === "left") {
      const allowedIds = new Set(activeGroup.viewIds);
      return container.sections.filter((s: SectionState) => allowedIds.has(s.viewId));
    }

    // Right sidebar: filter by rightViewIds when present, then hide
    // context-dependent panels when their trigger isn't active.
    if (region === "right") {
      const rightIds = activeGroup.rightViewIds;
      if (!rightIds || rightIds.length === 0) return [];
      const allowedIds = new Set(rightIds);
      return container.sections.filter((s: SectionState) => {
        if (!allowedIds.has(s.viewId)) return false;
        if (s.viewId === "markdown-toc" && !previewActive) return false;
        return true;
      });
    }

    return container.sections;
  }, [region, container.sections, activeGroupId, groups, previewActive]);

  const expandedCount = useMemo(
    () => sections.filter((s: SectionState) => s.expanded).length,
    [sections]
  );

  const handleToggle = useCallback(
    (viewId: string) => toggleSection(region, viewId),
    [region, toggleSection]
  );

  const searchQueries = useViewSearchStore((s) => s.queries);
  const setSearchQuery = useViewSearchStore((s) => s.setQuery);

  if (container.collapsed) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        overflow: "hidden",
      }}
    >
      {sections.map((section: SectionState) => {
        const descriptor = viewRegistry.get(section.viewId);
        if (!descriptor) return null;

        const extraProps = viewProps?.[section.viewId] ?? {};

        return (
          <div
            key={section.viewId}
            style={{
              flexGrow: section.expanded
                ? section.size / (expandedCount || 1)
                : 0,
              flexShrink: section.expanded ? 1 : 0,
              flexBasis: section.expanded ? 0 : "auto",
              minHeight: section.expanded ? 80 : 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <AccordionSection
              viewId={section.viewId}
              title={descriptor.title}
              icon={descriptor.icon}
              expanded={section.expanded}
              onToggle={() => handleToggle(section.viewId)}
              region={region}
              searchable={descriptor.searchable}
              searchPlaceholder={descriptor.searchPlaceholder}
              searchQuery={searchQueries[section.viewId] ?? ""}
              onSearchChange={(q) => setSearchQuery(section.viewId, q)}
            >
              {createElement(descriptor.component, extraProps)}
            </AccordionSection>
          </div>
        );
      })}
    </div>
  );
});
