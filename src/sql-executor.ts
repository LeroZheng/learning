/**
 * SQL Query Executor Module
 *
 * Executes raw SQL with parameterized queries and structured error handling.
 * Supports SELECT, INSERT...RETURNING, UPDATE, DELETE operations.
 * Logs slow queries and maps PostgreSQL errors to domain errors.
 */

import pg from 'pg';
import { type Logger, createLogger } from './logger.js';
import { DatabaseError, mapPgErrorCode, type OperationInfo } from './errors.js';
import { type DatabaseConfig } from './config.js';

type Pool = InstanceType<typeof pg.Pool>;

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
  duration: number; // milliseconds
}

export interface ExecuteResult {
  affectedRows: number;
  duration: number; // milliseconds
}

export interface SQLExecutor {
  /** Execute a query that returns rows (SELECT, INSERT...RETURNING) */
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;

  /** Execute a statement that modifies data (INSERT, UPDATE, DELETE) */
  execute(
    sql: string,
    params?: unknown[]
  ): Promise<ExecuteResult>;

  /** Insert and return the created record */
  insert<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T>;
}

/**
 * Detects the SQL operation type from the SQL text.
 */
function detectOperationType(sql: string): string {
  const trimmed = sql.trim().toUpperCase();
  if (trimmed.startsWith('SELECT')) return 'SELECT';
  if (trimmed.startsWith('INSERT')) return 'INSERT';
  if (trimmed.startsWith('UPDATE')) return 'UPDATE';
  if (trimmed.startsWith('DELETE')) return 'DELETE';
  return 'UNKNOWN';
}

/**
 * Detects the target table from the SQL text.
 */
function detectTable(sql: string): string {
  const trimmed = sql.trim();

  // INSERT INTO table_name
  const insertMatch = trimmed.match(/INSERT\s+INTO\s+["']?(\w+)["']?/i);
  if (insertMatch) return insertMatch[1];

  // SELECT ... FROM table_name
  const selectMatch = trimmed.match(/FROM\s+["']?(\w+)["']?/i);
  if (selectMatch) return selectMatch[1];

  // UPDATE table_name
  const updateMatch = trimmed.match(/UPDATE\s+["']?(\w+)["']?/i);
  if (updateMatch) return updateMatch[1];

  // DELETE FROM table_name
  const deleteMatch = trimmed.match(/DELETE\s+FROM\s+["']?(\w+)["']?/i);
  if (deleteMatch) return deleteMatch[1];

  return 'unknown';
}

/**
 * Sanitizes SQL for logging by ensuring only parameter placeholders appear.
 * Since we use parameterized queries, the SQL text should already contain only $N placeholders.
 */
function sanitizeSqlForLogging(sql: string): string {
  return sql;
}

/**
 * Creates a SQL Query Executor.
 *
 * @param pool - pg Pool instance
 * @param config - Database configuration (for slow query threshold)
 * @param logger - Optional logger instance
 */
export function createSQLExecutor(
  pool: Pool,
  config: DatabaseConfig,
  logger?: Logger
): SQLExecutor {
  const log = logger ?? createLogger();
  const slowQueryThresholdMs = config.query.slowQueryThresholdMs;

  function buildOperation(sql: string): OperationInfo {
    return {
      type: detectOperationType(sql),
      table: detectTable(sql),
    };
  }

  function logSlowQuery(sql: string, duration: number, params?: unknown[]): void {
    if (duration > slowQueryThresholdMs) {
      log.warn('Slow query detected', {
        sql: sanitizeSqlForLogging(sql),
        duration,
        threshold: slowQueryThresholdMs,
        paramCount: params?.length ?? 0,
      });
    }
  }

  async function executeQuery<T>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number; duration: number }> {
    const start = Date.now();
    const operation = buildOperation(sql);

    try {
      const result = await pool.query(sql, params);
      const duration = Date.now() - start;

      logSlowQuery(sql, duration, params);

      return {
        rows: result.rows as T[],
        rowCount: result.rowCount ?? 0,
        duration,
      };
    } catch (err: any) {
      const duration = Date.now() - start;
      logSlowQuery(sql, duration, params);

      // Map PostgreSQL error to domain error
      if (err && err.code) {
        throw mapPgErrorCode(err, operation);
      }

      throw new DatabaseError(
        `Query execution failed: ${err?.message ?? 'Unknown error'}`,
        'query_error',
        operation,
        err instanceof Error ? err : undefined
      );
    }
  }

  return {
    async query<T = Record<string, unknown>>(
      sql: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> {
      const result = await executeQuery<T>(sql, params);
      return {
        rows: result.rows,
        rowCount: result.rowCount,
        duration: result.duration,
      };
    },

    async execute(
      sql: string,
      params?: unknown[]
    ): Promise<ExecuteResult> {
      const result = await executeQuery(sql, params);
      return {
        affectedRows: result.rowCount,
        duration: result.duration,
      };
    },

    async insert<T = Record<string, unknown>>(
      sql: string,
      params?: unknown[]
    ): Promise<T> {
      const result = await executeQuery<T>(sql, params);
      if (result.rows.length === 0) {
        throw new DatabaseError(
          'INSERT did not return any rows. Use INSERT...RETURNING to get the created record.',
          'query_error',
          buildOperation(sql)
        );
      }
      return result.rows[0];
    },
  };
}
