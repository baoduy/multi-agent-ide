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
import type { SideContainerState, SectionState } from "./types";

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

  const sections = container.sections;

  const expandedCount = useMemo(
    () => sections.filter((s: SectionState) => s.expanded).length,
    [sections]
  );

  const handleToggle = useCallback(
    (viewId: string) => toggleSection(region, viewId),
    [region, toggleSection]
  );

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
              flex: section.expanded ? section.size : 0,
              flexBasis: section.expanded ? 0 : "auto",
              flexGrow: section.expanded
                ? section.size / (expandedCount || 1)
                : 0,
              flexShrink: section.expanded ? 1 : 0,
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
            >
              {createElement(descriptor.component, extraProps)}
            </AccordionSection>
          </div>
        );
      })}
    </div>
  );
});
