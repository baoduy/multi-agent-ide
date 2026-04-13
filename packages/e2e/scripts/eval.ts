/**
 * Evaluate a JS expression inside the renderer of the running debug session.
 *
 *   tsx scripts/eval.ts "document.title"
 *   tsx scripts/eval.ts "document.querySelectorAll('button').length"
 *
 * The expression is wrapped in `(...)` so you can pass any expression, including
 * object literals. Avoid semicolons / statements; use IIFE for multi-step logic:
 *   tsx scripts/eval.ts "(()=>{const x=1;return x+2;})()"
 */
import { runCli } from "./_client";

void runCli((argv) => {
  const expression = argv.join(" ").trim();
  if (!expression) throw new Error(`Usage: eval.ts "<js-expression>"`);
  return { kind: "eval", expression };
});
