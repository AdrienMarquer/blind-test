/**
 * Database connection and initialization
 * SQLite with Bun's built-in sqlite driver
 */

import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database } from 'bun:sqlite';
import * as schema from './schema';
import { logger } from '../utils/logger';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

const dbLogger = logger.child({ module: 'Database' });

// Get DATABASE_URL from environment (file path for SQLite)
// Use absolute path so database is always in apps/server/data/ regardless of working directory
const DEFAULT_DB_PATH = join(import.meta.dir, '..', '..', 'data', 'blind-test.db');
const DATABASE_PATH = process.env.DATABASE_URL || DEFAULT_DB_PATH;

// Ensure the directory exists
const dbDir = dirname(DATABASE_PATH);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
  dbLogger.info('Created database directory', { dir: dbDir });
}

dbLogger.info('Initializing SQLite database', { path: DATABASE_PATH });

// Create SQLite connection using Bun's native driver
const sqlite = new Database(DATABASE_PATH, { create: true });

// Enable WAL mode for better concurrent read performance
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA busy_timeout = 5000'); // Wait up to 5 seconds if database is locked

// Create Drizzle instance
export const db = drizzle(sqlite, {
  schema,
  logger: process.env.NODE_ENV === 'development',
});

dbLogger.info('SQLite database initialized');

// Run migrations using Drizzle's migration runner
// In production (bundled), use cwd-relative path since Docker sets WORKDIR correctly
// In development, import.meta.dir works correctly
const isDev = process.env.NODE_ENV !== 'production';
const MIGRATIONS_FOLDER = isDev
  ? join(import.meta.dir, '..', '..', 'drizzle')
  : join(process.cwd(), 'drizzle');

export function runMigrations() {
  try {
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    dbLogger.info('Database migrations completed');
  } catch (error) {
    dbLogger.error('Database migration failed', error);
    throw error;
  }
}

/**
 * Gracefully close database connection
 */
export function closeDatabase() {
  try {
    dbLogger.info('Closing database connection...');
    sqlite.close();
    dbLogger.info('Database connection closed successfully');
  } catch (error) {
    dbLogger.error('Error closing database connection', error);
    throw error;
  }
}

// Export schema for use in repositories
export { schema };
