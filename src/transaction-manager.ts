/**
 * Transaction Manager Module
 *
 * Manages atomic multi-operation transactions with:
 * - Prisma interactive transactions
 * - Raw SQL transactions via pg PoolClient
 * - Deadlock detection and retry with exponential backoff
 * - Timeout handling
 * - Single transaction boundary (no nested commits)
 */

import pg from 'pg';
import { type Logger, createLogger } from './logger.js';
import { type DatabaseConfig } from './config.js';
import {
  DatabaseError,
  DeadlockError,
  TransactionError,
  mapPgErrorCode,
} from './errors.js';

type Pool = InstanceType<typeof pg.Pool>;
type PoolClient = pg.PoolClient;

export interface TransactionOptions {
  timeoutMs?: number;       // default 30000
  maxRetries?: number;      // default 3 for deadlocks
  isolationLevel?: 'ReadCommitted' | 'Serializable';
}

export interface TransactionManager {
  /** Execute operations atomically using Prisma interactive transaction */
  executeTransaction<T>(
    operations: (tx: any) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T>;

  /** Execute raw SQL operations atomically using pg client */
  executeRawTransaction<T>(
    operations: (client: PoolClient) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T>;
}

/**
 * Determines if a PostgreSQL error is a deadlock (error code 40P01).
 */
function isDeadlock(err: any): boolean {
  return err?.code === '40P01';
}

/**
 * Sleeps for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculates exponential backoff delay.
 * Formula: initialDelay * 2^attemptIndex
 */
export function calculateBackoffDelay(initialDelayMs: number, attemptIndex: number): number {
  return initialDelayMs * Math.pow(2, attemptIndex);
}

/**
 * Creates a Transaction Manager.
 *
 * @param pool - pg Pool instance for raw transactions
 * @param prisma - PrismaClient instance for ORM transactions
 * @param config - Database configuration
 * @param logger - Optional logger instance
 */
export function createTransactionManager(
  pool: Pool,
  prisma: any,
  config: DatabaseConfig,
  logger?: Logger
): TransactionManager {
  const log = logger ?? createLogger();
  const defaultTimeout = config.transaction.timeoutMs;
  const defaultMaxRetries = config.transaction.maxRetries;
  const defaultInitialRetryDelay = config.transaction.initialRetryDelayMs;

  return {
    async executeTransaction<T>(
      operations: (tx: any) => Promise<T>,
      options?: TransactionOptions
    ): Promise<T> {
      const timeoutMs = options?.timeoutMs ?? defaultTimeout;
      const maxRetries = options?.maxRetries ?? defaultMaxRetries;
      const isolationLevel = options?.isolationLevel ?? 'ReadCommitted';

      let lastError: any = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await prisma.$transaction(operations, {
            timeout: timeoutMs,
            isolationLevel,
          });
          return result;
        } catch (err: any) {
          lastError = err;

          if (isDeadlock(err) && attempt < maxRetries) {
            const delay = calculateBackoffDelay(defaultInitialRetryDelay, attempt);
            log.warn(`Deadlock detected, retrying (attempt ${attempt + 1}/${maxRetries})`, {
              attempt: attempt + 1,
              maxRetries,
              delayMs: delay,
            });
            await sleep(delay);
            continue;
          }

          // Non-retriable error or all retries exhausted
          break;
        }
      }

      // All retries exhausted
      if (isDeadlock(lastError)) {
        throw new DeadlockError(
          `Deadlock could not be resolved after ${maxRetries} attempts`,
          maxRetries,
          { type: 'TRANSACTION', table: '' },
          lastError instanceof Error ? lastError : undefined
        );
      }

      // Map Prisma error if applicable
      if (lastError?.code && typeof lastError.code === 'string' && lastError.code.startsWith('P')) {
        const { mapPrismaError } = await import('./errors.js');
        throw mapPrismaError(lastError, { type: 'TRANSACTION', table: '' });
      }

      throw new DatabaseError(
        `Transaction failed: ${lastError?.message ?? 'Unknown error'}`,
        'query_error',
        { type: 'TRANSACTION', table: '' },
        lastError instanceof Error ? lastError : undefined
      );
    },

    async executeRawTransaction<T>(
      operations: (client: PoolClient) => Promise<T>,
      options?: TransactionOptions
    ): Promise<T> {
      const timeoutMs = options?.timeoutMs ?? defaultTimeout;
      const maxRetries = options?.maxRetries ?? defaultMaxRetries;
      const isolationLevel = options?.isolationLevel ?? 'ReadCommitted';

      let lastError: any = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const client = await pool.connect();

        try {
          await client.query('BEGIN');

          // Set transaction-level timeout
          await client.query(`SET LOCAL statement_timeout = '${timeoutMs}'`);

          // Set isolation level
          if (isolationLevel === 'Serializable') {
            await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
          }

          const result = await operations(client);

          await client.query('COMMIT');
          return result;
        } catch (err: any) {
          await client.query('ROLLBACK').catch(() => {});
          lastError = err;

          if (isDeadlock(err) && attempt < maxRetries) {
            const delay = calculateBackoffDelay(defaultInitialRetryDelay, attempt);
            log.warn(`Deadlock detected in raw transaction, retrying (attempt ${attempt + 1}/${maxRetries})`, {
              attempt: attempt + 1,
              maxRetries,
              delayMs: delay,
            });
            await sleep(delay);
            continue;
          }

          break;
        } finally {
          client.release();
        }
      }

      // All retries exhausted for deadlock
      if (isDeadlock(lastError)) {
        throw new DeadlockError(
          `Deadlock could not be resolved after ${maxRetries} attempts`,
          maxRetries,
          { type: 'TRANSACTION', table: '' },
          lastError instanceof Error ? lastError : undefined
        );
      }

      // Map PG error if applicable
      if (lastError?.code && typeof lastError.code === 'string') {
        throw mapPgErrorCode(lastError, { type: 'TRANSACTION', table: '' });
      }

      throw new DatabaseError(
        `Raw transaction failed: ${lastError?.message ?? 'Unknown error'}`,
        'query_error',
        { type: 'TRANSACTION', table: '' },
        lastError instanceof Error ? lastError : undefined
      );
    },
  };
}
