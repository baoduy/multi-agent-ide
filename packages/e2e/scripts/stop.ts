/**
 * Stop the running debug-electron session (equivalent to sending Ctrl-C).
 */
import { runCli } from "./_client";

void runCli(() => ({ kind: "stop" }));
