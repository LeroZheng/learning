/**
 * Property 8: Slow query detection and log sanitization
 *
 * For any query execution where duration exceeds 5000 milliseconds, a warning log
 * SHALL be emitted. The logged query text SHALL contain only parameter placeholders
 * ($1, $2, etc.) and SHALL never contain the actual parameter values passed to the query.
 * For any query execution where duration is <= 5000 milliseconds, no slow query warning
 * SHALL be emitted.
 *
 * **Validates: Requirements 6.2**
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { createSQLExecutor } from '../../src/sql-executor.js';
import { DatabaseConfig } from '../../src/config.js';

function createTestConfig(threshold = 5000): DatabaseConfig {
  return {
    connectionString: 'postgresql://test@localhost/test',
    pool: { max: 10, idleTimeoutMs: 30000, connectionTimeoutMs: 10000 },
    shutdown: { gracePeriodMs: 5000 },
    query: { slowQueryThresholdMs: threshold },
    transaction: { timeoutMs: 30000, maxRetries: 3, initialRetryDelayMs: 100 },
    reconnection: { maxAttempts: 3, initialDelayMs: 1000 },
  };
}

function createSilentLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('Feature: database-crud, Property 8: Slow query detection and log sanitization', () => {
  it('should emit warning when query duration exceeds threshold', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 6, max: 100 }), // duration above threshold (using 5ms threshold for test speed)
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
        async (slowDuration, paramValues) => {
          const logger = createSilentLogger();
          const config = createTestConfig(5); // 5ms threshold for testing

          const mockPool = {
            query: vi.fn().mockImplementation(() => {
              return new Promise(resolve => {
                setTimeout(() => resolve({ rows: [], rowCount: 0 }), slowDuration);
              });
            }),
          } as any;

          const executor = createSQLExecutor(mockPool, config, logger);
          const placeholders = paramValues.map((_, i) => `$${i + 1}`).join(', ');
          const sql = paramValues.length > 0
            ? `SELECT * FROM users WHERE id IN (${placeholders})`
            : 'SELECT * FROM users';

          await executor.query(sql, paramValues.length > 0 ? paramValues : undefined);

          // Warning should be emitted
          expect(logger.warn).toHaveBeenCalled();

          // Check that logged SQL does NOT contain actual parameter values
          if (paramValues.length > 0) {
            const warnCall = logger.warn.mock.calls[0];
            const loggedMeta = warnCall[1] as Record<string, unknown>;
            const loggedSql = loggedMeta?.sql as string;

            // SQL should only contain $N placeholders
            for (const value of paramValues) {
              if (value.length > 3 && !value.match(/^\$\d+$/)) {
                expect(loggedSql).not.toContain(value);
              }
            }
          }
        }
      ),
      { numRuns: 30 } // Fewer runs due to real timeouts
    );
  });

  it('should NOT emit warning when query duration is below threshold', () => {
    fc.assert(
      fc.property(
        fc.constant(0), // immediate resolution
        async () => {
          const logger = createSilentLogger();
          const config = createTestConfig(5000); // 5000ms threshold - query will complete fast

          const mockPool = {
            query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
          } as any;

          const executor = createSQLExecutor(mockPool, config, logger);
          await executor.query('SELECT * FROM users WHERE id = $1', [1]);

          expect(logger.warn).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should log SQL with only placeholders, never raw values in slow queries', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.string({ minLength: 4, maxLength: 30 }),
            fc.constantFrom("password123", "secret_token", "admin@company.com")
          ),
          { minLength: 1, maxLength: 3 }
        ),
        async (sensitiveValues) => {
          const logger = createSilentLogger();
          const config = createTestConfig(0); // threshold = 0, every query is "slow"

          const mockPool = {
            query: vi.fn().mockImplementation(() => {
              return new Promise(resolve => {
                setTimeout(() => resolve({ rows: [], rowCount: 0 }), 2);
              });
            }),
          } as any;

          const executor = createSQLExecutor(mockPool, config, logger);
          const placeholders = sensitiveValues.map((_, i) => `$${i + 1}`).join(', ');
          const sql = `SELECT * FROM users WHERE email IN (${placeholders})`;

          await executor.query(sql, sensitiveValues);

          // Verify warning was emitted
          expect(logger.warn).toHaveBeenCalled();

          // The logged SQL should be the parameterized version
          const warnCall = logger.warn.mock.calls[0];
          const loggedMeta = warnCall[1] as Record<string, unknown>;
          const loggedSql = loggedMeta?.sql as string;

          expect(loggedSql).toBe(sql);

          // Verify NO sensitive values appear in logged SQL
          for (const value of sensitiveValues) {
            if (value.length > 3 && !value.match(/^\$\d+$/)) {
              expect(loggedSql).not.toContain(value);
            }
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});
