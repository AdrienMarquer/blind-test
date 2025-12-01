/**
 * Reprocess Uploads Script
 *
 * Re-encodes existing MP3 files with:
 * - 60 second clip (from start)
 * - 128kbps bitrate
 * - Loudness normalization (EBU R128)
 *
 * Usage:
 *   bun run apps/server/src/db/seed/reprocess-uploads.ts
 *
 * Options:
 *   --dry-run       Show what would be done without making changes
 *   --limit=N       Process only N files
 *   --backup        Keep original files with .backup extension
 */

import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const CONFIG = {
  uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', '..', 'uploads'),
  clipStart: 0,
  clipDuration: 60,
  bitrate: '128k',
  tempSuffix: '.tmp.mp3',
  backupSuffix: '.backup',
};

interface ProcessResult {
  file: string;
  originalSize: number;
  newSize: number;
  savings: number;
  savingsPercent: number;
  error?: string;
}

async function getMP3Duration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    return parseFloat(stdout.trim());
  } catch {
    return 0;
  }
}

async function processFile(
  filePath: string,
  options: { dryRun: boolean; backup: boolean }
): Promise<ProcessResult> {
  const fileName = path.basename(filePath);
  const originalStats = await fs.stat(filePath);
  const originalSize = originalStats.size;

  const result: ProcessResult = {
    file: fileName,
    originalSize,
    newSize: 0,
    savings: 0,
    savingsPercent: 0,
  };

  if (options.dryRun) {
    // Estimate new size (roughly 128kbps * 60s = 960KB)
    result.newSize = 960 * 1024;
    result.savings = originalSize - result.newSize;
    result.savingsPercent = (result.savings / originalSize) * 100;
    return result;
  }

  const tempPath = filePath + CONFIG.tempSuffix;
  const backupPath = filePath + CONFIG.backupSuffix;

  try {
    // Get original duration to check if clipping is needed
    const duration = await getMP3Duration(filePath);
    const needsClipping = duration > CONFIG.clipDuration + 5; // 5s tolerance

    // Build ffmpeg command
    const ffmpegArgs = [
      '-i', `"${filePath}"`,
      '-ss', CONFIG.clipStart.toString(),
      '-t', CONFIG.clipDuration.toString(),
      '-b:a', CONFIG.bitrate,
      '-af', 'loudnorm=I=-16:LRA=11:TP=-1.5',
      '-y', // Overwrite output
      `"${tempPath}"`
    ].join(' ');

    const cmd = `ffmpeg ${ffmpegArgs} 2>/dev/null`;
    await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });

    // Get new file size
    const newStats = await fs.stat(tempPath);
    result.newSize = newStats.size;
    result.savings = originalSize - result.newSize;
    result.savingsPercent = (result.savings / originalSize) * 100;

    // Backup or delete original
    if (options.backup) {
      await fs.rename(filePath, backupPath);
    }

    // Replace original with processed file
    await fs.rename(tempPath, filePath);

  } catch (error: any) {
    result.error = error.message || String(error);
    // Clean up temp file if it exists
    try {
      await fs.unlink(tempPath);
    } catch {}
  }

  return result;
}

async function main() {
  console.log('🎵 Reprocess Uploads Script');
  console.log('===========================\n');

  // Parse arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const backup = args.includes('--backup');
  let limit = Infinity;

  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10);
    }
  }

  if (dryRun) console.log('🔍 Dry run mode - no changes will be made\n');
  if (backup) console.log('💾 Backup mode - originals will be kept with .backup extension\n');

  // Check ffmpeg is available
  try {
    await execAsync('ffmpeg -version');
  } catch {
    console.error('❌ ffmpeg not found. Please install ffmpeg first.');
    process.exit(1);
  }

  // Get list of MP3 files
  const files = await fs.readdir(CONFIG.uploadDir);
  const mp3Files = files
    .filter(f => f.endsWith('.mp3') && !f.endsWith(CONFIG.tempSuffix) && !f.endsWith(CONFIG.backupSuffix))
    .slice(0, limit);

  console.log(`📂 Found ${mp3Files.length} MP3 files to process\n`);

  const results: ProcessResult[] = [];
  let totalOriginalSize = 0;
  let totalNewSize = 0;
  let errors = 0;

  for (let i = 0; i < mp3Files.length; i++) {
    const file = mp3Files[i];
    const filePath = path.join(CONFIG.uploadDir, file);

    process.stdout.write(`[${i + 1}/${mp3Files.length}] ${file}... `);

    const result = await processFile(filePath, { dryRun, backup });
    results.push(result);

    if (result.error) {
      console.log(`❌ ${result.error}`);
      errors++;
    } else {
      const originalMB = (result.originalSize / (1024 * 1024)).toFixed(2);
      const newMB = (result.newSize / (1024 * 1024)).toFixed(2);
      console.log(`✓ ${originalMB}MB → ${newMB}MB (-${result.savingsPercent.toFixed(0)}%)`);
      totalOriginalSize += result.originalSize;
      totalNewSize += result.newSize;
    }
  }

  // Summary
  console.log('\n===========================');
  console.log('📊 Summary:');
  console.log(`   Files processed: ${mp3Files.length - errors}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Original size: ${(totalOriginalSize / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   New size: ${(totalNewSize / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   Space saved: ${((totalOriginalSize - totalNewSize) / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   Reduction: ${((1 - totalNewSize / totalOriginalSize) * 100).toFixed(1)}%`);

  if (dryRun) {
    console.log('\n⚠️  This was a dry run. Run without --dry-run to apply changes.');
  }
}

main().catch(console.error);
