/**
 * Application Entry Point
 *
 * Wires all modules together in correct dependency order:
 * config → logger → connection → sqlExecutor → ormLayer → transactionManager
 *
 * Provides a factory function to initialize the complete database CRUD module.
 */

import { loadConfig, DatabaseConfig } from './config.js';
import { createLogger, Logger } from './logger.js';
import { createConnectionModule, ConnectionModule } from './connection.js';
import { createSQLExecutor, SQLExecutor } from './sql-executor.js';
import { createUserRepository, createPostRepository, UserRepository, PostRepository } from './orm-layer.js';
import { createTransactionManager, TransactionManager } from './transaction-manager.js';

export interface DatabaseModule {
  config: DatabaseConfig;
  logger: Logger;
  connection: ConnectionModule;
  sqlExecutor: SQLExecutor;
  userRepository: UserRepository;
  postRepository: PostRepository;
  transactionManager: TransactionManager;
}

/**
 * Initializes and connects all database modules.
 *
 * Startup sequence:
 * 1. Load configuration
 * 2. Create logger
 * 3. Create and connect to database
 * 4. Verify health check
 * 5. Wire all modules
 * 6. Register shutdown handlers
 *
 * @returns Fully initialized DatabaseModule
 */
export async function createDatabaseModule(): Promise<DatabaseModule> {
  // 1. Load config
  const config = loadConfig();

  // 2. Create logger
  const logger = createLogger();

  // 3. Create and connect
  const connection = createConnectionModule(config, logger);
  await connection.connect();

  // 4. Verify health
  const healthy = await connection.healthCheck();
  if (!healthy) {
    throw new Error('Database health check failed after connection');
  }

  // 5. Wire modules
  const pool = connection.getPool();
  const prisma = connection.getPrismaClient();

  const sqlExecutor = createSQLExecutor(pool, config, logger);
  const userRepository = createUserRepository(prisma, logger);
  const postRepository = createPostRepository(prisma, logger);
  const transactionManager = createTransactionManager(pool, prisma, config, logger);

  // 6. Register shutdown handlers
  const shutdown = async () => {
    logger.info('Shutdown signal received, disconnecting...');
    await connection.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info('Database module ready');

  return {
    config,
    logger,
    connection,
    sqlExecutor,
    userRepository,
    postRepository,
    transactionManager,
  };
}

// Re-export types and factories for direct use
export { loadConfig, DatabaseConfig, ConfigValidationError } from './config.js';
export { createLogger, Logger, LogLevel, LogEntry } from './logger.js';
export { createConnectionModule, ConnectionModule } from './connection.js';
export { createSQLExecutor, SQLExecutor, QueryResult, ExecuteResult } from './sql-executor.js';
export {
  createUserRepository,
  createPostRepository,
  UserRepository,
  PostRepository,
  User,
  Post,
  PostWithAuthor,
  PaginationOptions,
  validatePagination,
} from './orm-layer.js';
export { createTransactionManager, TransactionManager, TransactionOptions, calculateBackoffDelay } from './transaction-manager.js';
export {
  DatabaseError,
  ConstraintError,
  DeadlockError,
  TransactionError,
  NotFoundError,
  mapPgErrorCode,
  mapPrismaError,
  ErrorCategory,
  ConstraintType,
  OperationInfo,
} from './errors.js';
