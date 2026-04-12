import stripAnsi from "strip-ansi";

/**
 * Maximum title length (characters). Longer inputs are truncated with "…".
 */
const MAX_TITLE_LENGTH = 120;

/**
 * Accumulates PTY input chunks for a single session until the user
 * submits their first message (presses Enter). Returns the extracted
 * title once a newline is detected, or `null` if still accumulating.
 *
 * Usage:
 *   const acc = new InputAccumulator();
 *   // For each sendInput() call:
 *   const title = acc.feed(data);
 *   if (title !== null) { /* persist title *\/ }
 */
export class InputAccumulator {
  private buffer = "";
  private done = false;

  /**
   * Feed a chunk of raw PTY input.
   * Returns the extracted title when a newline is detected, or `null`
   * if we're still accumulating characters.
   */
  feed(data: string): string | null {
    if (this.done) return null;

    // Check if this chunk contains a newline (Enter key = \r in PTY)
    const newlineIndex = data.search(/[\r\n]/);

    if (newlineIndex === -1) {
      // Handle backspace/delete (PTY sends \x7f or \b)
      for (const char of data) {
        if (char === "\x7f" || char === "\b") {
          this.buffer = this.buffer.slice(0, -1);
        } else if (char.charCodeAt(0) >= 32) {
          // Only accumulate printable characters
          this.buffer += char;
        }
      }
      return null;
    }

    // Newline found — extract final title
    // Append everything before the newline
    const beforeNewline = data.slice(0, newlineIndex);
    for (const char of beforeNewline) {
      if (char === "\x7f" || char === "\b") {
        this.buffer = this.buffer.slice(0, -1);
      } else if (char.charCodeAt(0) >= 32) {
        this.buffer += char;
      }
    }

    this.done = true;
    return extractTitle(this.buffer);
  }
}

/**
 * Clean up raw input into a human-readable session title.
 * Strips ANSI codes, trims whitespace, and truncates.
 */
function extractTitle(raw: string): string | null {
  let title = stripAnsi(raw).trim();

  if (title.length === 0) {
    return null;
  }

  // Truncate if too long
  if (title.length > MAX_TITLE_LENGTH) {
    title = title.slice(0, MAX_TITLE_LENGTH - 1) + "\u2026";
  }

  return title;
}
