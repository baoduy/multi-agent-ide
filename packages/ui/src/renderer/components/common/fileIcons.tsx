import React from "react";
import {
  File,
  FileText,
  FileJson,
  FileCode,
  FileType,
  Image,
  Settings,
  Terminal,
  Globe,
  Palette,
  Folder,
  FolderOpen,
  FolderCode,
  Hash,
} from "lucide-react";

/* ── Icon descriptor ── */

export type FileIconInfo = {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  color: string;
  label: string;
};

/* ── Extension → icon mapping ── */

const EXT_MAP: Record<string, FileIconInfo> = {
  // Markdown
  md:   { Icon: FileText,  color: "#2563EB", label: "MD" },
  mdx:  { Icon: FileText,  color: "#2563EB", label: "MDX" },

  // Plain text
  txt:  { Icon: FileType,  color: "#6b6560", label: "TXT" },

  // Data / Config
  json: { Icon: FileJson,  color: "#C15F3C", label: "JSON" },
  yaml: { Icon: FileCode,  color: "#7C3AED", label: "YAML" },
  yml:  { Icon: FileCode,  color: "#7C3AED", label: "YML" },
  toml: { Icon: FileCode,  color: "#9B4DCA", label: "TOML" },
  cfg:  { Icon: Settings,  color: "#9a958c", label: "CFG" },
  env:  { Icon: Settings,  color: "#9a958c", label: "ENV" },
  ini:  { Icon: Settings,  color: "#9a958c", label: "INI" },

  // TypeScript / JavaScript
  ts:   { Icon: FileCode,  color: "#3178C6", label: "TS" },
  tsx:  { Icon: FileCode,  color: "#3178C6", label: "TSX" },
  js:   { Icon: FileCode,  color: "#F0DB4F", label: "JS" },
  jsx:  { Icon: FileCode,  color: "#F0DB4F", label: "JSX" },

  // Python
  py:   { Icon: FileCode,  color: "#3776AB", label: "PY" },

  // Shell
  sh:   { Icon: Terminal,  color: "#16A34A", label: "SH" },
  bash: { Icon: Terminal,  color: "#16A34A", label: "BASH" },
  zsh:  { Icon: Terminal,  color: "#16A34A", label: "ZSH" },

  // Web
  html: { Icon: Globe,    color: "#E34C26", label: "HTML" },
  css:  { Icon: Hash,     color: "#264de4", label: "CSS" },
  scss: { Icon: Hash,     color: "#CC6699", label: "SCSS" },

  // Images
  svg:  { Icon: Palette,  color: "#FFB13B", label: "SVG" },
  png:  { Icon: Image,    color: "#16A34A", label: "PNG" },
  jpg:  { Icon: Image,    color: "#16A34A", label: "JPG" },
  jpeg: { Icon: Image,    color: "#16A34A", label: "JPEG" },
  gif:  { Icon: Image,    color: "#16A34A", label: "GIF" },
  webp: { Icon: Image,    color: "#16A34A", label: "WEBP" },

  // Rust / Go / Java
  rs:   { Icon: FileCode,  color: "#DEA584", label: "RS" },
  go:   { Icon: FileCode,  color: "#00ADD8", label: "GO" },
  java: { Icon: FileCode,  color: "#B07219", label: "JAVA" },

  // Misc
  sql:  { Icon: FileCode,  color: "#e38d13", label: "SQL" },
  graphql: { Icon: FileCode, color: "#E535AB", label: "GQL" },
  proto: { Icon: FileCode, color: "#7C3AED", label: "PROTO" },
  lock: { Icon: File,     color: "#9a958c", label: "LOCK" },
};

const DEFAULT_FILE_ICON: FileIconInfo = { Icon: File, color: "#9a958c", label: "" };
const FOLDER_ICON: FileIconInfo       = { Icon: Folder, color: "#C15F3C", label: "" };
const FOLDER_OPEN_ICON: FileIconInfo  = { Icon: FolderOpen, color: "#C15F3C", label: "" };
const FOLDER_CODE_ICON: FileIconInfo  = { Icon: FolderCode, color: "#7C3AED", label: "" };

/* ── Public API ── */

export function getFileIconInfo(fileName: string): FileIconInfo {
  const ext = fileName.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? DEFAULT_FILE_ICON;
}

export function getFileExtension(fileName: string): string {
  return fileName.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? "";
}

export function getFolderIconInfo(isOpen: boolean): FileIconInfo {
  return isOpen ? FOLDER_OPEN_ICON : FOLDER_ICON;
}

export function getRepoFolderIconInfo(): FileIconInfo {
  return FOLDER_CODE_ICON;
}

/* ── Render helpers ── */

/**
 * Renders a small coloured icon badge (22×22) for use in tree views.
 */
export function FileIconBadge({
  fileName,
  size = 14,
}: {
  fileName: string;
  size?: number;
}): React.ReactElement {
  const info = getFileIconInfo(fileName);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        borderRadius: 4,
        background: `${info.color}14`,
        flexShrink: 0,
      }}
    >
      <info.Icon size={size} color={info.color} strokeWidth={1.8} />
    </span>
  );
}

/**
 * Renders a folder icon badge (22×22) for use in tree views.
 */
export function FolderIconBadge({
  isOpen,
  size = 14,
}: {
  isOpen: boolean;
  size?: number;
}): React.ReactElement {
  const info = getFolderIconInfo(isOpen);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        borderRadius: 4,
        background: `${info.color}14`,
        flexShrink: 0,
      }}
    >
      <info.Icon size={size} color={info.color} strokeWidth={1.8} />
    </span>
  );
}

/**
 * Small extension tag badge for file list items.
 */
export function ExtensionBadge({ fileName }: { fileName: string }): React.ReactElement | null {
  const ext = getFileExtension(fileName);
  if (!ext) return null;
  const info = getFileIconInfo(fileName);
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 600,
        textTransform: "uppercase",
        color: info.color,
        background: `${info.color}12`,
        padding: "2px 5px",
        borderRadius: 3,
        flexShrink: 0,
        fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
      }}
    >
      {ext}
    </span>
  );
}
