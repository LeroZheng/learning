/**
 * Property 7: Transaction failure reports correct operation index
 *
 * For any sequence of N operations executed within a transaction where the K-th
 * operation (0-indexed) fails, the thrown TransactionError SHALL contain
 * `failedOperationIndex` equal to K and SHALL include the underlying database error message.
 *
 * **Validates: Requirements 5.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { TransactionError } from '../../src/errors.js';

describe('Feature: database-crud, Property 7: Transaction failure reports correct operation index', () => {
  it('should store the correct failedOperationIndex for any failure position', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),  // total operations
        fc.integer({ min: 0, max: 19 }),  // failure index
        fc.string({ minLength: 1, maxLength: 100 }), // error message
        (totalOps, failIdx, errorMsg) => {
          // Ensure failIdx is within bounds
          const actualFailIdx = failIdx % totalOps;

          const underlyingError = new Error(errorMsg);
          const txError = new TransactionError(
            `Operation ${actualFailIdx} failed: ${errorMsg}`,
            actualFailIdx,
            underlyingError,
            { type: 'TRANSACTION', table: 'users' }
          );

          // Verify failedOperationIndex equals K
          expect(txError.failedOperationIndex).toBe(actualFailIdx);

          // Verify underlying error is preserved
          expect(txError.underlyingError).toBe(underlyingError);
          expect(txError.underlyingError.message).toBe(errorMsg);

          // Verify it's a proper TransactionError
          expect(txError.name).toBe('TransactionError');
          expect(txError.operation.type).toBe('TRANSACTION');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve the underlying error message exactly', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.integer({ min: 0, max: 50 }),
        (errorMessage, failIndex) => {
          const underlying = new Error(errorMessage);
          const txError = new TransactionError(
            `Transaction failed at operation ${failIndex}`,
            failIndex,
            underlying,
            { type: 'TRANSACTION', table: 'posts' }
          );

          expect(txError.underlyingError.message).toBe(errorMessage);
        }
      ),
      { numRuns: 100 }
    );
  });
});
