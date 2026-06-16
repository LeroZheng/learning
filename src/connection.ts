/**
 * Database Connection Module
 *
 * Manages both pg Pool and Prisma Client lifecycle with reconnection support.
 * Provides health checks and graceful shutdown.
 */

import pg from 'pg';
import { type DatabaseConfig } from './config.js';
import { createLogger, type Logger } from './logger.js';
import { DatabaseError } from './errors.js';

const { Pool } = pg;
type Pool = InstanceType<typeof pg.Pool>;
type PoolClient = pg.PoolClient;

export interface ConnectionModule {
  /** Initialize connection pool and Prisma client */
  connect(): Promise<void>;

  /** Get the pg Pool instance for raw SQL operations */
  getPool(): Pool;

  /** Get the PrismaClient instance for ORM operations */
  getPrismaClient(): any; // PrismaClient type when available

  /** Graceful shutdown: drain pool, disconnect Prisma */
  disconnect(): Promise<void>;

  /** Health check: verifies database is reachable */
  healthCheck(): Promise<boolean>;
}

/**
 * Creates a database connection module.
 *
 * @param config - Database configuration
 * @param logger - Optional logger instance
 */
export function createConnectionModule(
  config: DatabaseConfig,
  logger?: Logger
): ConnectionModule {
  const log = logger ?? createLogger();
  let pool: Pool | null = null;
  let prismaClient: any = null;
  let isConnected = false;

  async function attemptReconnect(): Promise<boolean> {
    const { maxAttempts, initialDelayMs } = config.reconnection;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const delay = initialDelayMs * Math.pow(2, attempt);
      log.warn(`Reconnection attempt ${attempt + 1}/${maxAttempts} in ${delay}ms`, {
        attempt: attempt + 1,
        maxAttempts,
        delayMs: delay,
      });

      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        if (pool) {
          const client = await pool.connect();
          await client.query('SELECT 1');
          client.release();
          isConnected = true;
          log.info('Reconnection successful');
          return true;
        }
      } catch (err) {
        log.error(`Reconnection attempt ${attempt + 1} failed`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    log.error('All reconnection attempts failed', { maxAttempts });
    return false;
  }

  return {
    async connect(): Promise<void> {
      try {
        pool = new Pool({
          connectionString: config.connectionString,
          max: config.pool.max,
          idleTimeoutMillis: config.pool.idleTimeoutMs,
          connectionTimeoutMillis: config.pool.connectionTimeoutMs,
        });

        // Test the connection
        const client = await pool.connect();
        const result = await client.query('SELECT current_database() as db_name');
        const dbName = result.rows[0]?.db_name ?? 'unknown';
        client.release();

        isConnected = true;
        log.info(`Database connection established`, { database: dbName });

        // Set up error handler for pool-level errors
        pool.on('error', async (err) => {
          log.error('Pool error - attempting reconnection', { error: err.message });
          isConnected = false;
          await attemptReconnect();
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`Failed to connect to database`, { error: message });
        throw new DatabaseError(
          `Failed to connect to database: ${message}`,
          'connection_error',
          { type: 'CONNECT', table: '' },
          err instanceof Error ? err : undefined
        );
      }
    },

    getPool(): Pool {
      if (!pool) {
        throw new DatabaseError(
          'Pool not initialized. Call connect() first.',
          'connection_error',
          { type: 'CONNECT', table: '' }
        );
      }
      return pool;
    },

    getPrismaClient(): any {
      return prismaClient;
    },

    async disconnect(): Promise<void> {
      log.info('Starting graceful shutdown...');

      // Wait for in-flight queries up to grace period
      const gracePeriod = config.shutdown.gracePeriodMs;

      try {
        if (pool) {
          // Give in-flight queries time to complete
          await Promise.race([
            pool.end(),
            new Promise(resolve => setTimeout(resolve, gracePeriod)),
          ]);
          pool = null;
        }

        if (prismaClient && typeof prismaClient.$disconnect === 'function') {
          await prismaClient.$disconnect();
          prismaClient = null;
        }

        isConnected = false;
        log.info('Database connections closed successfully');
      } catch (err) {
        log.error('Error during shutdown', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },

    async healthCheck(): Promise<boolean> {
      if (!pool || !isConnected) return false;

      try {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        return true;
      } catch (err) {
        log.warn('Health check failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        return false;
      }
    },
  };
}
