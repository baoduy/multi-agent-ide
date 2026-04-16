/**
 * SideContainer — left or right sidebar.
 *
 * Renders N DockViews as an accordion stack. Each section can be
 * expanded/collapsed independently. Sections support drag-to-move
 * via grip handle → DragOverlay → drop on target region.
 */

import React, { useMemo, useCallback, createElement } from "react";
import { useLayoutStore } from "./layoutStore";
import { viewRegistry } from "./ViewRegistry";
import { AccordionSection } from "./AccordionSection";
import { useViewSearchStore } from "../../store/viewSearchStore";
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

  // For the left sidebar, filter sections to only those in the active group
  const activeGroupId = useLayoutStore((s) => s.layout.activityBar.activeGroupId);
  const groups = useLayoutStore((s) => s.layout.activityBar.groups);

  const sections = useMemo(() => {
    const activeGroup = groups.find((g: ActivityBarGroup) => g.id === activeGroupId);
    if (!activeGroup) return container.sections;

    if (region === "left") {
      const allowedIds = new Set(activeGroup.viewIds);
      return container.sections.filter((s: SectionState) => allowedIds.has(s.viewId));
    }

    // Right sidebar: filter by rightViewIds when present
    if (region === "right") {
      const rightIds = activeGroup.rightViewIds;
      if (!rightIds || rightIds.length === 0) return [];
      const allowedIds = new Set(rightIds);
      return container.sections.filter((s: SectionState) => allowedIds.has(s.viewId));
    }

    return container.sections;
  }, [region, container.sections, activeGroupId, groups]);

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
