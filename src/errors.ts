/**
 * Error Handling Module
 *
 * Unified error taxonomy with categorized database errors.
 * Maps PostgreSQL and Prisma error codes to domain-specific error types.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type ErrorCategory = 'connection_error' | 'query_error' | 'constraint_error' | 'timeout_error';

export type ConstraintType = 'unique' | 'foreign_key' | 'not_null';

export interface OperationInfo {
  type: string;   // 'INSERT' | 'SELECT' | 'UPDATE' | 'DELETE' | 'TRANSACTION'
  table: string;  // target table name
}

// ─── Error Classes ───────────────────────────────────────────────────────────

/**
 * Base database error class with categorization and operation context.
 */
export class DatabaseError extends Error {
  public readonly category: ErrorCategory;
  public readonly operation: OperationInfo;
  public readonly originalError?: Error;

  constructor(
    message: string,
    category: ErrorCategory,
    operation: OperationInfo,
    originalError?: Error,
  ) {
    super(message);
    this.name = 'DatabaseError';
    this.category = category;
    this.operation = operation;
    this.originalError = originalError;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error representing a database constraint violation (unique, foreign key, not-null).
 */
export class ConstraintError extends DatabaseError {
  public readonly category: 'constraint_error' = 'constraint_error';
  public readonly constraintType: ConstraintType;
  public readonly field: string;

  constructor(
    message: string,
    constraintType: ConstraintType,
    field: string,
    operation: OperationInfo,
    originalError?: Error,
  ) {
    super(message, 'constraint_error', operation, originalError);
    this.name = 'ConstraintError';
    this.constraintType = constraintType;
    this.field = field;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error representing a deadlock condition with retry tracking.
 */
export class DeadlockError extends DatabaseError {
  public readonly category: 'timeout_error' = 'timeout_error';
  public readonly attempts: number;

  constructor(
    message: string,
    attempts: number,
    operation: OperationInfo,
    originalError?: Error,
  ) {
    super(message, 'timeout_error', operation, originalError);
    this.name = 'DeadlockError';
    this.attempts = attempts;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error representing a transaction failure with index of the failed operation.
 */
export class TransactionError extends DatabaseError {
  public readonly failedOperationIndex: number;
  public readonly underlyingError: Error;

  constructor(
    message: string,
    failedOperationIndex: number,
    underlyingError: Error,
    operation: OperationInfo,
    originalError?: Error,
  ) {
    super(message, underlyingError instanceof DatabaseError ? underlyingError.category : 'query_error', operation, originalError ?? underlyingError);
    this.name = 'TransactionError';
    this.failedOperationIndex = failedOperationIndex;
    this.underlyingError = underlyingError;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error representing a record not found condition.
 */
export class NotFoundError extends DatabaseError {
  constructor(
    message: string,
    operation: OperationInfo,
    originalError?: Error,
  ) {
    super(message, 'query_error', operation, originalError);
    this.name = 'NotFoundError';

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── PostgreSQL Error Code Mapping ───────────────────────────────────────────

interface PgErrorInfo {
  category: ErrorCategory;
  constraintType?: ConstraintType;
}

const PG_ERROR_CODE_MAP: Record<string, PgErrorInfo> = {
  // Constraint errors
  '23505': { category: 'constraint_error', constraintType: 'unique' },
  '23503': { category: 'constraint_error', constraintType: 'foreign_key' },
  '23502': { category: 'constraint_error', constraintType: 'not_null' },
  // Query errors
  '42601': { category: 'query_error' },
  '42P01': { category: 'query_error' },
  // Timeout/deadlock errors
  '40P01': { category: 'timeout_error' },
  '57014': { category: 'timeout_error' },
  // Connection errors
  '08006': { category: 'connection_error' },
  '08001': { category: 'connection_error' },
  '08003': { category: 'connection_error' },
};

/**
 * Represents a PostgreSQL error with a code and optional constraint/column details.
 */
export interface PgError {
  code?: string;
  message?: string;
  detail?: string;
  constraint?: string;
  column?: string;
  table?: string;
}

/**
 * Maps a PostgreSQL error code to the appropriate domain error.
 *
 * @param pgError - The raw PostgreSQL error object
 * @param operation - The operation context (type + table)
 * @returns A categorized DatabaseError subclass
 */
export function mapPgErrorCode(pgError: PgError, operation: OperationInfo): DatabaseError {
  const code = pgError.code ?? '';
  const originalError = pgError instanceof Error ? pgError : new Error(pgError.message ?? 'Unknown PostgreSQL error');

  // Check exact code match first
  let errorInfo = PG_ERROR_CODE_MAP[code];

  // Check for 08xxx connection error codes not explicitly listed
  if (!errorInfo && code.startsWith('08')) {
    errorInfo = { category: 'connection_error' };
  }

  if (!errorInfo) {
    // Unknown error code - default to query_error
    return new DatabaseError(
      pgError.message ?? `Unknown database error (code: ${code})`,
      'query_error',
      operation,
      originalError,
    );
  }

  // Constraint errors get specialized handling
  if (errorInfo.category === 'constraint_error' && errorInfo.constraintType) {
    const field = extractFieldFromPgError(pgError, errorInfo.constraintType);
    const message = buildConstraintMessage(errorInfo.constraintType, field, operation);

    return new ConstraintError(
      message,
      errorInfo.constraintType,
      field,
      operation,
      originalError,
    );
  }

  // Build appropriate message based on category
  const message = buildErrorMessage(errorInfo.category, pgError, operation);

  return new DatabaseError(
    message,
    errorInfo.category,
    operation,
    originalError,
  );
}

/**
 * Extracts the field name from a PostgreSQL error based on constraint type.
 */
function extractFieldFromPgError(pgError: PgError, constraintType: ConstraintType): string {
  // For unique violations, try to extract from detail or constraint name
  if (pgError.column) {
    return pgError.column;
  }

  if (pgError.detail) {
    // PostgreSQL detail format: "Key (column_name)=(value) already exists."
    const match = pgError.detail.match(/Key \(([^)]+)\)/);
    if (match) {
      return match[1];
    }
  }

  if (pgError.constraint) {
    // Try to extract field from constraint name (e.g., "users_email_key" -> "email")
    const parts = pgError.constraint.split('_');
    if (parts.length >= 2) {
      // Remove table prefix and suffix (like _key, _fkey)
      return parts.slice(1, -1).join('_') || pgError.constraint;
    }
    return pgError.constraint;
  }

  // Fallback based on constraint type
  switch (constraintType) {
    case 'not_null':
      return pgError.column ?? 'unknown';
    default:
      return 'unknown';
  }
}

/**
 * Builds an error message for constraint violations.
 */
function buildConstraintMessage(constraintType: ConstraintType, field: string, operation: OperationInfo): string {
  switch (constraintType) {
    case 'unique':
      return `Unique constraint violation on field '${field}' in ${operation.type} on ${operation.table}`;
    case 'foreign_key':
      return `Foreign key constraint violation on field '${field}' in ${operation.type} on ${operation.table}`;
    case 'not_null':
      return `Not-null constraint violation on field '${field}' in ${operation.type} on ${operation.table}`;
  }
}

/**
 * Builds a human-readable error message based on category.
 */
function buildErrorMessage(category: ErrorCategory, pgError: PgError, operation: OperationInfo): string {
  switch (category) {
    case 'connection_error':
      return `Connection error during ${operation.type} on ${operation.table}: ${pgError.message ?? 'connection lost'}`;
    case 'query_error':
      return `Query error during ${operation.type} on ${operation.table}: ${pgError.message ?? 'invalid query'}`;
    case 'timeout_error':
      return `Timeout/deadlock during ${operation.type} on ${operation.table}: ${pgError.message ?? 'operation timed out'}`;
    case 'constraint_error':
      return `Constraint violation during ${operation.type} on ${operation.table}: ${pgError.message ?? 'constraint violated'}`;
  }
}

// ─── Prisma Error Code Mapping ───────────────────────────────────────────────

/**
 * Represents a Prisma Client known request error.
 */
export interface PrismaError {
  code: string;
  message: string;
  meta?: {
    target?: string[];
    field_name?: string;
    model_name?: string;
    cause?: string;
  };
}

/**
 * Maps a Prisma error code to the appropriate domain error.
 *
 * @param prismaError - The Prisma client error
 * @param operation - The operation context (type + table)
 * @returns A categorized DatabaseError subclass
 */
export function mapPrismaError(prismaError: PrismaError, operation: OperationInfo): DatabaseError {
  const originalError = prismaError instanceof Error ? prismaError : new Error(prismaError.message);

  switch (prismaError.code) {
    case 'P2002': {
      // Unique constraint violation
      const field = prismaError.meta?.target?.[0] ?? 'unknown';
      return new ConstraintError(
        `Unique constraint violation on field '${field}' in ${operation.type} on ${operation.table}`,
        'unique',
        field,
        operation,
        originalError,
      );
    }

    case 'P2003': {
      // Foreign key constraint violation
      const field = prismaError.meta?.field_name ?? 'unknown';
      return new ConstraintError(
        `Foreign key constraint violation on field '${field}' in ${operation.type} on ${operation.table}`,
        'foreign_key',
        field,
        operation,
        originalError,
      );
    }

    case 'P2025': {
      // Record not found
      const cause = prismaError.meta?.cause ?? 'Record not found';
      return new NotFoundError(
        `${cause} in ${operation.type} on ${operation.table}`,
        operation,
        originalError,
      );
    }

    default: {
      // Unknown Prisma error - map to generic DatabaseError
      return new DatabaseError(
        `Database error (${prismaError.code}) during ${operation.type} on ${operation.table}: ${prismaError.message}`,
        'query_error',
        operation,
        originalError,
      );
    }
  }
}
