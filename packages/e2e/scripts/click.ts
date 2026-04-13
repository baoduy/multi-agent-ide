/**
 * Click an element in the running Magenta IDE debug session.
 *
 *   tsx scripts/click.ts "<css-selector>" [--double]
 */
import { runCli } from "./_client";

void runCli((argv) => {
  const selector = argv.find((a) => !a.startsWith("--"));
  if (!selector) throw new Error(`Usage: click.ts "<css-selector>" [--double]`);
  const doubleClick = argv.includes("--double");
  return { kind: "click", selector, doubleClick };
});
