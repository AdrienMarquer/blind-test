/**
 * Database connection and initialization
 * PostgreSQL only (development and production)
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';
import { logger } from '../utils/logger';

const dbLogger = logger.child({ module: 'Database' });

// Get DATABASE_URL from environment
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  dbLogger.error('DATABASE_URL environment variable is not set');
  throw new Error('DATABASE_URL is required. Please set it in your .env file.');
}

if (!DATABASE_URL.startsWith('postgres://') && !DATABASE_URL.startsWith('postgresql://')) {
  dbLogger.error('Invalid DATABASE_URL format', { url: DATABASE_URL });
  throw new Error('DATABASE_URL must be a PostgreSQL connection string (postgresql://...)');
}

// Mask password in logs
const maskedUrl = DATABASE_URL.replace(/:[^:@]+@/, ':****@');
dbLogger.info('Initializing PostgreSQL database', { url: maskedUrl });

// Create PostgreSQL connection
const sql = postgres(DATABASE_URL, {
  max: 10,                    // Max connections in pool
  idle_timeout: 30,           // Close idle connections after 30s (increased from 20s)
  connect_timeout: 10,        // Connection timeout (seconds)
  onnotice: () => {},         // Silence PostgreSQL NOTICE messages
  connection: {
    application_name: 'blind-test-server',
  },
  debug: process.env.NODE_ENV === 'development' ?
    (connection, query, params) => dbLogger.debug('Query', { query, params }) :
    undefined,
});

// Create Drizzle instance with optional logging
export const db = drizzle(sql, {
  schema,
  logger: process.env.NODE_ENV === 'development',
});

dbLogger.info('PostgreSQL database initialized');

// Run migrations using Drizzle's migration runner
export async function runMigrations() {
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    dbLogger.info('Database migrations completed');
  } catch (error) {
    dbLogger.error('Database migration failed', error);
    throw error;
  }
}

/**
 * Gracefully close database connections
 * CRITICAL: Must be called before process exit to prevent connection leaks
 */
export async function closeDatabase() {
  try {
    dbLogger.info('Closing database connections...');
    await sql.end({ timeout: 5 }); // Wait up to 5 seconds for queries to finish
    dbLogger.info('Database connections closed successfully');
  } catch (error) {
    dbLogger.error('Error closing database connections', error);
    throw error;
  }
}

// Export schema for use in repositories
export { schema };
