import type React from "react";
import { create } from "zustand";
import type { MarkdownEditorMethods } from "../components/main/MarkdownEditor";

/**
 * Registry of editor surfaces currently rendered anywhere in the app — the
 * markdown FileViewer, the DiffViewer, future code panes, etc. FileViewer
 * and DiffViewer add themselves on mount and remove themselves on unmount.
 *
 * The app-level `GlobalChatBubble` looks up the entry for the currently
 * selected file (`sessionStore.selectedFilePath`) and shows the AI chat
 * bubble anchored to the viewport whenever a matching entry exists. This
 * means the bubble is visible only when the user is actually looking at a
 * file or a diff — and automatically hides on the welcome screen, settings,
 * workflow views, etc.
 *
 * `editorRef` is optional: diff panes and non-markdown viewers register
 * with `null`, which scopes chat features to Ask-only for those surfaces
 * (no selection capture, no document apply — the daemon's repo-aware branch
 * still reads the file itself via Claude's Read tool when applicable).
 */
export interface ActiveEditorEntry {
  repoPath: string;
  editorRef: React.RefObject<MarkdownEditorMethods | null> | null;
  readOnly: boolean;
}

type State = {
  entries: Record<string, ActiveEditorEntry>;
  register: (filePath: string, entry: ActiveEditorEntry) => void;
  unregister: (filePath: string) => void;
};

export const useActiveEditorStore = create<State>((set) => ({
  entries: {},
  register(filePath, entry) {
    set((s) => ({ entries: { ...s.entries, [filePath]: entry } }));
  },
  unregister(filePath) {
    set((s) => {
      if (!(filePath in s.entries)) return s;
      const next = { ...s.entries };
      delete next[filePath];
      return { entries: next };
    });
  },
}));
