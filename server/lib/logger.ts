export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, any>;
}

function formatLog(level: LogLevel, message: string, meta?: Record<string, any>): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
  };
  return JSON.stringify(entry);
}

export const logger = {
  info: (message: string, meta?: Record<string, any>) => {
    console.log(formatLog("info", message, meta));
  },
  warn: (message: string, meta?: Record<string, any>) => {
    console.warn(formatLog("warn", message, meta));
  },
  error: (message: string, meta?: Record<string, any>) => {
    console.error(formatLog("error", message, meta));
  },
  debug: (message: string, meta?: Record<string, any>) => {
    console.debug(formatLog("debug", message, meta));
  },
};
