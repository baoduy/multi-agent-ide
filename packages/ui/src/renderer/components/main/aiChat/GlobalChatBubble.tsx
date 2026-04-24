import React from "react";
import { useLayoutStore } from "../../dock/layoutStore";
import { useActiveEditorStore } from "../../../store/activeEditorStore";
import { ChatBubble } from "./ChatBubble";

/**
 * App-level AI chat bubble host. Anchored to the viewport via the ChatBubble's
 * own `position: fixed`. Visible only when the currently-active dock tab in
 * the center pane is a file viewer or diff viewer — everything else
 * (welcome screen, settings, workflow, agent sessions, terminals) hides it.
 *
 * Two signals combined:
 *   - `layoutStore.center.activeTabId` + the tab list tells us *which file*
 *     the user is currently looking at. This is the authoritative signal —
 *     not `sessionStore.selectedFilePath`, which is only set when the user
 *     clicks a file in the sidebar and doesn't track dock tab focus.
 *   - `activeEditorStore.entries[filePath]` gives us the editor ref + repo
 *     context that the active file's viewer registered on mount. FileViewer
 *     (markdown/edit) registers a real ref; DiffViewer and non-markdown
 *     viewers register with a null ref.
 *
 * Mount once per layout.
 */
const FILE_VIEW_IDS = new Set(["file-viewer", "diff-viewer"]);

export function GlobalChatBubble(): React.ReactElement | null {
  const activeTabId = useLayoutStore((s) => s.layout.center.activeTabId);
  const activeTab = useLayoutStore((s) =>
    activeTabId ? s.layout.center.tabs.find((t) => t.tabId === activeTabId) : undefined,
  );

  const filePath =
    activeTab && FILE_VIEW_IDS.has(activeTab.viewId)
      ? ((activeTab.props?.filePath as string | undefined) ?? null)
      : null;

  const entry = useActiveEditorStore((s) =>
    filePath ? s.entries[filePath] : undefined,
  );

  if (!filePath || !entry) return null;

  return (
    <ChatBubble
      filePath={filePath}
      repoPath={entry.repoPath}
      editorRef={entry.editorRef}
      readOnly={entry.readOnly}
    />
  );
}
