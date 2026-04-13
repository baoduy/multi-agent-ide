/**
 * Dump the accessibility tree of the current renderer — preferred over
 * screenshots for verifying text and structure.
 */
import { runCli } from "./_client";

void runCli(() => ({ kind: "snapshot" }));
