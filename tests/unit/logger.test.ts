import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createLogger, LogLevel, LogEntry } from '../../src/logger.js';

describe('Logger', () => {
  let capturedEntries: LogEntry[];
  let captureOutput: (entry: LogEntry) => void;

  beforeEach(() => {
    capturedEntries = [];
    captureOutput = (entry: LogEntry) => {
      capturedEntries.push(entry);
    };
  });

  describe('createLogger()', () => {
    it('should create a logger with all four methods', () => {
      const logger = createLogger({ output: captureOutput });
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should default to info level when no level specified', () => {
      const logger = createLogger({ output: captureOutput });
      logger.debug('debug message');
      logger.info('info message');
      expect(capturedEntries).toHaveLength(1);
      expect(capturedEntries[0].level).toBe('info');
    });

    it('should respect explicit level option', () => {
      const logger = createLogger({ level: 'debug', output: captureOutput });
      logger.debug('debug message');
      logger.info('info message');
      expect(capturedEntries).toHaveLength(2);
      expect(capturedEntries[0].level).toBe('debug');
    });
  });

  describe('structured JSON output', () => {
    it('should include timestamp, level, and message in each log entry', () => {
      const logger = createLogger({ level: 'debug', output: captureOutput });
      logger.info('test message');

      expect(capturedEntries).toHaveLength(1);
      const entry = capturedEntries[0];
      expect(entry.timestamp).toBeDefined();
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('test message');
    });

    it('should include metadata when provided', () => {
      const logger = createLogger({ level: 'debug', output: captureOutput });
      logger.info('test', { userId: 123, action: 'login' });

      expect(capturedEntries[0].metadata).toEqual({ userId: 123, action: 'login' });
    });

    it('should not include metadata field when no metadata provided', () => {
      const logger = createLogger({ level: 'debug', output: captureOutput });
      logger.info('test');

      expect(capturedEntries[0].metadata).toBeUndefined();
    });

    it('should not include metadata field when empty object provided', () => {
      const logger = createLogger({ level: 'debug', output: captureOutput });
      logger.info('test', {});

      expect(capturedEntries[0].metadata).toBeUndefined();
    });

    it('should produce valid ISO timestamp', () => {
      const logger = createLogger({ level: 'debug', output: captureOutput });
      logger.info('test');

      const timestamp = capturedEntries[0].timestamp;
      const parsed = new Date(timestamp);
      expect(parsed.toISOString()).toBe(timestamp);
    });
  });

  describe('log level filtering', () => {
    it('should filter out debug when level is info', () => {
      const logger = createLogger({ level: 'info', output: captureOutput });
      logger.debug('should not appear');
      logger.info('should appear');
      expect(capturedEntries).toHaveLength(1);
      expect(capturedEntries[0].message).toBe('should appear');
    });

    it('should filter out debug and info when level is warn', () => {
      const logger = createLogger({ level: 'warn', output: captureOutput });
      logger.debug('no');
      logger.info('no');
      logger.warn('yes');
      logger.error('yes');
      expect(capturedEntries).toHaveLength(2);
      expect(capturedEntries[0].level).toBe('warn');
      expect(capturedEntries[1].level).toBe('error');
    });

    it('should filter out all except error when level is error', () => {
      const logger = createLogger({ level: 'error', output: captureOutput });
      logger.debug('no');
      logger.info('no');
      logger.warn('no');
      logger.error('yes');
      expect(capturedEntries).toHaveLength(1);
      expect(capturedEntries[0].level).toBe('error');
    });

    it('should allow all levels when level is debug', () => {
      const logger = createLogger({ level: 'debug', output: captureOutput });
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      expect(capturedEntries).toHaveLength(4);
    });
  });

  describe('LOG_LEVEL environment variable', () => {
    it('should respect LOG_LEVEL=debug env var', () => {
      const originalEnv = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'debug';
      try {
        const logger = createLogger({ output: captureOutput });
        logger.debug('debug message');
        expect(capturedEntries).toHaveLength(1);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.LOG_LEVEL;
        } else {
          process.env.LOG_LEVEL = originalEnv;
        }
      }
    });

    it('should default to info for invalid LOG_LEVEL values', () => {
      const originalEnv = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'invalid';
      try {
        const logger = createLogger({ output: captureOutput });
        logger.debug('should not appear');
        logger.info('should appear');
        expect(capturedEntries).toHaveLength(1);
        expect(capturedEntries[0].level).toBe('info');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.LOG_LEVEL;
        } else {
          process.env.LOG_LEVEL = originalEnv;
        }
      }
    });
  });
});
