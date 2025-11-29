#!/usr/bin/env bun
/**
 * Sync local data (SQLite DB + uploads) to VPS K8s pod
 *
 * Usage:
 *   bun scripts/sync-to-vps.ts [--dry-run]
 *
 * This script uses kubectl cp to sync files directly into the running pod:
 * - SQLite database file (./apps/server/data/)
 * - Music files (./apps/server/uploads/)
 */

import { $ } from 'bun';
import { existsSync, readdirSync } from 'fs';

// Configuration
const VPS_HOST = process.env.VPS_HOST || 'dani@51.178.37.88';
const K8S_NAMESPACE = 'adrien';
const K8S_DEPLOYMENT = 'blind-test';

const LOCAL_DATA_DIR = './apps/server/data';
const LOCAL_UPLOADS_DIR = './apps/server/uploads';

const REMOTE_DATA_PATH = '/app/apps/server/data';
const REMOTE_UPLOADS_PATH = '/app/apps/server/uploads';

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

async function sshCmd(cmd: string): Promise<string> {
  const result = await $`ssh ${VPS_HOST} "export KUBECONFIG=~/.kube/config && ${cmd}"`.quiet();
  return result.stdout.toString().trim();
}

async function main() {
  console.log(`
${colors.bold}${colors.blue}========================================
   Blind Test - Sync to VPS (K8s)
========================================${colors.reset}
`);

  if (dryRun) {
    log('DRY RUN MODE - No changes will be made\n', colors.yellow);
  }

  // Step 1: Validate local directories exist
  logStep(1, 5, 'Validating local directories...');

  if (!existsSync(LOCAL_DATA_DIR)) {
    log(`  Data directory not found: ${LOCAL_DATA_DIR}`, colors.red);
    log('  Run the server first to create the database.', colors.gray);
    process.exit(1);
  }

  const dbFile = `${LOCAL_DATA_DIR}/blind-test.db`;
  if (!existsSync(dbFile)) {
    log(`  Database file not found: ${dbFile}`, colors.red);
    log('  Run the server first to create the database.', colors.gray);
    process.exit(1);
  }
  log(`  ${colors.green}Database file: OK${colors.reset}`);

  if (!existsSync(LOCAL_UPLOADS_DIR)) {
    log(`  Uploads directory not found: ${LOCAL_UPLOADS_DIR}`, colors.yellow);
  } else {
    const uploadFiles = readdirSync(LOCAL_UPLOADS_DIR).filter(f => !f.startsWith('.'));
    log(`  ${colors.green}Uploads directory: OK (${uploadFiles.length} files)${colors.reset}`);
  }

  // Step 2: Test SSH connection
  logStep(2, 5, 'Testing SSH connection...');
  try {
    await $`ssh -o ConnectTimeout=5 -o BatchMode=yes ${VPS_HOST} echo "connected"`.quiet();
    log(`  ${colors.green}SSH connection: OK${colors.reset}`);
  } catch (error) {
    log(`  ${colors.red}SSH connection failed${colors.reset}`, colors.red);
    log(`  Make sure you have SSH access to ${VPS_HOST}`, colors.gray);
    process.exit(1);
  }

  // Step 3: Get pod name
  logStep(3, 5, 'Finding K8s pod...');
  let podName: string;
  try {
    podName = await sshCmd(`kubectl get pods -n ${K8S_NAMESPACE} -l app=${K8S_DEPLOYMENT} -o jsonpath='{.items[0].metadata.name}'`);
    if (!podName) throw new Error('No pod found');
    log(`  ${colors.green}Pod found: ${podName}${colors.reset}`);
  } catch (error) {
    log(`  ${colors.red}Failed to find pod${colors.reset}`, colors.red);
    process.exit(1);
  }

  if (dryRun) {
    log('\n  Would sync:', colors.yellow);
    log(`    - ${dbFile} -> ${podName}:${REMOTE_DATA_PATH}/`, colors.gray);
    const uploadFiles = existsSync(LOCAL_UPLOADS_DIR)
      ? readdirSync(LOCAL_UPLOADS_DIR).filter(f => !f.startsWith('.'))
      : [];
    log(`    - ${uploadFiles.length} music files -> ${podName}:${REMOTE_UPLOADS_PATH}/`, colors.gray);

    console.log(`
${colors.bold}${colors.yellow}========================================
   Dry run complete
========================================${colors.reset}
`);
    log('Run without --dry-run to perform the actual sync.', colors.gray);
    process.exit(0);
  }

  // Step 4: Sync database
  logStep(4, 5, 'Syncing database...');
  try {
    // Checkpoint WAL to merge data into main db file
    log('  Checkpointing WAL...', colors.gray);
    await $`sqlite3 ${dbFile} "PRAGMA wal_checkpoint(TRUNCATE);"`;

    // Copy local db to VPS temp location
    log('  Copying database to VPS...', colors.gray);
    await $`scp ${dbFile} ${VPS_HOST}:/tmp/blind-test.db`;

    // Copy from VPS to pod
    log('  Copying database to pod...', colors.gray);
    await sshCmd(`kubectl cp /tmp/blind-test.db ${K8S_NAMESPACE}/${podName}:${REMOTE_DATA_PATH}/blind-test.db`);

    // Cleanup temp file
    await sshCmd('rm /tmp/blind-test.db');

    log(`  ${colors.green}Database synced!${colors.reset}`);
  } catch (error: any) {
    log(`  ${colors.red}Failed to sync database: ${error.message}${colors.reset}`, colors.red);
    process.exit(1);
  }

  // Step 5: Sync uploads
  logStep(5, 5, 'Syncing music files...');
  if (!existsSync(LOCAL_UPLOADS_DIR)) {
    log('  No uploads directory, skipping...', colors.yellow);
  } else {
    const uploadFiles = readdirSync(LOCAL_UPLOADS_DIR).filter(f => !f.startsWith('.'));
    if (uploadFiles.length === 0) {
      log('  No music files to sync', colors.yellow);
    } else {
      log(`  Syncing ${uploadFiles.length} files...`, colors.gray);

      try {
        // Create tar archive
        log('  Creating archive...', colors.gray);
        await $`tar -cf /tmp/uploads.tar -C ${LOCAL_UPLOADS_DIR} .`;

        // Copy to VPS
        log('  Copying to VPS...', colors.gray);
        await $`scp /tmp/uploads.tar ${VPS_HOST}:/tmp/uploads.tar`;

        // Extract in pod
        log('  Extracting in pod...', colors.gray);
        await sshCmd(`kubectl cp /tmp/uploads.tar ${K8S_NAMESPACE}/${podName}:${REMOTE_UPLOADS_PATH}/uploads.tar`);
        await sshCmd(`kubectl exec -n ${K8S_NAMESPACE} ${podName} -- tar -xf ${REMOTE_UPLOADS_PATH}/uploads.tar -C ${REMOTE_UPLOADS_PATH}`);
        await sshCmd(`kubectl exec -n ${K8S_NAMESPACE} ${podName} -- rm ${REMOTE_UPLOADS_PATH}/uploads.tar`);

        // Cleanup
        await $`rm /tmp/uploads.tar`;
        await sshCmd('rm /tmp/uploads.tar');

        log(`  ${colors.green}${uploadFiles.length} files synced!${colors.reset}`);
      } catch (error: any) {
        log(`  ${colors.red}Failed to sync uploads: ${error.message}${colors.reset}`, colors.red);
        process.exit(1);
      }
    }
  }

  // Done
  console.log(`
${colors.bold}${colors.green}========================================
   Sync complete!
========================================${colors.reset}
`);

  log('Data synced to K8s pod. Data persists in PVC.', colors.green);
  log('\nNote: Database changes are visible immediately. No restart needed.', colors.gray);
}

main().catch((error) => {
  log(`\nError: ${error.message}`, colors.red);
  process.exit(1);
});
