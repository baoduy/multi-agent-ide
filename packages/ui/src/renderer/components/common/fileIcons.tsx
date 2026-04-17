import React from "react";
import { Icon } from "@iconify/react";
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

/* ── Icon descriptor (legacy shape retained for backward compatibility) ── */

export type FileIconInfo = {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  color: string;
  label: string;
};

/* ── Lucide fallback map ─────────────────────────────────────────
 * Kept so `getFileIconInfo()` (legacy API) still returns a usable
 * descriptor for any call sites that need it. `FileIconBadge` itself
 * renders via Iconify (see below).
 */

const EXT_MAP: Record<string, FileIconInfo> = {
  md:   { Icon: FileText, color: colors.iconBlue,    label: "MD" },
  mdx:  { Icon: FileText, color: colors.iconBlue,    label: "MDX" },
  txt:  { Icon: FileType, color: colors.iconNeutral, label: "TXT" },
  json: { Icon: FileJson, color: colors.iconOrange,  label: "JSON" },
  yaml: { Icon: FileCode, color: colors.iconPurple,  label: "YAML" },
  yml:  { Icon: FileCode, color: colors.iconPurple,  label: "YML" },
  toml: { Icon: FileCode, color: colors.iconPurple,  label: "TOML" },
  cfg:  { Icon: Settings, color: colors.iconNeutral, label: "CFG" },
  env:  { Icon: Settings, color: colors.iconNeutral, label: "ENV" },
  ini:  { Icon: Settings, color: colors.iconNeutral, label: "INI" },
  ts:   { Icon: FileCode, color: colors.iconBlue,    label: "TS" },
  tsx:  { Icon: FileCode, color: colors.iconBlue,    label: "TSX" },
  js:   { Icon: FileCode, color: colors.iconGold,    label: "JS" },
  jsx:  { Icon: FileCode, color: colors.iconGold,    label: "JSX" },
  py:   { Icon: FileCode, color: colors.iconBlue,    label: "PY" },
  sh:   { Icon: Terminal, color: colors.iconGreen,   label: "SH" },
  bash: { Icon: Terminal, color: colors.iconGreen,   label: "BASH" },
  zsh:  { Icon: Terminal, color: colors.iconGreen,   label: "ZSH" },
  html: { Icon: Globe,    color: colors.iconOrange,  label: "HTML" },
  css:  { Icon: Hash,     color: colors.iconBlue,    label: "CSS" },
  scss: { Icon: Hash,     color: colors.iconPink,    label: "SCSS" },
  svg:  { Icon: Palette,  color: colors.iconGold,    label: "SVG" },
  png:  { Icon: Image,    color: colors.iconGreen,   label: "PNG" },
  jpg:  { Icon: Image,    color: colors.iconGreen,   label: "JPG" },
  jpeg: { Icon: Image,    color: colors.iconGreen,   label: "JPEG" },
  gif:  { Icon: Image,    color: colors.iconGreen,   label: "GIF" },
  webp: { Icon: Image,    color: colors.iconGreen,   label: "WEBP" },
  rs:   { Icon: FileCode, color: colors.iconBrown,   label: "RS" },
  go:   { Icon: FileCode, color: colors.iconCyan,    label: "GO" },
  java: { Icon: FileCode, color: colors.iconBrown,   label: "JAVA" },
  sql:  { Icon: FileCode, color: colors.iconGold,    label: "SQL" },
  graphql: { Icon: FileCode, color: colors.iconPink,   label: "GQL" },
  proto:   { Icon: FileCode, color: colors.iconPurple, label: "PROTO" },
  lock:    { Icon: File,     color: colors.iconNeutral, label: "LOCK" },
};

const DEFAULT_FILE_ICON: FileIconInfo = { Icon: File, color: colors.iconNeutral, label: "" };
const FOLDER_ICON: FileIconInfo       = { Icon: Folder, color: colors.iconNeutral, label: "" };
const FOLDER_OPEN_ICON: FileIconInfo  = { Icon: FolderOpen, color: colors.iconNeutral, label: "" };
const FOLDER_CODE_ICON: FileIconInfo  = { Icon: FolderCode, color: colors.iconPurple, label: "" };

