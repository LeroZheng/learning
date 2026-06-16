/**
 * Property 5: Pagination parameter validation
 *
 * For any pagination input where `take` is outside the range [1, 100] or `skip` is
 * negative, the ORM layer SHALL reject the query with a validation error. For any
 * pagination input where `take` is in [1, 100] and `skip` >= 0, the query SHALL be accepted.
 *
 * **Validates: Requirements 4.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validatePagination } from '../../src/orm-layer.js';
import { DatabaseError } from '../../src/errors.js';

describe('Feature: database-crud, Property 5: Pagination parameter validation', () => {
  it('should reject take values outside [1, 100]', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ max: 0 }),          // take <= 0
          fc.integer({ min: 101 })          // take > 100
        ),
        (invalidTake) => {
          expect(() => validatePagination({ take: invalidTake })).toThrow(DatabaseError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject negative skip values', () => {
    fc.assert(
      fc.property(
        fc.integer({ max: -1 }),
        (negativeSkip) => {
          expect(() => validatePagination({ skip: negativeSkip })).toThrow(DatabaseError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept valid pagination (take in [1,100], skip >= 0)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 10000 }),
        (validTake, validSkip) => {
          expect(() => validatePagination({ take: validTake, skip: validSkip })).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept undefined pagination', () => {
    expect(() => validatePagination(undefined)).not.toThrow();
    expect(() => validatePagination({})).not.toThrow();
  });
});
