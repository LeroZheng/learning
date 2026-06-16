import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, ConfigValidationError } from '../../src/config.js';

describe('Configuration Module', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadConfig() - valid configuration', () => {
    it('should load config with all defaults when only DATABASE_URL is set', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';
      const config = loadConfig();

      expect(config.connectionString).toBe('postgresql://user:pass@localhost:5432/testdb');
      expect(config.pool.max).toBe(10);
      expect(config.pool.idleTimeoutMs).toBe(30000);
      expect(config.pool.connectionTimeoutMs).toBe(10000);
      expect(config.shutdown.gracePeriodMs).toBe(5000);
      expect(config.query.slowQueryThresholdMs).toBe(5000);
      expect(config.transaction.timeoutMs).toBe(30000);
      expect(config.transaction.maxRetries).toBe(3);
      expect(config.transaction.initialRetryDelayMs).toBe(100);
      expect(config.reconnection.maxAttempts).toBe(3);
      expect(config.reconnection.initialDelayMs).toBe(1000);
    });

    it('should override defaults via environment variables', () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.DB_POOL_MAX = '20';
      process.env.DB_POOL_IDLE_TIMEOUT_MS = '60000';
      process.env.DB_POOL_CONNECTION_TIMEOUT_MS = '5000';
      process.env.DB_SHUTDOWN_GRACE_PERIOD_MS = '10000';
      process.env.DB_SLOW_QUERY_THRESHOLD_MS = '3000';
      process.env.DB_TRANSACTION_TIMEOUT_MS = '60000';
      process.env.DB_TRANSACTION_MAX_RETRIES = '5';
      process.env.DB_TRANSACTION_INITIAL_RETRY_DELAY_MS = '200';
      process.env.DB_RECONNECTION_MAX_ATTEMPTS = '5';
      process.env.DB_RECONNECTION_INITIAL_DELAY_MS = '2000';

      const config = loadConfig();

      expect(config.pool.max).toBe(20);
      expect(config.pool.idleTimeoutMs).toBe(60000);
      expect(config.pool.connectionTimeoutMs).toBe(5000);
      expect(config.shutdown.gracePeriodMs).toBe(10000);
      expect(config.query.slowQueryThresholdMs).toBe(3000);
      expect(config.transaction.timeoutMs).toBe(60000);
      expect(config.transaction.maxRetries).toBe(5);
      expect(config.transaction.initialRetryDelayMs).toBe(200);
      expect(config.reconnection.maxAttempts).toBe(5);
      expect(config.reconnection.initialDelayMs).toBe(2000);
    });
  });

  describe('loadConfig() - connection string validation', () => {
    it('should reject when DATABASE_URL is not set', () => {
      delete process.env.DATABASE_URL;
      expect(() => loadConfig()).toThrow(ConfigValidationError);
      expect(() => loadConfig()).toThrow(/missing or empty/);
    });

    it('should reject empty string', () => {
      process.env.DATABASE_URL = '';
      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should reject whitespace-only string', () => {
      process.env.DATABASE_URL = '   ';
      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });
  });

  describe('loadConfig() - pool max validation', () => {
    beforeEach(() => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
    });

    it('should reject pool max of 0', () => {
      process.env.DB_POOL_MAX = '0';
      expect(() => loadConfig()).toThrow(ConfigValidationError);
      expect(() => loadConfig()).toThrow(/Pool max must be an integer between 1 and 100/);
    });

    it('should reject negative pool max', () => {
      process.env.DB_POOL_MAX = '-5';
      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should reject pool max greater than 100', () => {
      process.env.DB_POOL_MAX = '101';
      expect(() => loadConfig()).toThrow(ConfigValidationError);
    });

    it('should accept pool max of 1 (minimum)', () => {
      process.env.DB_POOL_MAX = '1';
      const config = loadConfig();
      expect(config.pool.max).toBe(1);
    });

    it('should accept pool max of 100 (maximum)', () => {
      process.env.DB_POOL_MAX = '100';
      const config = loadConfig();
      expect(config.pool.max).toBe(100);
    });

    it('should use default when DB_POOL_MAX is non-numeric', () => {
      process.env.DB_POOL_MAX = 'abc';
      const config = loadConfig();
      expect(config.pool.max).toBe(10);
    });
  });
});
