import React from "react";
import { Icon, addCollection } from "@iconify/react";
import { icons as materialIconTheme } from "@iconify-json/material-icon-theme";

// Preload the material-icon-theme pack so icons render offline (packaged
// Electron app has no network → Iconify API fetch would fail silently).
// Uses the package's named ESM export, which bundles reliably through Vite.
addCollection(materialIconTheme);
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

/* ── Iconify (material-icon-theme) map — powers the visible FileIconBadge ── */

const MATERIAL_EXT_MAP: Record<string, string> = {
  // TypeScript / JavaScript
  ts:   "material-icon-theme:typescript",
  tsx:  "material-icon-theme:react-ts",
  js:   "material-icon-theme:javascript",
  jsx:  "material-icon-theme:react",
  mjs:  "material-icon-theme:javascript",
  cjs:  "material-icon-theme:javascript",

  // Markdown / text
  md:   "material-icon-theme:markdown",
  mdx:  "material-icon-theme:mdx",
  txt:  "material-icon-theme:document",

  // Data / Config
  json: "material-icon-theme:json",
  yaml: "material-icon-theme:yaml",
  yml:  "material-icon-theme:yaml",
  toml: "material-icon-theme:settings",
  xml:  "material-icon-theme:xml",
  env:  "material-icon-theme:tune",
  ini:  "material-icon-theme:settings",
  cfg:  "material-icon-theme:settings",
  lock: "material-icon-theme:lock",

  // Web
  html: "material-icon-theme:html",
  css:  "material-icon-theme:css",
  scss: "material-icon-theme:sass",
  sass: "material-icon-theme:sass",
  less: "material-icon-theme:less",

  // Languages
  py:    "material-icon-theme:python",
  rs:    "material-icon-theme:rust",
  go:    "material-icon-theme:go",
  java:  "material-icon-theme:java",
  kt:    "material-icon-theme:kotlin",
  swift: "material-icon-theme:swift",
  rb:    "material-icon-theme:ruby",
  php:   "material-icon-theme:php",
  c:     "material-icon-theme:c",
  h:     "material-icon-theme:h",
  cpp:   "material-icon-theme:cpp",
  cs:    "material-icon-theme:csharp",

  // Shell
  sh:   "material-icon-theme:console",
  bash: "material-icon-theme:console",
  zsh:  "material-icon-theme:console",
  fish: "material-icon-theme:console",

  // Images
  svg:  "material-icon-theme:svg",
  png:  "material-icon-theme:image",
  jpg:  "material-icon-theme:image",
  jpeg: "material-icon-theme:image",
  gif:  "material-icon-theme:image",
  webp: "material-icon-theme:image",

  // DB / API
  sql:     "material-icon-theme:database",
  graphql: "material-icon-theme:graphql",
  proto:   "material-icon-theme:proto",

  // Docker / CI
  dockerfile:   "material-icon-theme:docker",
  dockerignore: "material-icon-theme:docker",
};

const DEFAULT_MATERIAL_ICON = "material-icon-theme:document";

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

/* ── Render helpers ── */

/**
 * Renders a coloured Material-Design file-type icon.
 * Uses Iconify + the material-icon-theme pack for authentic per-extension glyphs.
 */
export function FileIconBadge({
  fileName,
  size = 14,
}: {
  fileName: string;
  size?: number;
}): React.ReactElement {
  const ext = getFileExtension(fileName);
  const iconName = MATERIAL_EXT_MAP[ext] ?? DEFAULT_MATERIAL_ICON;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <Icon icon={iconName} width={size} height={size} />
    </span>
  );
}

/**
 * Renders a folder icon. Uses lucide (outline) — the material-icon-theme
 * pack has no generic "folder" glyph, only per-tech variants like folder-src,
 * so an outline folder matches our muted-monochrome aesthetic best.
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
        width: size,
        height: size,
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
        //fontSize: 9,
        fontWeight: 600,
        textTransform: "uppercase",
        color: colors.textTertiary,
        background: colors.bgMuted,
        padding: "2px 5px",
        borderRadius: 3,
        flexShrink: 0,
        fontFamily: "var(--font-sans)",
      }}
    >
      {ext}
    </span>
  );
}
