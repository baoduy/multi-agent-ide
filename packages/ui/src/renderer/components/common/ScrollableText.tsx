import React, { useRef, useState, useCallback, useEffect } from "react";

/**
 * ScrollableText — single-line text that scrolls on hover when truncated.
 *
 * Renders text with `overflow: hidden; white-space: nowrap` and clips without
 * an ellipsis — we deliberately don't show "…" at rest because it adds visual
 * noise in dense lists. On hover, if the text overflows its container, it
 * smoothly translates left so the user can read the full content. On mouse
 * leave the text slides back.
 *
 * Usage:
 *   <ScrollableText style={{ fontSize: 11, fontWeight: 600 }}>
 *     {someLongText}
 *   </ScrollableText>
 */

type ScrollableTextProps = {
  children: React.ReactNode;
  /** Extra inline styles applied to the outer container. */
  style?: React.CSSProperties;
  /** Scroll speed in px/s. Default: 30 */
  speed?: number;
  /** Classname on the outer span. */
  className?: string;
  /** Title attribute (falls back to children text). */
  title?: string;
};

export const ScrollableText = React.memo(function ScrollableText({
  children,
  style,
  speed = 30,
  className,
  title,
}: ScrollableTextProps): React.ReactElement {
  const outerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [overflow, setOverflow] = useState(0); // px the text exceeds container
  const animRef = useRef<number | null>(null);
  const offsetRef = useRef(0);

  // Measure overflow on hover
  const handleMouseEnter = useCallback(() => {
    setHovered(true);
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (outer && inner) {
      const diff = inner.scrollWidth - outer.clientWidth;
      setOverflow(diff > 1 ? diff : 0);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    setOverflow(0);
  }, []);

  // Animate scroll
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    if (!hovered || overflow <= 0) {
      // Reset position smoothly
      if (offsetRef.current !== 0) {
        inner.style.transition = "transform 0.3s ease-out";
        inner.style.transform = "translateX(0)";
        offsetRef.current = 0;
      }
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      return;
    }

    // Start scrolling after a brief pause
    inner.style.transition = "none";
    inner.style.transform = "translateX(0)";
    offsetRef.current = 0;

    let lastTime: number | null = null;
    let paused = true;

    const pauseTimeout = setTimeout(() => {
      paused = false;
    }, 400); // 400ms pause before scrolling starts

    const step = (time: number) => {
      if (paused) {
        lastTime = time;
        animRef.current = requestAnimationFrame(step);
        return;
      }

      if (lastTime === null) lastTime = time;
      const dt = (time - lastTime) / 1000; // seconds
      lastTime = time;

      offsetRef.current += speed * dt;

      // Add 8px padding at the end so text doesn't butt against the edge
      const maxOffset = overflow + 8;
      if (offsetRef.current >= maxOffset) {
        offsetRef.current = maxOffset;
        inner.style.transform = `translateX(-${maxOffset}px)`;
        // Hold at end — don't loop
        return;
      }

      inner.style.transform = `translateX(-${offsetRef.current}px)`;
      animRef.current = requestAnimationFrame(step);
    };

    animRef.current = requestAnimationFrame(step);

    return () => {
      clearTimeout(pauseTimeout);
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    };
  }, [hovered, overflow, speed]);

  // Clean up transform on unmount
  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // Compute title — use explicit prop, or stringified children
  const resolvedTitle =
    title ?? (typeof children === "string" ? children : undefined);

  return (
    <span
      ref={outerRef}
      className={className}
      title={resolvedTitle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        display: "block",
        overflow: "hidden",
        textOverflow: "clip",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span
        ref={innerRef}
        style={{
          display: "inline-block",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </span>
    </span>
  );
});
