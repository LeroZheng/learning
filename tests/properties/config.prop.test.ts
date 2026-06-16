/**
 * Property 1: Configuration validation rejects invalid inputs
 *
 * For any pool size value outside the range [1, 100], the configuration loader
 * SHALL reject it; and for any connection string that is undefined, null, empty,
 * or composed entirely of whitespace characters, the configuration loader SHALL
 * reject it with an appropriate error.
 *
 * **Validates: Requirements 1.5, 1.7**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { loadConfig, ConfigValidationError } from '../../src/config.js';

describe('Feature: database-crud, Property 1: Configuration validation rejects invalid inputs', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should reject pool sizes outside [1, 100]', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ max: 0 }),          // <= 0
          fc.integer({ min: 101 })          // > 100
        ),
        (poolSize) => {
          process.env.DATABASE_URL = 'postgresql://user:pass@localhost/db';
          process.env.DB_POOL_MAX = String(poolSize);

          expect(() => loadConfig()).toThrow(ConfigValidationError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept pool sizes within [1, 100]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (poolSize) => {
          process.env.DATABASE_URL = 'postgresql://user:pass@localhost/db';
          process.env.DB_POOL_MAX = String(poolSize);

          const config = loadConfig();
          expect(config.pool.max).toBe(poolSize);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject empty or whitespace-only connection strings', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          fc.stringOf(fc.constant(' '), { minLength: 1, maxLength: 20 }), // whitespace-only
          fc.constant('\t'),
          fc.constant('\n'),
          fc.constant('  \t  \n  ')
        ),
        (invalidUrl) => {
          process.env.DATABASE_URL = invalidUrl;

          expect(() => loadConfig()).toThrow(ConfigValidationError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject undefined connection string', () => {
    delete process.env.DATABASE_URL;
    expect(() => loadConfig()).toThrow(ConfigValidationError);
  });

  it('should accept valid non-empty connection strings', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (validUrl) => {
          process.env.DATABASE_URL = validUrl;
          delete process.env.DB_POOL_MAX; // use default

          const config = loadConfig();
          expect(config.connectionString).toBe(validUrl);
        }
      ),
      { numRuns: 100 }
    );
  });
});
