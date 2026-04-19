import React, { forwardRef } from "react";
import {
  NotionEditor,
  type NotionEditorMethods,
  type NotionEditorProps,
} from "./notionEditor/NotionEditor";

export type MarkdownEditorMethods = NotionEditorMethods;
export type MarkdownEditorProps = NotionEditorProps;

/**
 * Public entry point for Magenta's markdown editor. Currently a thin
 * re-export of {@link NotionEditor}; kept as its own module so callers can
 * import a stable name without knowing about the block-based implementation
 * underneath.
 */
export const MarkdownEditor = forwardRef<MarkdownEditorMethods, MarkdownEditorProps>(
  function MarkdownEditor(props, ref) {
    return <NotionEditor ref={ref} {...props} />;
  },
);
