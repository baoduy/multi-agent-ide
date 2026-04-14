/**
 * useKeyboardShortcuts — global keyboard shortcuts for the dock layout.
 *
 * Shortcuts:
 *   Cmd+B          Toggle left sidebar
 *   Cmd+Alt+B      Toggle right sidebar (secondary side bar)
 *   Cmd+J          Toggle bottom panel
 *   Cmd+Shift+E    Focus repos (left sidebar)
 *   Cmd+\          Reset layout to default
 *
 * Uses Cmd on macOS, Ctrl on other platforms.
 */

import { useEffect } from "react";
import { useLayoutStore } from "./layoutStore";
import { useRepoStore } from "../../store/repoStore";

export function useKeyboardShortcuts(): void {
  const toggleRegionCollapse = useLayoutStore((s) => s.toggleRegionCollapse);
  const resetLayout = useLayoutStore((s) => s.resetLayout);
  const openTab = useLayoutStore((s) => s.openTab);
  const setRegionCollapsed = useLayoutStore((s) => s.setRegionCollapsed);
  const bottomTabs = useLayoutStore((s) => s.layout.bottom.tabs);
  const activeRepoPath = useRepoStore((s) => s.activeRepoPath);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;

      // Cmd+B — toggle left sidebar
      if (e.key === "b" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggleRegionCollapse("left");
        return;
      }

      // Cmd+Alt+B — toggle right sidebar
      if (e.key === "b" && !e.shiftKey && e.altKey) {
        e.preventDefault();
        toggleRegionCollapse("right");
        return;
      }

      // Cmd+J — toggle bottom panel
      if (e.key === "j" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (bottomTabs.length === 0 && activeRepoPath) {
          // Open terminal as default bottom tab
          openTab("bottom", {
            tabId: "tab-bottom-terminal",
            viewId: "terminal-session",
            props: { cwd: activeRepoPath },
          });
          setRegionCollapsed("bottom", false);
        } else {
          toggleRegionCollapse("bottom");
        }
        return;
      }

      // Cmd+\ — reset layout
      if (e.key === "\\" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        resetLayout();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleRegionCollapse, resetLayout, openTab, setRegionCollapsed, bottomTabs, activeRepoPath]);
}
