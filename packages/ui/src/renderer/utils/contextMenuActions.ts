import type { ContextMenuAction } from "../components/common/ContextMenu";
import { VsCodeIcon, VisualStudioIcon } from "../components/common/VsCodeIcon";
import { openInVscode } from "./ipc";

/**
 * Context-menu action that opens a path in VS Code.
 *
 * Uses the blue VS Code icon by default. Pass `variant: "visual-studio"` for
 * the purple Visual Studio icon (used for secondary/session-level actions).
 */
export function openWithVsCodeAction(
  targetPath: string,
  options?: {
    label?: string;
    disabled?: boolean;
    title?: string;
    variant?: "vscode" | "visual-studio";
  },
): ContextMenuAction {
  const variant = options?.variant ?? "vscode";
  return {
    label: options?.label ?? "Open with Code",
    Icon: variant === "visual-studio" ? VisualStudioIcon : VsCodeIcon,
    disabled: options?.disabled,
    title: options?.title,
    action: () => {
      if (!options?.disabled) void openInVscode(targetPath);
    },
  };
}
