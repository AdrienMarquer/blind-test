/**
 * Database connection and initialization
 */

import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import path from 'path';
import { mkdirSync, existsSync } from 'fs';

// Ensure database directory exists
const dbDir = path.join(process.cwd(), 'db');
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
  console.log('📁 Created database directory');
}

// Database file path
const dbPath = path.join(dbDir, 'blind-test.db');

// Initialize SQLite database
const sqlite = new Database(dbPath, { create: true });
sqlite.run('PRAGMA journal_mode = WAL'); // Enable WAL mode for better concurrency

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
