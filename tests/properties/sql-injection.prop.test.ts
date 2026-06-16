/**
 * Property 2: SQL injection prevention via parameterized queries
 *
 * For any user-provided string value (including strings containing SQL keywords,
 * quotes, semicolons, comment markers, or any combination thereof), when passed to
 * the SQL Query Executor, the value SHALL always appear as a parameter placeholder
 * ($N) in the executed SQL text and SHALL never be interpolated directly into the
 * query string.
 *
 * **Validates: Requirements 3.7**
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { createSQLExecutor } from '../../src/sql-executor.js';
import { DatabaseConfig } from '../../src/config.js';

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
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('Feature: database-crud, Property 2: SQL injection prevention via parameterized queries', () => {
  // Generate malicious strings that attempt SQL injection
  const sqlInjectionArb = fc.oneof(
    fc.string(), // random strings
    fc.constantFrom(
      "'; DROP TABLE users; --",
      "1 OR 1=1",
      "1; DELETE FROM users",
      "admin'--",
      "' UNION SELECT * FROM users --",
      "1; EXEC xp_cmdshell('dir')",
      "'); INSERT INTO users VALUES('hack','hack'); --",
    ),
    // Strings with SQL keywords
    fc.tuple(
      fc.constantFrom('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'UNION', 'OR', 'AND'),
      fc.string()
    ).map(([keyword, rest]) => `${keyword} ${rest}`),
    // Strings with special chars
    fc.tuple(
      fc.constantFrom("'", '"', ';', '--', '/*', '*/', '$$'),
      fc.string()
    ).map(([special, rest]) => `${special}${rest}`),
  );

  it('should always use parameterized queries, never interpolate user values into SQL', () => {
    fc.assert(
      fc.property(
        sqlInjectionArb,
        async (maliciousInput) => {
          let executedSql = '';
          let executedParams: unknown[] = [];

          const mockPool = {
            query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
              executedSql = sql;
              executedParams = params ?? [];
              return Promise.resolve({ rows: [{ id: 1 }], rowCount: 1 });
            }),
          } as any;

          const logger = createSilentLogger();
          const config = createTestConfig();
          const executor = createSQLExecutor(mockPool, config, logger);

          // Use the malicious input as a parameter
          await executor.query(
            'SELECT * FROM users WHERE email = $1',
            [maliciousInput]
          );

          // The SQL should contain only the placeholder $1, never the actual value
          expect(executedSql).toBe('SELECT * FROM users WHERE email = $1');
          expect(executedSql).not.toContain(maliciousInput.length > 2 ? maliciousInput : '___SKIP_SHORT___');

          // The value should be in the params array, not in the SQL
          expect(executedParams[0]).toBe(maliciousInput);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should pass multiple malicious params as placeholders without interpolation', () => {
    fc.assert(
      fc.property(
        fc.array(sqlInjectionArb, { minLength: 1, maxLength: 5 }),
        async (maliciousInputs) => {
          let executedSql = '';
          let executedParams: unknown[] = [];

          const mockPool = {
            query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
              executedSql = sql;
              executedParams = params ?? [];
              return Promise.resolve({ rows: [], rowCount: 0 });
            }),
          } as any;

          const logger = createSilentLogger();
          const config = createTestConfig();
          const executor = createSQLExecutor(mockPool, config, logger);

          // Build parameterized query with N params
          const placeholders = maliciousInputs.map((_, i) => `$${i + 1}`).join(', ');
          const sql = `INSERT INTO users (data) VALUES (${placeholders}) RETURNING *`;

          await executor.query(sql, maliciousInputs);

          // Verify SQL text only has placeholders
          expect(executedSql).toBe(sql);
          // Verify params are passed separately
          expect(executedParams).toEqual(maliciousInputs);

          // The executed SQL should never contain any of the actual malicious values
          for (const input of maliciousInputs) {
            if (input.length > 3) {
              expect(executedSql).not.toContain(input);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
