import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTransactionManager, calculateBackoffDelay } from '../../src/transaction-manager.js';
import { DatabaseConfig } from '../../src/config.js';
import { DeadlockError, TransactionError, DatabaseError } from '../../src/errors.js';

function createTestConfig(): DatabaseConfig {
  return {
    connectionString: 'postgresql://test@localhost/test',
    pool: { max: 10, idleTimeoutMs: 30000, connectionTimeoutMs: 10000 },
    shutdown: { gracePeriodMs: 5000 },
    query: { slowQueryThresholdMs: 5000 },
    transaction: { timeoutMs: 30000, maxRetries: 3, initialRetryDelayMs: 100 },
    reconnection: { maxAttempts: 3, initialDelayMs: 1000 },
  };
}

function createSilentLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createMockPoolClient() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: vi.fn(),
  };
}

function createMockPool(client?: any) {
  const mockClient = client ?? createMockPoolClient();
  return {
    connect: vi.fn().mockResolvedValue(mockClient),
  } as any;
}

function createMockPrisma() {
  return {
    $transaction: vi.fn(),
  };
}

describe('Transaction Manager', () => {
  let config: DatabaseConfig;
  let logger: ReturnType<typeof createSilentLogger>;

  beforeEach(() => {
    vi.useFakeTimers();
    config = createTestConfig();
    logger = createSilentLogger();
  });

  describe('calculateBackoffDelay()', () => {
    it('should calculate correct delays for deadlock retries', () => {
      expect(calculateBackoffDelay(100, 0)).toBe(100);
      expect(calculateBackoffDelay(100, 1)).toBe(200);
      expect(calculateBackoffDelay(100, 2)).toBe(400);
    });

    it('should calculate correct delays for reconnection retries', () => {
      expect(calculateBackoffDelay(1000, 0)).toBe(1000);
      expect(calculateBackoffDelay(1000, 1)).toBe(2000);
      expect(calculateBackoffDelay(1000, 2)).toBe(4000);
    });
  });

  describe('executeTransaction() - Prisma interactive transactions', () => {
    it('should execute operations atomically on success', async () => {
      vi.useRealTimers();
      const prisma = createMockPrisma();
      const pool = createMockPool();
      prisma.$transaction.mockImplementation(async (fn: any) => fn({ user: { create: vi.fn() } }));

      const txManager = createTransactionManager(pool, prisma, config, logger);
      const result = await txManager.executeTransaction(async (tx) => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should retry on deadlock up to maxRetries', async () => {
      vi.useRealTimers();
      const prisma = createMockPrisma();
      const pool = createMockPool();

      let callCount = 0;
      prisma.$transaction.mockImplementation(async () => {
        callCount++;
        if (callCount <= 3) {
          throw { code: '40P01', message: 'deadlock detected' };
        }
        return 'success after retry';
      });

      const txManager = createTransactionManager(pool, prisma, config, logger);
      const result = await txManager.executeTransaction(async (tx) => tx);

      expect(result).toBe('success after retry');
      expect(callCount).toBe(4); // 1 initial + 3 retries
    });

    it('should throw DeadlockError after all retries exhausted', async () => {
      vi.useRealTimers();
      const prisma = createMockPrisma();
      const pool = createMockPool();

      prisma.$transaction.mockRejectedValue({ code: '40P01', message: 'deadlock' });

      const txManager = createTransactionManager(pool, prisma, config, logger);
      await expect(txManager.executeTransaction(async (tx) => tx)).rejects.toBeInstanceOf(DeadlockError);
    });

    it('should throw immediately for non-retriable errors', async () => {
      vi.useRealTimers();
      const prisma = createMockPrisma();
      const pool = createMockPool();

      prisma.$transaction.mockRejectedValue({ code: 'P2002', message: 'unique constraint' });

      const txManager = createTransactionManager(pool, prisma, config, logger);
      await expect(txManager.executeTransaction(async (tx) => tx)).rejects.toBeDefined();
    });
  });

  describe('executeRawTransaction() - pg PoolClient transactions', () => {
    it('should BEGIN, execute, and COMMIT on success', async () => {
      vi.useRealTimers();
      const client = createMockPoolClient();
      const pool = createMockPool(client);
      const prisma = createMockPrisma();

      const txManager = createTransactionManager(pool, prisma, config, logger);
      const result = await txManager.executeRawTransaction(async (c) => {
        await c.query('INSERT INTO users (email, name) VALUES ($1, $2)', ['a@b.com', 'A']);
        return 'done';
      });

      expect(result).toBe('done');
      // Verify BEGIN was called
      expect(client.query).toHaveBeenCalledWith('BEGIN');
      // Verify COMMIT was called
      expect(client.query).toHaveBeenCalledWith('COMMIT');
      // Verify client was released
      expect(client.release).toHaveBeenCalled();
    });

    it('should ROLLBACK on failure and release client', async () => {
      vi.useRealTimers();
      const client = createMockPoolClient();
      client.query.mockImplementation(async (sql: string) => {
        if (sql === 'INSERT INTO users') throw new Error('query failed');
        return { rows: [], rowCount: 0 };
      });
      const pool = createMockPool(client);
      const prisma = createMockPrisma();

      const txManager = createTransactionManager(pool, prisma, config, logger);
      await expect(
        txManager.executeRawTransaction(async (c) => {
          await c.query('INSERT INTO users');
        })
      ).rejects.toBeDefined();

      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });

    it('should retry raw transaction on deadlock', async () => {
      vi.useRealTimers();
      let callCount = 0;
      const client = createMockPoolClient();
      client.query.mockImplementation(async (sql: string) => {
        if (sql.startsWith('INSERT')) {
          callCount++;
          if (callCount <= 2) {
            throw { code: '40P01', message: 'deadlock' };
          }
        }
        return { rows: [], rowCount: 0 };
      });
      const pool = createMockPool(client);
      const prisma = createMockPrisma();

      const txManager = createTransactionManager(pool, prisma, config, logger);
      const result = await txManager.executeRawTransaction(async (c) => {
        await c.query('INSERT INTO users (email) VALUES ($1)', ['a@b.com']);
        return 'done';
      });

      expect(result).toBe('done');
      expect(callCount).toBe(3); // 2 deadlocks + 1 success
    });
  });
});
