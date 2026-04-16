import React from "react";

/**
 * Props compatible with lucide-react's icon signature so these components can
 * be used anywhere a `LucideIcon` is accepted (e.g. inside
 * {@link ContextMenuAction.Icon}).
 *
 * The icons below are **multi-colour** — their palette is baked into the
 * underlying SVG paths, so the `color` and `strokeWidth` props are accepted
 * for type compatibility but have no visual effect. To mute them (e.g. when
 * rendered inside a disabled menu item) wrap the element in a container that
 * adjusts `opacity` or applies a `filter`; the context menu already lowers
 * the opacity of disabled rows, so no per-icon work is needed.
 */
export type BrandIconProps = {
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
  style?: React.CSSProperties;
  className?: string;
};

/**
 * Visual Studio Code mark (blue palette) — sourced from the icons8
 * `visual-studio-code` SVG. The three-path composition is preserved verbatim
 * so the shading matches the official product mark.
 */
function VsCodeIconComponent({
  size = 16,
  style,
  className,
}: BrandIconProps): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      style={style}
      className={className}
      aria-hidden="true"
    >
      <path
        fill="#29b6f6"
        d="M44,11.11v25.78c0,1.27-0.79,2.4-1.98,2.82l-8.82,4.14L34,33V15L33.2,4.15l8.82,4.14 C43.21,8.71,44,9.84,44,11.11z"
      />
      <path
        fill="#0277bd"
        d="M9,33.896L34,15V5.353c0-1.198-1.482-1.758-2.275-0.86L4.658,29.239 c-0.9,0.83-0.849,2.267,0.107,3.032c0,0,1.324,1.232,1.803,1.574C7.304,34.37,8.271,34.43,9,33.896z"
      />
      <path
        fill="#0288d1"
        d="M9,14.104L34,33v9.647c0,1.198-1.482,1.758-2.275,0.86L4.658,18.761 c-0.9-0.83-0.849-2.267,0.107-3.032c0,0,1.324-1.232,1.803-1.574C7.304,13.63,8.271,13.57,9,14.104z"
      />
    </svg>
  );
}

export const VsCodeIcon = React.memo(VsCodeIconComponent);

/**
 * Visual Studio mark (purple palette) — sourced from the icons8
 * `visual-studio` SVG. Used alongside {@link VsCodeIcon} to distinguish
 * session-level actions from workspace-level actions in the context menu.
 */
function VisualStudioIconComponent({
  size = 16,
  style,
  className,
}: BrandIconProps): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      style={style}
      className={className}
      aria-hidden="true"
    >
      <path
        fill="#ce93d8"
        d="M44,11.11v25.78c0,1.27-0.79,2.4-1.98,2.82l-8.82,4.14L34,33V15L33.2,4.15l8.82,4.14 C43.21,8.71,44,9.84,44,11.11z"
      />
      <path
        fill="#8e24aa"
        d="M4.416,33.815l3.159,1.95c0.733,0.44,1.664,0.365,2.318-0.185L34,15.938V5.353 c0-1.198-1.482-1.758-2.275-0.86L9,29.873L4.416,33.815z"
      />
      <path
        fill="#ab47bc"
        d="M4.416,14.185l3.159-1.95c0.733-0.44,1.664-0.365,2.318,0.185L34,32.063v10.585 c0,1.198-1.482,1.758-2.275,0.86L9,18.127L4.416,14.185z"
      />
      <path
        fill="#6a1b9a"
        d="M9,18.13v11.74l-3.2,3.74C5.22,34.37,4,33.96,4,33V15c0-0.96,1.22-1.37,1.8-0.61L9,18.13z"
      />
    </svg>
  );
}

export const VisualStudioIcon = React.memo(VisualStudioIconComponent);
