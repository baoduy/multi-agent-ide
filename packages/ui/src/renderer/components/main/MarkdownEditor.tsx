import React, { forwardRef } from "react";
import {
  BlockNoteEditor,
  type EditorSelection,
  type BlockNoteEditorMethods,
  type BlockNoteEditorProps,
} from "./blockNoteEditor/BlockNoteEditor";

export type MarkdownEditorMethods = BlockNoteEditorMethods;
export type MarkdownEditorProps = BlockNoteEditorProps;
export type { EditorSelection };

/**
 * Public entry point for Magenta's markdown editor. Thin re-export of
 * {@link BlockNoteEditor}; kept as its own module so callers can import a
 * stable name without knowing about the block-based implementation underneath.
 */
export const MarkdownEditor = forwardRef<MarkdownEditorMethods, MarkdownEditorProps>(
  function MarkdownEditor(props, ref) {
    return <BlockNoteEditor ref={ref} {...props} />;
  },
);
