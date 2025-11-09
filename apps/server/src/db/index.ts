/**
 * Database connection and initialization
 */

import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';
import path from 'path';
import { mkdirSync, existsSync, readFileSync } from 'fs';

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
    // Check if tables already exist
    const tableCheck = sqlite.query("SELECT name FROM sqlite_master WHERE type='table' AND name='rooms'").get();

    if (!tableCheck) {
      // Tables don't exist, run migration SQL directly
      const migrationPath = path.join(process.cwd(), 'drizzle', '0000_initial_schema.sql');
      const migrationSQL = readFileSync(migrationPath, 'utf-8');

      // Split by semicolon and execute each statement
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        sqlite.run(statement);
      }

      console.log('✅ Database migrations completed');
    } else {
      console.log('✅ Database schema already exists');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Export schema for use in repositories
export { schema };
