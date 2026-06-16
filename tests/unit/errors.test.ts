import { describe, it, expect } from 'vitest';
import {
  DatabaseError,
  ConstraintError,
  DeadlockError,
  TransactionError,
  NotFoundError,
  mapPgErrorCode,
  mapPrismaError,
} from '../../src/errors.js';

describe('Error Classes', () => {
  describe('DatabaseError', () => {
    it('should store category, message, and operation', () => {
      const err = new DatabaseError('Connection lost', 'connection_error', { type: 'SELECT', table: 'users' });
      expect(err.category).toBe('connection_error');
      expect(err.message).toBe('Connection lost');
      expect(err.operation).toEqual({ type: 'SELECT', table: 'users' });
      expect(err.name).toBe('DatabaseError');
      expect(err).toBeInstanceOf(Error);
    });

    it('should store original error when provided', () => {
      const original = new Error('original');
      const err = new DatabaseError('Failed', 'query_error', { type: 'INSERT', table: 'posts' }, original);
      expect(err.originalError).toBe(original);
    });
  });

  describe('ConstraintError', () => {
    it('should extend DatabaseError with constraint info', () => {
      const err = new ConstraintError('Duplicate email', 'unique', 'email', { type: 'INSERT', table: 'users' });
      expect(err).toBeInstanceOf(DatabaseError);
      expect(err.category).toBe('constraint_error');
      expect(err.constraintType).toBe('unique');
      expect(err.field).toBe('email');
      expect(err.name).toBe('ConstraintError');
    });
  });

  describe('DeadlockError', () => {
    it('should extend DatabaseError with attempts count', () => {
      const err = new DeadlockError('Deadlock after 3 attempts', 3, { type: 'TRANSACTION', table: 'users' });
      expect(err).toBeInstanceOf(DatabaseError);
      expect(err.category).toBe('timeout_error');
      expect(err.attempts).toBe(3);
      expect(err.name).toBe('DeadlockError');
    });
  });

  describe('TransactionError', () => {
    it('should extend DatabaseError with failed operation index', () => {
      const underlying = new Error('FK violation');
      const err = new TransactionError('Operation 2 failed', 2, underlying, { type: 'TRANSACTION', table: 'users' });
      expect(err).toBeInstanceOf(DatabaseError);
      expect(err.failedOperationIndex).toBe(2);
      expect(err.underlyingError).toBe(underlying);
      expect(err.underlyingError.message).toBe('FK violation');
      expect(err.name).toBe('TransactionError');
    });
  });

  describe('NotFoundError', () => {
    it('should extend DatabaseError with query_error category', () => {
      const err = new NotFoundError('User not found', { type: 'SELECT', table: 'users' });
      expect(err).toBeInstanceOf(DatabaseError);
      expect(err.category).toBe('query_error');
      expect(err.name).toBe('NotFoundError');
    });
  });
});

