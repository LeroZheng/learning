/**
 * Logger module - Structured logging with level support.
 *
 * Provides a structured JSON logger with configurable log levels
 * via the LOG_LEVEL environment variable.
 *
 * Log level hierarchy: debug < info < warn < error
 * Default level: info
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Parses the LOG_LEVEL environment variable into a valid LogLevel.
 * Returns 'info' as the default if not set or invalid.
 */
function parseLogLevel(envLevel?: string): LogLevel {
  if (!envLevel) return 'info';
  const normalized = envLevel.toLowerCase().trim();
  if (normalized in LOG_LEVEL_PRIORITY) {
    return normalized as LogLevel;
  }
  return 'info';
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Creates a structured JSON logger.
 *
 * @param options.level - Override log level (defaults to LOG_LEVEL env var or 'info')
 * @param options.output - Override output function (defaults to console methods)
 */
export function createLogger(options?: {
  level?: LogLevel;
  output?: (entry: LogEntry) => void;
}): Logger {
  const level = options?.level ?? parseLogLevel(process.env.LOG_LEVEL);
  const minPriority = LOG_LEVEL_PRIORITY[level];

  const output = options?.output ?? ((entry: LogEntry) => {
    const json = JSON.stringify(entry);
    switch (entry.level) {
      case 'error':
        console.error(json);
        break;
      case 'warn':
        console.warn(json);
        break;
      case 'debug':
        console.debug(json);
        break;
      default:
        console.log(json);
    }
  });

  function log(logLevel: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LOG_LEVEL_PRIORITY[logLevel] < minPriority) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: logLevel,
      message,
    };

    if (meta !== undefined && Object.keys(meta).length > 0) {
      entry.metadata = meta;
    }

    output(entry);
  }

  return {
    debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, meta),
    info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
    error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
  };
}
