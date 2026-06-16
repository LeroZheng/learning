import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createUserRepository,
  createPostRepository,
  validatePagination,
} from '../../src/orm-layer.js';
import { ConstraintError, NotFoundError, DatabaseError } from '../../src/errors.js';

function createSilentLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createMockPrisma() {
  return {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    post: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('ORM Layer - UserRepository', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let logger: ReturnType<typeof createSilentLogger>;
  let userRepo: ReturnType<typeof createUserRepository>;

  beforeEach(() => {
    prisma = createMockPrisma();
    logger = createSilentLogger();
    userRepo = createUserRepository(prisma, logger);
  });

  describe('create()', () => {
    it('should create a user and return full record', async () => {
      const mockUser = { id: 1, email: 'test@test.com', name: 'Test', createdAt: new Date(), updatedAt: new Date() };
      prisma.user.create.mockResolvedValue(mockUser);

      const result = await userRepo.create({ email: 'test@test.com', name: 'Test' });
      expect(result).toEqual(mockUser);
      expect(prisma.user.create).toHaveBeenCalledWith({ data: { email: 'test@test.com', name: 'Test' } });
    });

    it('should throw ConstraintError on duplicate email', async () => {
      prisma.user.create.mockRejectedValue({ code: 'P2002', message: 'Unique constraint failed', meta: { target: ['email'] } });

      await expect(userRepo.create({ email: 'dup@test.com', name: 'Dup' })).rejects.toBeInstanceOf(ConstraintError);
    });
  });

  describe('findById()', () => {
    it('should return user when found', async () => {
      const mockUser = { id: 1, email: 'a@b.com', name: 'A', createdAt: new Date(), updatedAt: new Date() };
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await userRepo.findById(1);
      expect(result).toEqual(mockUser);
    });

    it('should return null when not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await userRepo.findById(999);
      expect(result).toBeNull();
    });
  });

  describe('findMany()', () => {
    it('should return array of users', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const result = await userRepo.findMany();
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no results', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      const result = await userRepo.findMany({ name: 'Nonexistent' });
      expect(result).toEqual([]);
    });

    it('should apply pagination parameters', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await userRepo.findMany(undefined, { skip: 10, take: 20, orderBy: { name: 'asc' } });
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        skip: 10,
        take: 20,
        orderBy: { name: 'asc' },
      });
    });

    it('should reject take > 100', async () => {
      await expect(userRepo.findMany(undefined, { take: 101 })).rejects.toThrow(DatabaseError);
    });

    it('should reject negative skip', async () => {
      await expect(userRepo.findMany(undefined, { skip: -1 })).rejects.toThrow(DatabaseError);
    });
  });

  describe('update()', () => {
    it('should update and return full record', async () => {
      const updated = { id: 1, email: 'new@test.com', name: 'New', createdAt: new Date(), updatedAt: new Date() };
      prisma.user.update.mockResolvedValue(updated);

      const result = await userRepo.update(1, { email: 'new@test.com' });
      expect(result.email).toBe('new@test.com');
    });

    it('should throw NotFoundError when record does not exist', async () => {
      prisma.user.update.mockRejectedValue({ code: 'P2025', message: 'Record not found', meta: { cause: 'Record to update not found.' } });

      await expect(userRepo.update(999, { name: 'X' })).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('delete()', () => {
    it('should delete and return the deleted record', async () => {
      const deleted = { id: 1, email: 'a@b.com', name: 'A', createdAt: new Date(), updatedAt: new Date() };
      prisma.user.delete.mockResolvedValue(deleted);

      const result = await userRepo.delete(1);
      expect(result).toEqual(deleted);
    });

    it('should throw NotFoundError when record does not exist', async () => {
      prisma.user.delete.mockRejectedValue({ code: 'P2025', message: 'Not found', meta: { cause: 'Record to delete not found.' } });

      await expect(userRepo.delete(999)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});

describe('ORM Layer - PostRepository', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let logger: ReturnType<typeof createSilentLogger>;
  let postRepo: ReturnType<typeof createPostRepository>;

  beforeEach(() => {
    prisma = createMockPrisma();
    logger = createSilentLogger();
    postRepo = createPostRepository(prisma, logger);
  });

  describe('create()', () => {
    it('should create a post with author relation', async () => {
      const mockPost = { id: 1, title: 'Post', content: null, published: false, authorId: 1, createdAt: new Date(), updatedAt: new Date() };
      prisma.post.create.mockResolvedValue(mockPost);

      const result = await postRepo.create({ title: 'Post', authorId: 1 });
      expect(result.authorId).toBe(1);
    });

    it('should throw ConstraintError on invalid authorId', async () => {
      prisma.post.create.mockRejectedValue({ code: 'P2003', message: 'FK failed', meta: { field_name: 'author_id' } });

      await expect(postRepo.create({ title: 'Post', authorId: 999 })).rejects.toBeInstanceOf(ConstraintError);
    });
  });

  describe('findById()', () => {
    it('should find post without author by default', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 1, title: 'P' });

      await postRepo.findById(1);
      expect(prisma.post.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should include author when requested', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 1, title: 'P', author: { id: 1 } });

      await postRepo.findById(1, true);
      expect(prisma.post.findUnique).toHaveBeenCalledWith({ where: { id: 1 }, include: { author: true } });
    });

    it('should return null for non-existent post', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      const result = await postRepo.findById(999);
      expect(result).toBeNull();
    });
  });

  describe('findMany()', () => {
    it('should support filtering and pagination', async () => {
      prisma.post.findMany.mockResolvedValue([]);

      await postRepo.findMany({ published: true }, { take: 10, skip: 0 });
      expect(prisma.post.findMany).toHaveBeenCalledWith({
        where: { published: true },
        skip: 0,
        take: 10,
      });
    });
  });
});

describe('Pagination Validation', () => {
  it('should accept valid pagination', () => {
    expect(() => validatePagination({ take: 1, skip: 0 })).not.toThrow();
    expect(() => validatePagination({ take: 100, skip: 0 })).not.toThrow();
    expect(() => validatePagination({ take: 50, skip: 100 })).not.toThrow();
  });

  it('should reject take < 1', () => {
    expect(() => validatePagination({ take: 0 })).toThrow();
  });

  it('should reject take > 100', () => {
    expect(() => validatePagination({ take: 101 })).toThrow();
  });

  it('should reject negative skip', () => {
    expect(() => validatePagination({ skip: -1 })).toThrow();
  });

  it('should accept undefined pagination', () => {
    expect(() => validatePagination(undefined)).not.toThrow();
  });
});
