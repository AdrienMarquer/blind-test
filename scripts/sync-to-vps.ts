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
  logStep(1, 6, 'Validating local directories...');

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
  logStep(2, 6, 'Testing SSH connection...');
  try {
    await $`ssh -o ConnectTimeout=5 -o BatchMode=yes ${VPS_HOST} echo "connected"`.quiet();
    log(`  ${colors.green}SSH connection: OK${colors.reset}`);
  } catch (error) {
    log(`  ${colors.red}SSH connection failed${colors.reset}`, colors.red);
    log(`  Make sure you have SSH access to ${VPS_HOST}`, colors.gray);
    process.exit(1);
  }

  // Step 3: Get pod name
  logStep(3, 6, 'Finding K8s pod...');
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
  logStep(4, 6, 'Syncing database...');
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

    // Delete WAL files in pod to force SQLite to read from the new db file
    log('  Cleaning up WAL files in pod...', colors.gray);
    await sshCmd(`kubectl exec -n ${K8S_NAMESPACE} ${podName} -- rm -f ${REMOTE_DATA_PATH}/blind-test.db-shm ${REMOTE_DATA_PATH}/blind-test.db-wal 2>/dev/null || true`);

    // Cleanup temp file
    await sshCmd('rm /tmp/blind-test.db');

    log(`  ${colors.green}Database synced!${colors.reset}`);
  } catch (error: any) {
    log(`  ${colors.red}Failed to sync database: ${error.message}${colors.reset}`, colors.red);
    process.exit(1);
  }

  // Step 5: Sync uploads
  logStep(5, 6, 'Syncing music files...');
  if (!existsSync(LOCAL_UPLOADS_DIR)) {
    log('  No uploads directory, skipping...', colors.yellow);
  } else {
    const uploadFiles = readdirSync(LOCAL_UPLOADS_DIR).filter(f => f.endsWith('.mp3'));
    if (uploadFiles.length === 0) {
      log('  No music files to sync', colors.yellow);
    } else {
      log(`  Syncing ${uploadFiles.length} MP3 files...`, colors.gray);

      try {
        // Get list of files already in pod
        log('  Checking existing files in pod...', colors.gray);
        let existingFiles: Set<string> = new Set();
        try {
          const podFiles = await sshCmd(`kubectl exec -n ${K8S_NAMESPACE} ${podName} -- ls ${REMOTE_UPLOADS_PATH}/ 2>/dev/null || echo ""`);
          existingFiles = new Set(podFiles.split('\n').filter(f => f.endsWith('.mp3')));
          log(`    Found ${existingFiles.size} files already in pod`, colors.gray);
        } catch {
          log('    No existing files in pod', colors.gray);
        }

        // Filter to only new files
        const newFiles = uploadFiles.filter(f => !existingFiles.has(f));

        if (newFiles.length === 0) {
          log(`  ${colors.green}All ${uploadFiles.length} files already in pod, nothing to sync!${colors.reset}`);
        } else {
          log(`  ${newFiles.length} new files to sync (${existingFiles.size} already exist)`, colors.gray);

          // Use rsync to VPS temp directory (only new files)
          log('  Rsync new files to VPS...', colors.gray);
          await $`rsync -avz --progress ${LOCAL_UPLOADS_DIR}/ ${VPS_HOST}:/tmp/blindtest-uploads/`;

          // Copy only new files from VPS to pod
          log('  Copying new files to pod...', colors.gray);

          const batchSize = 20;
          for (let i = 0; i < newFiles.length; i += batchSize) {
            const batch = newFiles.slice(i, i + batchSize);
            const progress = Math.min(i + batchSize, newFiles.length);
            log(`    Progress: ${progress}/${newFiles.length} new files...`, colors.gray);

            for (const file of batch) {
              await sshCmd(`kubectl cp /tmp/blindtest-uploads/${file} ${K8S_NAMESPACE}/${podName}:${REMOTE_UPLOADS_PATH}/${file}`);
            }
          }

          // Cleanup VPS temp
          await sshCmd('rm -rf /tmp/blindtest-uploads');

          log(`  ${colors.green}${newFiles.length} new files synced!${colors.reset}`);
        }
      } catch (error: any) {
        log(`  ${colors.red}Failed to sync uploads: ${error.message}${colors.reset}`, colors.red);
        process.exit(1);
      }
    }
  }

  // Step 6: Restart pod for clean state
  logStep(6, 6, 'Restarting pod for clean state...');
  try {
    await sshCmd(`kubectl rollout restart deployment/${K8S_DEPLOYMENT} -n ${K8S_NAMESPACE}`);
    log(`  ${colors.green}Pod restart initiated${colors.reset}`);

    // Wait for rollout to complete
    log('  Waiting for rollout to complete...', colors.gray);
    await sshCmd(`kubectl rollout status deployment/${K8S_DEPLOYMENT} -n ${K8S_NAMESPACE} --timeout=60s`);
    log(`  ${colors.green}Pod restarted successfully!${colors.reset}`);
  } catch (error: any) {
    log(`  ${colors.yellow}Warning: Pod restart failed: ${error.message}${colors.reset}`, colors.yellow);
    log('  You may need to manually restart: kubectl rollout restart deployment/blind-test -n adrien', colors.gray);
  }

  // Done
  console.log(`
${colors.bold}${colors.green}========================================
   Sync complete!
========================================${colors.reset}
`);

  log('Data synced to K8s pod and pod restarted.', colors.green);
  log('Changes are now live at https://quiz.amrqr.fr', colors.gray);
}

main().catch((error) => {
  log(`\nError: ${error.message}`, colors.red);
  process.exit(1);
});
