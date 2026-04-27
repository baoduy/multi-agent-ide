import { dirnameOf } from "./fileViewerUtils";

/**
 * Convert relative `![alt](path)` image references in a markdown source
 * into absolute `file://` URLs anchored at the markdown file's directory,
 * so Electron can actually load them when rendered through BlockNote.
 *
 * Why: the renderer is loaded via `loadFile(.../renderer/index.html)`, so
 * a raw `<img src="App.png">` resolves relative to the renderer bundle,
 * not the open document. Rewriting to `file:///<repo>/App.png` lets the
 * standard file:// fetch satisfy the request.
 *
 * Already-absolute references (`http(s)://`, `file://`, `data:`, leading
 * `/`, etc.) pass through unchanged.
 */
export function absolutizeImagePaths(markdown: string, mdFilePath: string): string {
  const mdDir = dirnameOf(mdFilePath);
  if (!mdDir) return markdown;
  return markdown.replace(IMAGE_LINK_RE, (full, alt: string, src: string, tail: string) => {
    if (isAbsoluteOrUrl(src)) return full;
    const abs = `${mdDir}/${src}`.replace(/\/+/g, "/");
    return `![${alt}](${toFileUrl(abs)}${tail})`;
  });
}

/**
 * Inverse of {@link absolutizeImagePaths}: turn `file:///<mdDir>/foo.png`
 * references back into repo-relative paths so the saved markdown stays
 * portable across clones. Other URL forms are left alone.
 */
export function relativizeImagePaths(markdown: string, mdFilePath: string): string {
  const mdDir = dirnameOf(mdFilePath);
  if (!mdDir) return markdown;
  const prefix = toFileUrl(mdDir) + "/";
  return markdown.replace(IMAGE_LINK_RE, (full, alt: string, src: string, tail: string) => {
    if (!src.startsWith(prefix)) return full;
    const rel = decodeURI(src.slice(prefix.length));
    return `![${alt}](${rel}${tail})`;
  });
}

/** Match `![alt](src)` and `![alt](src "title")` — captures src and the
 *  optional `" "title"` tail so we can preserve titles on rewrite. */
const IMAGE_LINK_RE = /!\[([^\]]*)\]\(([^()\s]+)((?:\s+"[^"]*")?)\)/g;

function isAbsoluteOrUrl(src: string): boolean {
  return (
    src.startsWith("/") ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(src) // any URI scheme: http:, https:, data:, file:, magenta-asset:, etc.
  );
}

function toFileUrl(absPath: string): string {
  // Encode path segments so spaces and other special chars survive — but
  // keep `/` as separators. encodeURI does exactly that.
  return `file://${encodeURI(absPath)}`;
}
