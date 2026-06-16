import 'dotenv/config';

/**
 * Database configuration interface.
 * Controls connection pool, shutdown, query, transaction, and reconnection settings.
 */
export interface DatabaseConfig {
  connectionString: string;
  pool: {
    max: number;                // 1-100, default 10
    idleTimeoutMs: number;      // default 30000 (30s)
    connectionTimeoutMs: number; // default 10000 (10s)
  };
  shutdown: {
    gracePeriodMs: number;      // default 5000 (5s)
  };
  query: {
    slowQueryThresholdMs: number; // default 5000 (5s)
  };
  transaction: {
    timeoutMs: number;           // default 30000 (30s)
    maxRetries: number;          // default 3
    initialRetryDelayMs: number; // default 100
  };
  reconnection: {
    maxAttempts: number;         // default 3
    initialDelayMs: number;      // default 1000
  };
}

/**
 * Error thrown when configuration validation fails.
 */
export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Validates that the connection string is defined, non-empty, and not whitespace-only.
 */
function validateConnectionString(value: string | undefined): string {
  if (value === undefined || value === null || value.trim() === '') {
    throw new ConfigValidationError(
      'DATABASE_URL environment variable is missing or empty. A valid connection string is required.'
    );
  }
  return value;
}

/**
 * Validates that pool max is an integer in the range [1, 100].
 */
function validatePoolMax(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new ConfigValidationError(
      `Pool max must be an integer between 1 and 100, received: ${value}`
    );
  }
  return value;
}

/**
 * Parses an environment variable as a positive integer, returning the default if not set.
 */
function parseIntEnv(envVar: string | undefined, defaultValue: number): number {
  if (envVar === undefined || envVar === '') {
    return defaultValue;
  }
  const parsed = parseInt(envVar, 10);
  if (isNaN(parsed)) {
    return defaultValue;
  }
  return parsed;
}

/**
 * Loads and validates database configuration from environment variables.
 *
 * Environment variables:
 * - DATABASE_URL: PostgreSQL connection string (required)
 * - DB_POOL_MAX: Maximum pool connections (default: 10)
 * - DB_POOL_IDLE_TIMEOUT_MS: Idle connection timeout in ms (default: 30000)
 * - DB_POOL_CONNECTION_TIMEOUT_MS: Connection timeout in ms (default: 10000)
 * - DB_SHUTDOWN_GRACE_PERIOD_MS: Graceful shutdown period in ms (default: 5000)
 * - DB_SLOW_QUERY_THRESHOLD_MS: Slow query warning threshold in ms (default: 5000)
 * - DB_TRANSACTION_TIMEOUT_MS: Transaction timeout in ms (default: 30000)
 * - DB_TRANSACTION_MAX_RETRIES: Max deadlock retries (default: 3)
 * - DB_TRANSACTION_INITIAL_RETRY_DELAY_MS: Initial retry delay in ms (default: 100)
 * - DB_RECONNECTION_MAX_ATTEMPTS: Max reconnection attempts (default: 3)
 * - DB_RECONNECTION_INITIAL_DELAY_MS: Initial reconnection delay in ms (default: 1000)
 *
 * @throws {ConfigValidationError} If connection string is missing/empty or pool max is out of range
 */
export function loadConfig(): DatabaseConfig {
  const connectionString = validateConnectionString(process.env.DATABASE_URL);

  const poolMax = parseIntEnv(process.env.DB_POOL_MAX, 10);
  validatePoolMax(poolMax);

  return {
    connectionString,
    pool: {
      max: poolMax,
      idleTimeoutMs: parseIntEnv(process.env.DB_POOL_IDLE_TIMEOUT_MS, 30000),
      connectionTimeoutMs: parseIntEnv(process.env.DB_POOL_CONNECTION_TIMEOUT_MS, 10000),
    },
    shutdown: {
      gracePeriodMs: parseIntEnv(process.env.DB_SHUTDOWN_GRACE_PERIOD_MS, 5000),
    },
    query: {
      slowQueryThresholdMs: parseIntEnv(process.env.DB_SLOW_QUERY_THRESHOLD_MS, 5000),
    },
    transaction: {
      timeoutMs: parseIntEnv(process.env.DB_TRANSACTION_TIMEOUT_MS, 30000),
      maxRetries: parseIntEnv(process.env.DB_TRANSACTION_MAX_RETRIES, 3),
      initialRetryDelayMs: parseIntEnv(process.env.DB_TRANSACTION_INITIAL_RETRY_DELAY_MS, 100),
    },
    reconnection: {
      maxAttempts: parseIntEnv(process.env.DB_RECONNECTION_MAX_ATTEMPTS, 3),
      initialDelayMs: parseIntEnv(process.env.DB_RECONNECTION_INITIAL_DELAY_MS, 1000),
    },
  };
}
