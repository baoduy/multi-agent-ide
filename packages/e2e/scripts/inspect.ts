/**
 * Inspect a DOM element in the running Magenta IDE debug session.
 *
 *   tsx scripts/inspect.ts "<css-selector>" [style1 style2 ...]
 */
import { runCli } from "./_client";

void runCli((argv) => {
  const [selector, ...styles] = argv;
  if (!selector) {
    throw new Error(`Usage: inspect.ts "<css-selector>" [style-prop ...]`);
  }
  return { kind: "inspect", selector, styles: styles.length > 0 ? styles : undefined };
});
