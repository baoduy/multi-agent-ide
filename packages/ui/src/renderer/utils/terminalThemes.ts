/**
 * Terminal color schemes that match popular OS/app themes.
 * Supports both light and dark modes with full 16-color palette.
 *
 * These themes are compatible with xterm.js ITheme interface.
 */

export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor?: string;
  selection?: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

/**
 * Dark mode theme: Dracula
 * Popular, high contrast, widely used in terminals and editors
 */
const DRACULA_DARK: TerminalTheme = {
  background: "#282a36",
  foreground: "#f8f8f2",
  cursor: "#f8f8f2",
  selection: "rgba(248, 248, 242, 0.2)",
  black: "#21222c",
  red: "#ff5555",
  green: "#50fa7b",
  yellow: "#f1fa8c",
  blue: "#bd93f9",
  magenta: "#ff79c6",
  cyan: "#8be9fd",
  white: "#f8f8f2",
  brightBlack: "#6272a4",
  brightRed: "#ff6e6e",
  brightGreen: "#69ff94",
  brightYellow: "#ffffa5",
  brightBlue: "#d6acff",
  brightMagenta: "#ff92df",
  brightCyan: "#a4ffff",
  brightWhite: "#ffffff",
};

/**
 * Light mode theme: One Light
 * Clean, minimal, popular in light terminal schemes
 */
const ONE_LIGHT: TerminalTheme = {
  background: "#fafafa",
  foreground: "#383a42",
  cursor: "#383a42",
  selection: "rgba(56, 58, 66, 0.2)",
  black: "#383a42",
  red: "#e45649",
  green: "#50a14f",
  yellow: "#c18401",
  blue: "#0184bc",
  magenta: "#a626a4",
  cyan: "#0997b3",
  white: "#fafafa",
  brightBlack: "#a0a1a7",
  brightRed: "#e45649",
  brightGreen: "#50a14f",
  brightYellow: "#c18401",
  brightBlue: "#0184bc",
  brightMagenta: "#a626a4",
  brightCyan: "#0997b3",
  brightWhite: "#ffffff",
};

/**
 * All available terminal themes indexed by system theme.
 * Used by MagentaTerminal to apply OS-aware colors.
 */
export const TERMINAL_THEMES: Record<"light" | "dark", TerminalTheme> = {
  dark: DRACULA_DARK,
  light: ONE_LIGHT,
};
