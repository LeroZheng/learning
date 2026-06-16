/**
 * ORM Layer Module - Prisma-based CRUD operations
 *
 * Provides type-safe UserRepository and PostRepository with:
 * - Full CRUD operations
 * - Pagination with validation
 * - Relation loading
 * - Error mapping from Prisma errors to domain errors
 * - Debug-level operation logging
 */

import { type Logger, createLogger } from './logger.js';
import { mapPrismaError, DatabaseError, ConstraintError, NotFoundError, type OperationInfo } from './errors.js';

// Prisma types (simplified for compile-time independence)
export interface User {
  id: number;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Post {
  id: number;
  title: string;
  content: string | null;
  published: boolean;
  authorId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostWithAuthor extends Post {
  author: User;
}

export interface PaginationOptions {
  skip?: number;    // 0-based offset
  take?: number;    // 1-100 records
  orderBy?: Record<string, 'asc' | 'desc'>;
}

export interface UserRepository {
  create(data: { email: string; name: string }): Promise<User>;
  findById(id: number): Promise<User | null>;
  findMany(filter?: Partial<User>, pagination?: PaginationOptions): Promise<User[]>;
  update(id: number, data: Partial<Pick<User, 'email' | 'name'>>): Promise<User>;
  delete(id: number): Promise<User>;
}

export interface PostRepository {
  create(data: { title: string; content?: string; published?: boolean; authorId: number }): Promise<Post>;
  findById(id: number, includeAuthor?: boolean): Promise<Post | PostWithAuthor | null>;
  findMany(filter?: Partial<Post>, pagination?: PaginationOptions, includeAuthor?: boolean): Promise<(Post | PostWithAuthor)[]>;
  update(id: number, data: Partial<Pick<Post, 'title' | 'content' | 'published'>>): Promise<Post>;
  delete(id: number): Promise<Post>;
}

/**
 * Validates pagination parameters.
 * @throws {DatabaseError} if take is outside [1, 100] or skip is negative
 */
export function validatePagination(pagination?: PaginationOptions): void {
  if (!pagination) return;

  if (pagination.take !== undefined) {
    if (pagination.take < 1 || pagination.take > 100) {
      throw new DatabaseError(
        `Pagination 'take' must be between 1 and 100, received: ${pagination.take}`,
        'query_error',
        { type: 'SELECT', table: '' }
      );
    }
  }

  if (pagination.skip !== undefined) {
    if (pagination.skip < 0) {
      throw new DatabaseError(
        `Pagination 'skip' must be >= 0, received: ${pagination.skip}`,
        'query_error',
        { type: 'SELECT', table: '' }
      );
    }
  }
}

/**
 * Wraps a Prisma operation with error mapping and logging.
 */
async function withErrorMapping<T>(
  operation: OperationInfo,
  log: Logger,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    log.debug(`${operation.type} on ${operation.table} completed`, {
      operation: operation.type,
      table: operation.table,
      duration,
    });
    return result;
  } catch (err: any) {
    // If already a domain error, rethrow
    if (err instanceof DatabaseError) throw err;

    // Map Prisma errors
    if (err && err.code && typeof err.code === 'string' && err.code.startsWith('P')) {
      throw mapPrismaError(err, operation);
    }

    throw new DatabaseError(
      `ORM operation failed: ${err?.message ?? 'Unknown error'}`,
      'query_error',
      operation,
      err instanceof Error ? err : undefined
    );
  }
}

/**
 * Creates a User Repository backed by Prisma Client.
 *
 * @param prisma - PrismaClient instance (typed as any for loose coupling)
 * @param logger - Optional logger instance
 */
export function createUserRepository(prisma: any, logger?: Logger): UserRepository {
  const log = logger ?? createLogger();

  return {
    async create(data: { email: string; name: string }): Promise<User> {
      return withErrorMapping({ type: 'INSERT', table: 'users' }, log, () =>
        prisma.user.create({ data })
      );
    },

    async findById(id: number): Promise<User | null> {
      return withErrorMapping({ type: 'SELECT', table: 'users' }, log, () =>
        prisma.user.findUnique({ where: { id } })
      );
    },

    async findMany(filter?: Partial<User>, pagination?: PaginationOptions): Promise<User[]> {
      validatePagination(pagination);

      const query: any = {};
      if (filter) {
        query.where = filter;
      }
      if (pagination?.skip !== undefined) {
        query.skip = pagination.skip;
      }
      if (pagination?.take !== undefined) {
        query.take = pagination.take;
      }
      if (pagination?.orderBy) {
        query.orderBy = pagination.orderBy;
      }

      return withErrorMapping({ type: 'SELECT', table: 'users' }, log, () =>
        prisma.user.findMany(query)
      );
    },

    async update(id: number, data: Partial<Pick<User, 'email' | 'name'>>): Promise<User> {
      return withErrorMapping({ type: 'UPDATE', table: 'users' }, log, () =>
        prisma.user.update({ where: { id }, data })
      );
    },

    async delete(id: number): Promise<User> {
      return withErrorMapping({ type: 'DELETE', table: 'users' }, log, () =>
        prisma.user.delete({ where: { id } })
      );
    },
  };
}

/**
 * Creates a Post Repository backed by Prisma Client.
 *
 * @param prisma - PrismaClient instance (typed as any for loose coupling)
 * @param logger - Optional logger instance
 */
export function createPostRepository(prisma: any, logger?: Logger): PostRepository {
  const log = logger ?? createLogger();

  return {
    async create(data: { title: string; content?: string; published?: boolean; authorId: number }): Promise<Post> {
      return withErrorMapping({ type: 'INSERT', table: 'posts' }, log, () =>
        prisma.post.create({ data })
      );
    },

    async findById(id: number, includeAuthor?: boolean): Promise<Post | PostWithAuthor | null> {
      const query: any = { where: { id } };
      if (includeAuthor) {
        query.include = { author: true };
      }

      return withErrorMapping({ type: 'SELECT', table: 'posts' }, log, () =>
        prisma.post.findUnique(query)
      );
    },

    async findMany(
      filter?: Partial<Post>,
      pagination?: PaginationOptions,
      includeAuthor?: boolean
    ): Promise<(Post | PostWithAuthor)[]> {
      validatePagination(pagination);

      const query: any = {};
      if (filter) {
        query.where = filter;
      }
      if (pagination?.skip !== undefined) {
        query.skip = pagination.skip;
      }
      if (pagination?.take !== undefined) {
        query.take = pagination.take;
      }
      if (pagination?.orderBy) {
        query.orderBy = pagination.orderBy;
      }
      if (includeAuthor) {
        query.include = { author: true };
      }

      return withErrorMapping({ type: 'SELECT', table: 'posts' }, log, () =>
        prisma.post.findMany(query)
      );
    },

    async update(id: number, data: Partial<Pick<Post, 'title' | 'content' | 'published'>>): Promise<Post> {
      return withErrorMapping({ type: 'UPDATE', table: 'posts' }, log, () =>
        prisma.post.update({ where: { id }, data })
      );
    },

    async delete(id: number): Promise<Post> {
      return withErrorMapping({ type: 'DELETE', table: 'posts' }, log, () =>
        prisma.post.delete({ where: { id } })
      );
    },
  };
}
