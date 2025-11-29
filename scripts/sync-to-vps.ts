#!/usr/bin/env bun
/**
 * Sync local data (SQLite DB + uploads) to VPS
 *
 * Usage:
 *   bun scripts/sync-to-vps.ts [--dry-run]
 *
 * This script uses rsync to sync:
 * - SQLite database file (./apps/server/data/)
 * - Music files (./apps/server/uploads/)
 *
 * Requires SSH access to the VPS.
 */

import { $ } from 'bun';
import { existsSync } from 'fs';
import path from 'path';

// Configuration
const VPS_HOST = process.env.VPS_HOST || 'dani@51.178.37.88';
const VPS_DATA_PATH = process.env.VPS_DATA_PATH || '/home/dani/blind-test-data';

const LOCAL_DATA_DIR = './apps/server/data';
const LOCAL_UPLOADS_DIR = './apps/server/uploads';

// Parse arguments
const dryRun = process.argv.includes('--dry-run');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step: number, total: number, message: string) {
  log(`\n[${step}/${total}] ${message}`, colors.blue);
}

async function main() {
  console.log(`
${colors.bold}${colors.blue}========================================
   Blind Test - Sync to VPS
========================================${colors.reset}
`);

  if (dryRun) {
    log('DRY RUN MODE - No changes will be made\n', colors.yellow);
  }

  // Step 1: Validate local directories exist
  logStep(1, 4, 'Validating local directories...');

  if (!existsSync(LOCAL_DATA_DIR)) {
    log(`  Data directory not found: ${LOCAL_DATA_DIR}`, colors.red);
    log('  Run the server first to create the database.', colors.gray);
    process.exit(1);
  }
  log(`  ${colors.green}Data directory: OK${colors.reset}`);

  if (!existsSync(LOCAL_UPLOADS_DIR)) {
    log(`  Uploads directory not found: ${LOCAL_UPLOADS_DIR}`, colors.yellow);
    log('  Creating it...', colors.gray);
    await $`mkdir -p ${LOCAL_UPLOADS_DIR}`;
  }
  log(`  ${colors.green}Uploads directory: OK${colors.reset}`);

  // Step 2: Test SSH connection
  logStep(2, 4, 'Testing SSH connection...');
  try {
    await $`ssh -o ConnectTimeout=5 -o BatchMode=yes ${VPS_HOST} echo "connected"`.quiet();
    log(`  ${colors.green}SSH connection: OK${colors.reset}`);
  } catch (error) {
    log(`  ${colors.red}SSH connection failed${colors.reset}`, colors.red);
    log(`  Make sure you have SSH access to ${VPS_HOST}`, colors.gray);
    process.exit(1);
  }

  // Step 3: Ensure remote directories exist
  logStep(3, 4, 'Ensuring remote directories exist...');
  try {
    await $`ssh ${VPS_HOST} "mkdir -p ${VPS_DATA_PATH}/data ${VPS_DATA_PATH}/uploads"`;
    log(`  ${colors.green}Remote directories: OK${colors.reset}`);
  } catch (error) {
    log(`  ${colors.red}Failed to create remote directories${colors.reset}`, colors.red);
    process.exit(1);
  }

  // Step 4: Sync data
  logStep(4, 4, 'Syncing data...');

  const rsyncFlags = [
    '-avz',           // archive, verbose, compress
    '--progress',     // show progress
    '--stats',        // show statistics
    '--exclude=.DS_Store',
    '--exclude=*.db-wal',  // Exclude WAL files (they'll be flushed)
    '--exclude=*.db-shm',  // Exclude shared memory files
  ];

  if (dryRun) {
    rsyncFlags.push('--dry-run');
  }

  // Sync database
  log('\n  Syncing database...', colors.gray);
  try {
    const dataResult = await $`rsync ${rsyncFlags} ${LOCAL_DATA_DIR}/ ${VPS_HOST}:${VPS_DATA_PATH}/data/`;
    console.log(dataResult.stdout.toString());
  } catch (error: any) {
    log(`  ${colors.red}Failed to sync database${colors.reset}`, colors.red);
    console.error(error.message);
    process.exit(1);
  }

  // Sync uploads
  log('\n  Syncing music files...', colors.gray);
  try {
    const uploadsResult = await $`rsync ${rsyncFlags} ${LOCAL_UPLOADS_DIR}/ ${VPS_HOST}:${VPS_DATA_PATH}/uploads/`;
    console.log(uploadsResult.stdout.toString());
  } catch (error: any) {
    log(`  ${colors.red}Failed to sync uploads${colors.reset}`, colors.red);
    console.error(error.message);
    process.exit(1);
  }

  // Done
  console.log(`
${colors.bold}${colors.green}========================================
   Sync complete!
========================================${colors.reset}
`);

  if (dryRun) {
    log('This was a dry run. No files were actually transferred.', colors.yellow);
    log('Run without --dry-run to perform the actual sync.', colors.gray);
  } else {
    log(`Data synced to: ${VPS_HOST}:${VPS_DATA_PATH}`, colors.green);
    log('\nRemember to restart the server on VPS if it was running.', colors.gray);
  }
}

main().catch((error) => {
  log(`\nError: ${error.message}`, colors.red);
  process.exit(1);
});
