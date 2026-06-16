import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSQLExecutor } from '../../src/sql-executor.js';
import { DatabaseConfig } from '../../src/config.js';
import { ConstraintError, DatabaseError } from '../../src/errors.js';

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

function createMockPool(queryResult?: any) {
  return {
    query: vi.fn().mockResolvedValue(queryResult ?? { rows: [], rowCount: 0 }),
  } as any;
}

describe('SQL Query Executor', () => {
  let config: DatabaseConfig;
  let logger: ReturnType<typeof createSilentLogger>;

  beforeEach(() => {
    config = createTestConfig();
    logger = createSilentLogger();
  });

  describe('query()', () => {
    it('should return rows and rowCount for SELECT', async () => {
      const pool = createMockPool({
        rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
        rowCount: 2,
      });
      const executor = createSQLExecutor(pool, config, logger);

      const result = await executor.query('SELECT * FROM users');
      expect(result.rows).toHaveLength(2);
      expect(result.rowCount).toBe(2);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should return empty array when no rows match', async () => {
      const pool = createMockPool({ rows: [], rowCount: 0 });
      const executor = createSQLExecutor(pool, config, logger);

      const result = await executor.query('SELECT * FROM users WHERE id = $1', [999]);
      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });

    it('should pass parameters to pool.query', async () => {
      const pool = createMockPool({ rows: [], rowCount: 0 });
      const executor = createSQLExecutor(pool, config, logger);

      await executor.query('SELECT * FROM users WHERE email = $1', ['test@example.com']);
      expect(pool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE email = $1', ['test@example.com']);
    });
  });

  describe('execute()', () => {
    it('should return affectedRows for UPDATE', async () => {
      const pool = createMockPool({ rows: [], rowCount: 3 });
      const executor = createSQLExecutor(pool, config, logger);

      const result = await executor.execute('UPDATE users SET name = $1 WHERE id > $2', ['Updated', 0]);
      expect(result.affectedRows).toBe(3);
    });

    it('should return 0 affectedRows when no match', async () => {
      const pool = createMockPool({ rows: [], rowCount: 0 });
      const executor = createSQLExecutor(pool, config, logger);

      const result = await executor.execute('DELETE FROM users WHERE id = $1', [999]);
      expect(result.affectedRows).toBe(0);
    });
  });

  describe('insert()', () => {
    it('should return the inserted record', async () => {
      const pool = createMockPool({
        rows: [{ id: 1, email: 'test@test.com', name: 'Test' }],
        rowCount: 1,
      });
      const executor = createSQLExecutor(pool, config, logger);

      const result = await executor.insert<{ id: number; email: string; name: string }>(
        'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING *',
        ['test@test.com', 'Test']
      );
      expect(result.id).toBe(1);
      expect(result.email).toBe('test@test.com');
    });

    it('should throw if INSERT does not return rows', async () => {
      const pool = createMockPool({ rows: [], rowCount: 0 });
      const executor = createSQLExecutor(pool, config, logger);

      await expect(
        executor.insert('INSERT INTO users (email, name) VALUES ($1, $2)', ['a@b.com', 'X'])
      ).rejects.toThrow(DatabaseError);
    });
  });

  describe('error handling', () => {
    it('should map syntax error to query_error', async () => {
      const pool = createMockPool();
      pool.query.mockRejectedValueOnce({ code: '42601', message: 'syntax error at or near "SELCT"' });
      const executor = createSQLExecutor(pool, config, logger);

      await expect(executor.query('SELCT * FROM users')).rejects.toMatchObject({
        category: 'query_error',
      });
    });

    it('should map unique constraint violation to ConstraintError', async () => {
      const pool = createMockPool();
      pool.query.mockRejectedValueOnce({
        code: '23505',
        message: 'duplicate key value violates unique constraint',
        detail: 'Key (email)=(dup@test.com) already exists.',
      });
      const executor = createSQLExecutor(pool, config, logger);

      try {
        await executor.insert('INSERT INTO users (email, name) VALUES ($1, $2) RETURNING *', ['dup@test.com', 'Dup']);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConstraintError);
        expect((err as ConstraintError).constraintType).toBe('unique');
        expect((err as ConstraintError).field).toBe('email');
      }
    });

    it('should map foreign key violation to ConstraintError', async () => {
      const pool = createMockPool();
      pool.query.mockRejectedValueOnce({
        code: '23503',
        message: 'violates foreign key constraint',
        detail: 'Key (author_id)=(999) is not present in table "users".',
      });
      const executor = createSQLExecutor(pool, config, logger);

      await expect(
        executor.execute('INSERT INTO posts (title, author_id) VALUES ($1, $2)', ['Post', 999])
      ).rejects.toMatchObject({
        category: 'constraint_error',
      });
    });
  });

  describe('slow query logging', () => {
    it('should log warning for queries exceeding threshold', async () => {
      const pool = createMockPool({ rows: [], rowCount: 0 });
      // Make the query "take time" by delaying the mock
      pool.query.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve({ rows: [], rowCount: 0 }), 10);
      }));

      const slowConfig = { ...config, query: { slowQueryThresholdMs: 5 } };
      const executor = createSQLExecutor(pool, slowConfig, logger);

      await executor.query('SELECT * FROM users');
      // The warn should be called because 10ms > 5ms threshold
      expect(logger.warn).toHaveBeenCalledWith(
        'Slow query detected',
        expect.objectContaining({ sql: 'SELECT * FROM users' })
      );
    });

    it('should not log warning for fast queries', async () => {
      const pool = createMockPool({ rows: [], rowCount: 0 });
      const executor = createSQLExecutor(pool, config, logger);

      await executor.query('SELECT 1');
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });
});