/* ── Iconify (vscode-icons) map — powers the visible FileIconBadge ── */

const VSCODE_EXT_MAP: Record<string, string> = {
  // TypeScript / JavaScript
  ts:   "vscode-icons:file-type-typescript-official",
  tsx:  "vscode-icons:file-type-reactts",
  js:   "vscode-icons:file-type-js-official",
  jsx:  "vscode-icons:file-type-reactjs",
  mjs:  "vscode-icons:file-type-js-official",
  cjs:  "vscode-icons:file-type-js-official",

  // Markdown / text
  md:   "vscode-icons:file-type-markdown",
  mdx:  "vscode-icons:file-type-mdx",
  txt:  "vscode-icons:file-type-text",

  // Data / Config
  json: "vscode-icons:file-type-json",
  yaml: "vscode-icons:file-type-yaml",
  yml:  "vscode-icons:file-type-yaml",
  toml: "vscode-icons:file-type-toml",
  xml:  "vscode-icons:file-type-xml",
  env:  "vscode-icons:file-type-dotenv",
  ini:  "vscode-icons:file-type-ini",
  cfg:  "vscode-icons:file-type-config",
  lock: "vscode-icons:file-type-lock",

  // Web
  html: "vscode-icons:file-type-html",
  css:  "vscode-icons:file-type-css",
  scss: "vscode-icons:file-type-scss",
  sass: "vscode-icons:file-type-sass",
  less: "vscode-icons:file-type-less",

  // Languages
  py:    "vscode-icons:file-type-python",
  rs:    "vscode-icons:file-type-rust",
  go:    "vscode-icons:file-type-go-gopher",
  java:  "vscode-icons:file-type-java",
  kt:    "vscode-icons:file-type-kotlin",
  swift: "vscode-icons:file-type-swift",
  rb:    "vscode-icons:file-type-ruby",
  php:   "vscode-icons:file-type-php",
  c:     "vscode-icons:file-type-c",
  h:     "vscode-icons:file-type-cheader",
  cpp:   "vscode-icons:file-type-cpp",
  cs:    "vscode-icons:file-type-csharp",

  // Shell
  sh:   "vscode-icons:file-type-shell",
  bash: "vscode-icons:file-type-shell",
  zsh:  "vscode-icons:file-type-shell",
  fish: "vscode-icons:file-type-shell",

  // Images
  svg:  "vscode-icons:file-type-svg",
  png:  "vscode-icons:file-type-image",
  jpg:  "vscode-icons:file-type-image",
  jpeg: "vscode-icons:file-type-image",
  gif:  "vscode-icons:file-type-image",
  webp: "vscode-icons:file-type-image",

  // DB / API
  sql:     "vscode-icons:file-type-sql",
  graphql: "vscode-icons:file-type-graphql",
  proto:   "vscode-icons:file-type-protobuf",

  // Docker / CI
  dockerfile:   "vscode-icons:file-type-docker",
  dockerignore: "vscode-icons:file-type-docker",
};

const DEFAULT_VSCODE_ICON = "vscode-icons:default-file";

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
 * Renders a coloured VSCode-style file-type icon (22×22 container).
 * Uses Iconify + the vscode-icons pack for authentic per-extension glyphs.
 */
export function FileIconBadge({
  fileName,
  size = 16,
}: {
  fileName: string;
  size?: number;
}): React.ReactElement {
  const ext = getFileExtension(fileName);
  const iconName = VSCODE_EXT_MAP[ext] ?? DEFAULT_VSCODE_ICON;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        flexShrink: 0,
      }}
    >
      <Icon icon={iconName} width={size} height={size} />
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
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 600,
        textTransform: "uppercase",
        color: colors.textTertiary,
        background: colors.bgMuted,
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
