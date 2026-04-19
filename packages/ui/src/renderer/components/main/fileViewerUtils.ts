/**
 * Small pure helpers used by FileViewer, TableOfContents, and ApproveButton.
 * Kept free of React/DOM dependencies so they can be unit-tested in isolation.
 */

export function isMarkdownFile(filePath: string): boolean {
  return /\.(md|mdx)$/i.test(filePath);
}

export function getFileName(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

/**
 * Virtual path format: `gitref://<branch>/relative/path`.
 * Returns null for regular filesystem paths.
 */
export function parseGitRef(filePath: string): { ref: string; relativePath: string } | null {
  const match = filePath.match(/^gitref:\/\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { ref: match[1], relativePath: match[2] };
}

export function isGitRefPath(filePath: string): boolean {
  return filePath.startsWith("gitref://");
}

/** Slug from heading text (matches rehype-slug's default behaviour). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export type TocHeading = {
  id: string;
  text: string;
  level: number;
  /** Source-order index of this heading. Used to pair against DOM order
   *  when the renderer does not attach `id` attributes (e.g. MDXEditor). */
  index: number;
};

/** Parse raw markdown and extract ATX-style headings, skipping fenced code blocks. */
export function extractHeadings(md: string): TocHeading[] {
  const headings: TocHeading[] = [];
  let inCodeBlock = false;
  let index = 0;

  for (const line of md.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/\*\*/g, "").replace(/\*/g, "").trim();
      headings.push({ id: slugify(text), text, level, index });
      index += 1;
    }
  }

  return headings;
}

/** Return the `.md` file's repo-relative directory, used to compute relative
 *  asset paths. Falls back to the file's parent when no repo is given. */
export function dirnameOf(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  return idx === -1 ? "" : filePath.slice(0, idx);
}

/** Strip an extension (including the dot) from a filename. */
export function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? name : name.slice(0, dot);
}
