import React from "react";

type MagentaLogoProps = {
  /** Width and height in pixels (square). Defaults to 28. */
  size?: number;
};

/**
 * Magenta IDE brand mark — a bold "M" with agent node accents
 * on a dark rounded-square background.
 */
export function MagentaLogo({ size = 28 }: MagentaLogoProps): React.ReactElement {
  const themeColor = {
    bgStart: "var(--logo-bg-start)",
    bgEnd: "var(--logo-bg-end)",
    magentaStart: "var(--logo-magenta-start)",
    magentaMid: "var(--logo-magenta-mid)",
    magentaEnd: "var(--logo-magenta-end)",
    accentStart: "var(--logo-accent-start)",
    accentEnd: "var(--logo-accent-end)",
    grid: "var(--logo-grid)",
    nodePrimary: "var(--logo-node-primary)",
    nodeCenter: "var(--logo-node-center)",
    nodeSecondary: "var(--logo-node-secondary)",
    nodeOrbitStart: "var(--logo-node-orbit-start)",
    nodeOrbitEnd: "var(--logo-node-orbit-end)",
  } as const;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="ml-bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={themeColor.bgStart} />
          <stop offset="100%" stopColor={themeColor.bgEnd} />
        </linearGradient>
        <linearGradient id="ml-magentaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={themeColor.magentaStart} />
          <stop offset="50%" stopColor={themeColor.magentaMid} />
          <stop offset="100%" stopColor={themeColor.magentaEnd} />
        </linearGradient>
        <linearGradient id="ml-accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={themeColor.accentStart} stopOpacity="0.6" />
          <stop offset="100%" stopColor={themeColor.accentEnd} stopOpacity="0.6" />
        </linearGradient>
      </defs>

      {/* Background rounded square */}
      <rect x="16" y="16" width="480" height="480" rx="96" ry="96" fill="url(#ml-bgGrad)" />

      {/* Subtle grid */}
      <g opacity="0.06" stroke={themeColor.grid} strokeWidth="1">
        <line x1="96" y1="16" x2="96" y2="496" />
        <line x1="176" y1="16" x2="176" y2="496" />
        <line x1="256" y1="16" x2="256" y2="496" />
        <line x1="336" y1="16" x2="336" y2="496" />
        <line x1="416" y1="16" x2="416" y2="496" />
        <line x1="16" y1="96" x2="496" y2="96" />
        <line x1="16" y1="176" x2="496" y2="176" />
        <line x1="16" y1="256" x2="496" y2="256" />
        <line x1="16" y1="336" x2="496" y2="336" />
        <line x1="16" y1="416" x2="496" y2="416" />
      </g>

      {/* Connection lines between agent nodes */}
      <g stroke="url(#ml-accentGrad)" strokeWidth="2.5" fill="none" opacity="0.5">
        <line x1="128" y1="360" x2="168" y2="200" />
        <line x1="168" y1="200" x2="256" y2="300" />
        <line x1="384" y1="360" x2="344" y2="200" />
        <line x1="344" y1="200" x2="256" y2="300" />
        <line x1="168" y1="200" x2="344" y2="200" />
        <line x1="128" y1="360" x2="256" y2="300" />
        <line x1="384" y1="360" x2="256" y2="300" />
      </g>

      {/* The M shape */}
      <path
        d="M 108 390 L 108 148 L 148 120 L 256 268 L 364 120 L 404 148 L 404 390 L 356 390 L 356 220 L 256 348 L 156 220 L 156 390 Z"
        fill="url(#ml-magentaGrad)"
      />

      {/* Agent node dots */}
      <circle cx="128" cy="134" r="10" fill={themeColor.nodePrimary} opacity="0.9" />
      <circle cx="384" cy="134" r="10" fill={themeColor.nodePrimary} opacity="0.9" />
      <circle cx="256" cy="268" r="12" fill={themeColor.nodeCenter} opacity="0.9" />
      <circle cx="128" cy="390" r="8" fill={themeColor.nodeSecondary} opacity="0.7" />
      <circle cx="384" cy="390" r="8" fill={themeColor.nodeSecondary} opacity="0.7" />

      {/* Small orbiting dots */}
      <circle cx="200" cy="140" r="4" fill={themeColor.nodeOrbitStart} opacity="0.6" />
      <circle cx="312" cy="140" r="4" fill={themeColor.nodeOrbitStart} opacity="0.6" />
      <circle cx="180" cy="310" r="3.5" fill={themeColor.nodeOrbitEnd} opacity="0.5" />
      <circle cx="332" cy="310" r="3.5" fill={themeColor.nodeOrbitEnd} opacity="0.5" />
    </svg>
  );
}
