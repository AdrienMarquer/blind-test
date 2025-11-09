/**
 * Database connection and initialization
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';

// Database file path
const dbPath = path.join(process.cwd(), 'db', 'blind-test.db');

// Initialize SQLite database
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL'); // Enable WAL mode for better concurrency

// Create Drizzle instance
export const db = drizzle(sqlite, { schema });

// Run migrations
export function runMigrations() {
  try {
    migrate(db, { migrationsFolder: './drizzle' });
    console.log('✅ Database migrations completed');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Export schema for use in repositories
export { schema };
