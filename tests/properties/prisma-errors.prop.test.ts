/**
 * Property 4: Prisma error code mapping to domain errors
 *
 * For any Prisma client error with code P2002 (unique constraint), the ORM layer
 * error mapper SHALL produce a ConstraintError with constraintType "unique" and
 * the correct conflicting field name; for any error with code P2003, it SHALL produce
 * a ConstraintError with constraintType "foreign_key"; for any error with code P2025,
 * it SHALL produce a NotFoundError with a descriptive message.
 *
 * **Validates: Requirements 4.6, 4.7, 4.9**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { mapPrismaError, ConstraintError, NotFoundError } from '../../src/errors.js';

describe('Feature: database-crud, Property 4: Prisma error code mapping to domain errors', () => {
  const operationArb = fc.record({
    type: fc.constantFrom('INSERT', 'SELECT', 'UPDATE', 'DELETE'),
    table: fc.constantFrom('users', 'posts'),
  });

  const fieldNameArb = fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z_]/.test(s) && s.trim().length > 0);

  it('should map P2002 to ConstraintError with type "unique" and correct field', () => {
    fc.assert(
      fc.property(
        operationArb,
        fieldNameArb,
        fc.string({ minLength: 1, maxLength: 100 }),
        (operation, fieldName, message) => {
          const prismaError = {
            code: 'P2002',
            message,
            meta: { target: [fieldName] },
          };

          const error = mapPrismaError(prismaError, operation);

          expect(error).toBeInstanceOf(ConstraintError);
          expect(error.category).toBe('constraint_error');
          expect((error as ConstraintError).constraintType).toBe('unique');
          expect((error as ConstraintError).field).toBe(fieldName);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should map P2003 to ConstraintError with type "foreign_key" and relation name', () => {
    fc.assert(
      fc.property(
        operationArb,
        fieldNameArb,
        fc.string({ minLength: 1, maxLength: 100 }),
        (operation, fieldName, message) => {
          const prismaError = {
            code: 'P2003',
            message,
            meta: { field_name: fieldName },
          };

          const error = mapPrismaError(prismaError, operation);

          expect(error).toBeInstanceOf(ConstraintError);
          expect(error.category).toBe('constraint_error');
          expect((error as ConstraintError).constraintType).toBe('foreign_key');
          expect((error as ConstraintError).field).toBe(fieldName);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should map P2025 to NotFoundError with descriptive message', () => {
    fc.assert(
      fc.property(
        operationArb,
        fc.string({ minLength: 1, maxLength: 100 }),
        (operation, causeText) => {
          const prismaError = {
            code: 'P2025',
            message: 'An operation failed because it depends on one or more records that were required but not found.',
            meta: { cause: causeText },
          };

          const error = mapPrismaError(prismaError, operation);

          expect(error).toBeInstanceOf(NotFoundError);
          expect(error.message.length).toBeGreaterThan(0);
          expect(error.message).toContain(causeText);
        }
      ),
      { numRuns: 100 }
    );
  });
});
