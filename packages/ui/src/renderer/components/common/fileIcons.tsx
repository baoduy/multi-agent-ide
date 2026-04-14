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
import { colors } from "../../utils/colors";

/* ── Icon descriptor ── */

export type FileIconInfo = {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  color: string;
  label: string;
};

/* ── Extension → icon mapping ── */

const EXT_MAP: Record<string, FileIconInfo> = {
  // Markdown
  md:   { Icon: FileText,  color: colors.iconBlue, label: "MD" },
  mdx:  { Icon: FileText,  color: colors.iconBlue, label: "MDX" },

  // Plain text
  txt:  { Icon: FileType,  color: colors.iconNeutral, label: "TXT" },

  // Data / Config
  json: { Icon: FileJson,  color: colors.iconOrange, label: "JSON" },
  yaml: { Icon: FileCode,  color: colors.iconPurple, label: "YAML" },
  yml:  { Icon: FileCode,  color: colors.iconPurple, label: "YML" },
  toml: { Icon: FileCode,  color: colors.iconPurple, label: "TOML" },
  cfg:  { Icon: Settings,  color: colors.iconNeutral, label: "CFG" },
  env:  { Icon: Settings,  color: colors.iconNeutral, label: "ENV" },
  ini:  { Icon: Settings,  color: colors.iconNeutral, label: "INI" },

  // TypeScript / JavaScript
  ts:   { Icon: FileCode,  color: colors.iconBlue, label: "TS" },
  tsx:  { Icon: FileCode,  color: colors.iconBlue, label: "TSX" },
  js:   { Icon: FileCode,  color: colors.iconGold, label: "JS" },
  jsx:  { Icon: FileCode,  color: colors.iconGold, label: "JSX" },

  // Python
  py:   { Icon: FileCode,  color: colors.iconBlue, label: "PY" },

  // Shell
  sh:   { Icon: Terminal,  color: colors.iconGreen, label: "SH" },
  bash: { Icon: Terminal,  color: colors.iconGreen, label: "BASH" },
  zsh:  { Icon: Terminal,  color: colors.iconGreen, label: "ZSH" },

  // Web
  html: { Icon: Globe,    color: colors.iconOrange, label: "HTML" },
  css:  { Icon: Hash,     color: colors.iconBlue, label: "CSS" },
  scss: { Icon: Hash,     color: colors.iconPink, label: "SCSS" },

  // Images
  svg:  { Icon: Palette,  color: colors.iconGold, label: "SVG" },
  png:  { Icon: Image,    color: colors.iconGreen, label: "PNG" },
  jpg:  { Icon: Image,    color: colors.iconGreen, label: "JPG" },
  jpeg: { Icon: Image,    color: colors.iconGreen, label: "JPEG" },
  gif:  { Icon: Image,    color: colors.iconGreen, label: "GIF" },
  webp: { Icon: Image,    color: colors.iconGreen, label: "WEBP" },

  // Rust / Go / Java
  rs:   { Icon: FileCode,  color: colors.iconBrown, label: "RS" },
  go:   { Icon: FileCode,  color: colors.iconCyan, label: "GO" },
  java: { Icon: FileCode,  color: colors.iconBrown, label: "JAVA" },

  // Misc
  sql:  { Icon: FileCode,  color: colors.iconGold, label: "SQL" },
  graphql: { Icon: FileCode, color: colors.iconPink, label: "GQL" },
  proto: { Icon: FileCode, color: colors.iconPurple, label: "PROTO" },
  lock: { Icon: File,     color: colors.iconNeutral, label: "LOCK" },
};

const DEFAULT_FILE_ICON: FileIconInfo = { Icon: File, color: colors.iconNeutral, label: "" };
const FOLDER_ICON: FileIconInfo       = { Icon: Folder, color: colors.iconNeutral, label: "" };
const FOLDER_OPEN_ICON: FileIconInfo  = { Icon: FolderOpen, color: colors.iconNeutral, label: "" };
const FOLDER_CODE_ICON: FileIconInfo  = { Icon: FolderCode, color: colors.iconPurple, label: "" };

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
        background: `color-mix(in srgb, ${info.color} 14%, transparent)`,
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
        background: `color-mix(in srgb, ${info.color} 14%, transparent)`,
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
        background: `color-mix(in srgb, ${info.color} 12%, transparent)`,
        padding: "2px 5px",
        borderRadius: 3,
        flexShrink: 0,
        fontFamily: "var(--font-mono)",
      }}
    >
      {ext}
    </span>
  );
}
