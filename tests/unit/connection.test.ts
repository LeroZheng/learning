import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createConnectionModule } from '../../src/connection.js';
import { DatabaseConfig } from '../../src/config.js';
import { DatabaseError } from '../../src/errors.js';

// Mock pg module
vi.mock('pg', () => {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [{ db_name: 'testdb' }] }),
    release: vi.fn(),
  };
  const mockPool = {
    connect: vi.fn().mockResolvedValue(mockClient),
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
  return {
    default: { Pool: vi.fn(() => mockPool) },
    Pool: vi.fn(() => mockPool),
  };
});

function createTestConfig(): DatabaseConfig {
  return {
    connectionString: 'postgresql://test:test@localhost:5432/testdb',
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

describe('Connection Module', () => {
  let config: DatabaseConfig;
  let logger: ReturnType<typeof createSilentLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createTestConfig();
    logger = createSilentLogger();
  });

  describe('connect()', () => {
    it('should establish connection and log success with database name', async () => {
      const conn = createConnectionModule(config, logger);
      await conn.connect();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Database connection established'),
        expect.objectContaining({ database: 'testdb' })
      );
    });

    it('should throw DatabaseError on connection failure', async () => {
      const pg = await import('pg');
      const mockPool = new pg.default.Pool() as any;
      mockPool.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const conn = createConnectionModule(config, logger);
      await expect(conn.connect()).rejects.toThrow(DatabaseError);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getPool()', () => {
    it('should throw if not connected', () => {
      const conn = createConnectionModule(config, logger);
      expect(() => conn.getPool()).toThrow(DatabaseError);
    });

    it('should return pool after connection', async () => {
      const conn = createConnectionModule(config, logger);
      await conn.connect();
      expect(conn.getPool()).toBeDefined();
    });
  });

  describe('disconnect()', () => {
    it('should close pool and log success', async () => {
      const conn = createConnectionModule(config, logger);
      await conn.connect();
      await conn.disconnect();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('closed successfully')
      );
    });
  });

  describe('healthCheck()', () => {
    it('should return false if not connected', async () => {
      const conn = createConnectionModule(config, logger);
      const result = await conn.healthCheck();
      expect(result).toBe(false);
    });

    it('should return true when database is reachable', async () => {
      const conn = createConnectionModule(config, logger);
      await conn.connect();
      const result = await conn.healthCheck();
      expect(result).toBe(true);
    });
  });
});