describe('mapPgErrorCode()', () => {
  const operation = { type: 'INSERT', table: 'users' };

  it('should map 23505 to ConstraintError with type unique', () => {
    const err = mapPgErrorCode({ code: '23505', message: 'duplicate key', detail: 'Key (email)=(test@test.com) already exists.' }, operation);
    expect(err).toBeInstanceOf(ConstraintError);
    expect((err as ConstraintError).constraintType).toBe('unique');
    expect((err as ConstraintError).field).toBe('email');
  });

  it('should map 23503 to ConstraintError with type foreign_key', () => {
    const err = mapPgErrorCode({ code: '23503', message: 'violates foreign key', detail: 'Key (author_id)=(999) is not present' }, operation);
    expect(err).toBeInstanceOf(ConstraintError);
    expect((err as ConstraintError).constraintType).toBe('foreign_key');
    expect((err as ConstraintError).field).toBe('author_id');
  });

  it('should map 23502 to ConstraintError with type not_null', () => {
    const err = mapPgErrorCode({ code: '23502', message: 'null value', column: 'name' }, operation);
    expect(err).toBeInstanceOf(ConstraintError);
    expect((err as ConstraintError).constraintType).toBe('not_null');
    expect((err as ConstraintError).field).toBe('name');
  });

  it('should map 42601 to query_error', () => {
    const err = mapPgErrorCode({ code: '42601', message: 'syntax error' }, operation);
    expect(err.category).toBe('query_error');
  });

  it('should map 42P01 to query_error', () => {
    const err = mapPgErrorCode({ code: '42P01', message: 'relation does not exist' }, operation);
    expect(err.category).toBe('query_error');
  });

  it('should map 40P01 to timeout_error (deadlock)', () => {
    const err = mapPgErrorCode({ code: '40P01', message: 'deadlock detected' }, operation);
    expect(err.category).toBe('timeout_error');
  });

  it('should map 57014 to timeout_error', () => {
    const err = mapPgErrorCode({ code: '57014', message: 'query cancelled' }, operation);
    expect(err.category).toBe('timeout_error');
  });

  it('should map 08006 to connection_error', () => {
    const err = mapPgErrorCode({ code: '08006', message: 'connection failure' }, operation);
    expect(err.category).toBe('connection_error');
  });

  it('should map 08001 to connection_error', () => {
    const err = mapPgErrorCode({ code: '08001', message: 'unable to establish connection' }, operation);
    expect(err.category).toBe('connection_error');
  });

  it('should map 08003 to connection_error', () => {
    const err = mapPgErrorCode({ code: '08003', message: 'connection does not exist' }, operation);
    expect(err.category).toBe('connection_error');
  });

  it('should include operation info in all mapped errors', () => {
    const err = mapPgErrorCode({ code: '23505', message: 'dup', detail: 'Key (id)=(1)' }, operation);
    expect(err.operation).toEqual(operation);
  });

  it('should include non-empty message for all mapped errors', () => {
    const err = mapPgErrorCode({ code: '23505', message: 'dup', detail: 'Key (x)=(1)' }, operation);
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('should fall back to query_error for unknown codes', () => {
    const err = mapPgErrorCode({ code: '99999', message: 'unknown' }, operation);
    expect(err.category).toBe('query_error');
  });
});

describe('mapPrismaError()', () => {
  const operation = { type: 'INSERT', table: 'users' };

  it('should map P2002 to ConstraintError with type unique', () => {
    const err = mapPrismaError({ code: 'P2002', message: 'Unique constraint failed', meta: { target: ['email'] } }, operation);
    expect(err).toBeInstanceOf(ConstraintError);
    expect((err as ConstraintError).constraintType).toBe('unique');
    expect((err as ConstraintError).field).toBe('email');
  });

  it('should map P2003 to ConstraintError with type foreign_key', () => {
    const err = mapPrismaError({ code: 'P2003', message: 'Foreign key constraint failed', meta: { field_name: 'author_id' } }, operation);
    expect(err).toBeInstanceOf(ConstraintError);
    expect((err as ConstraintError).constraintType).toBe('foreign_key');
    expect((err as ConstraintError).field).toBe('author_id');
  });

  it('should map P2025 to NotFoundError', () => {
    const err = mapPrismaError({ code: 'P2025', message: 'Record not found', meta: { cause: 'Record to update not found.' } }, operation);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.message).toContain('Record to update not found');
  });

  it('should fall back to DatabaseError for unknown Prisma codes', () => {
    const err = mapPrismaError({ code: 'P9999', message: 'unknown error' }, operation);
    expect(err).toBeInstanceOf(DatabaseError);
    expect(err.category).toBe('query_error');
  });

  it('should handle missing meta gracefully for P2002', () => {
    const err = mapPrismaError({ code: 'P2002', message: 'unique failed' }, operation);
    expect(err).toBeInstanceOf(ConstraintError);
    expect((err as ConstraintError).field).toBe('unknown');
  });
});
