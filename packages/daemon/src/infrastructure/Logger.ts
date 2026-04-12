/**
 * Centralized logger for the daemon process.
 * Provides structured logging with context tags and log levels.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let minLevel: LogLevel = "info";

/**
 * Set the minimum log level. Messages below this level are discarded.
 */
export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

/**
 * Create a logger scoped to a specific context (e.g. service name).
 *
 * Usage:
 *   const log = createLogger("repo-service");
 *   log.info("Scanning", { dirs: 3 });
 *   log.error("Scan failed", err);
 */
export function createLogger(context: string) {
  function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[minLevel];
  }

  function formatPrefix(level: LogLevel): string {
    return `[${context}] ${level.toUpperCase()}:`;
  }

  return {
    debug(message: string, ...args: unknown[]): void {
      if (shouldLog("debug")) console.debug(formatPrefix("debug"), message, ...args);
    },
    info(message: string, ...args: unknown[]): void {
      if (shouldLog("info")) console.log(formatPrefix("info"), message, ...args);
    },
    warn(message: string, ...args: unknown[]): void {
      if (shouldLog("warn")) console.warn(formatPrefix("warn"), message, ...args);
    },
    error(message: string, ...args: unknown[]): void {
      if (shouldLog("error")) console.error(formatPrefix("error"), message, ...args);
    },
  };
}
