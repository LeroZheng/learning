/**
 * Property 3: PostgreSQL error code categorization
 *
 * For any PostgreSQL error with a valid error code, the error categorizer SHALL
 * map it to exactly one of the four categories, SHALL include a non-empty message,
 * and SHALL include the operation type and target table.
 *
 * **Validates: Requirements 3.5, 3.6, 6.1**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { mapPgErrorCode, ConstraintError, DatabaseError } from '../../src/errors.js';

const VALID_CATEGORIES = ['connection_error', 'query_error', 'constraint_error', 'timeout_error'] as const;

// Known PG error code mappings
const PG_ERROR_CODES = {
  constraint: ['23505', '23503', '23502'],
  query: ['42601', '42P01'],
  timeout: ['40P01', '57014'],
  connection: ['08006', '08001', '08003'],
};

const ALL_KNOWN_CODES = [
  ...PG_ERROR_CODES.constraint,
  ...PG_ERROR_CODES.query,
  ...PG_ERROR_CODES.timeout,
  ...PG_ERROR_CODES.connection,
];

describe('Feature: database-crud, Property 3: PostgreSQL error code categorization', () => {
  const operationArb = fc.record({
    type: fc.constantFrom('INSERT', 'SELECT', 'UPDATE', 'DELETE', 'TRANSACTION'),
    table: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
  });

  it('should map all known codes to exactly one valid category', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_KNOWN_CODES),
        operationArb,
        fc.string({ minLength: 1, maxLength: 100 }),
        (code, operation, message) => {
          const error = mapPgErrorCode({ code, message }, operation);

          // Maps to exactly one category
          expect(VALID_CATEGORIES).toContain(error.category);

          // Has non-empty message
          expect(error.message.length).toBeGreaterThan(0);

          // Includes operation type and table
          expect(error.operation.type).toBe(operation.type);
          expect(error.operation.table).toBe(operation.table);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should map constraint codes (23505, 23503, 23502) to constraint_error with correct type', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          { code: '23505', expectedType: 'unique' },
          { code: '23503', expectedType: 'foreign_key' },
          { code: '23502', expectedType: 'not_null' }
        ),
        operationArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        ({ code, expectedType }, operation, detail) => {
          const error = mapPgErrorCode(
            { code, message: 'constraint violation', detail: `Key (test_field)=(value) ${detail}`, column: code === '23502' ? 'test_field' : undefined },
            operation
          );

          expect(error).toBeInstanceOf(ConstraintError);
          expect(error.category).toBe('constraint_error');
          expect((error as ConstraintError).constraintType).toBe(expectedType);
          expect((error as ConstraintError).field.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should map 08xxx codes to connection_error', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PG_ERROR_CODES.connection),
        operationArb,
        (code, operation) => {
          const error = mapPgErrorCode({ code, message: 'connection issue' }, operation);
          expect(error.category).toBe('connection_error');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should map 42601/42P01 to query_error', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PG_ERROR_CODES.query),
        operationArb,
        (code, operation) => {
          const error = mapPgErrorCode({ code, message: 'query syntax issue' }, operation);
          expect(error.category).toBe('query_error');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should map 40P01/57014 to timeout_error', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PG_ERROR_CODES.timeout),
        operationArb,
        (code, operation) => {
          const error = mapPgErrorCode({ code, message: 'timeout/deadlock' }, operation);
          expect(error.category).toBe('timeout_error');
        }
      ),
      { numRuns: 100 }
    );
  });
});
