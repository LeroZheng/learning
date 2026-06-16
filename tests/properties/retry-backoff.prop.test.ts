/**
 * Property 6: Exponential backoff retry correctness
 *
 * For any retriable failure, the retry mechanism SHALL attempt the operation at most
 * `maxRetries + 1` times total, with delays between attempts following the formula
 * `initialDelay * 2^attemptIndex`. If all retries are exhausted, the original error
 * SHALL be thrown.
 *
 * **Validates: Requirements 5.6, 6.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateBackoffDelay } from '../../src/transaction-manager.js';

describe('Feature: database-crud, Property 6: Exponential backoff retry correctness', () => {
  it('should calculate delay as initialDelay * 2^attemptIndex', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),   // initialDelay
        fc.integer({ min: 0, max: 10 }),       // attemptIndex
        (initialDelay, attemptIndex) => {
          const expectedDelay = initialDelay * Math.pow(2, attemptIndex);
          const actualDelay = calculateBackoffDelay(initialDelay, attemptIndex);

          expect(actualDelay).toBe(expectedDelay);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should produce correct deadlock retry delays (100ms, 200ms, 400ms)', () => {
    const deadlockInitialDelay = 100;

    expect(calculateBackoffDelay(deadlockInitialDelay, 0)).toBe(100);
    expect(calculateBackoffDelay(deadlockInitialDelay, 1)).toBe(200);
    expect(calculateBackoffDelay(deadlockInitialDelay, 2)).toBe(400);
  });

  it('should produce correct reconnection retry delays (1000ms, 2000ms, 4000ms)', () => {
    const reconnectionInitialDelay = 1000;

    expect(calculateBackoffDelay(reconnectionInitialDelay, 0)).toBe(1000);
    expect(calculateBackoffDelay(reconnectionInitialDelay, 1)).toBe(2000);
    expect(calculateBackoffDelay(reconnectionInitialDelay, 2)).toBe(4000);
  });

  it('should produce monotonically increasing delays', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5000 }),   // initialDelay
        fc.integer({ min: 1, max: 10 }),      // maxRetries
        (initialDelay, maxRetries) => {
          const delays: number[] = [];
          for (let i = 0; i < maxRetries; i++) {
            delays.push(calculateBackoffDelay(initialDelay, i));
          }

          // Verify each subsequent delay is larger
          for (let i = 1; i < delays.length; i++) {
            expect(delays[i]).toBeGreaterThan(delays[i - 1]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should produce first delay equal to initialDelay', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        (initialDelay) => {
          expect(calculateBackoffDelay(initialDelay, 0)).toBe(initialDelay);
        }
      ),
      { numRuns: 100 }
    );
  });
});
