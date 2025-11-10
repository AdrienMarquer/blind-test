#!/usr/bin/env bun
/**
 * Bulk Upload Songs Script
 *
 * Usage:
 *   bun scripts/bulk-upload-songs.ts <folder-path>
 *
 * Examples:
 *   bun scripts/bulk-upload-songs.ts ~/Music
 *   bun scripts/bulk-upload-songs.ts ./my-songs
 */

import { readdir, stat } from 'fs/promises';
import { join, extname, basename } from 'path';

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3007';
const SUPPORTED_FORMATS = ['.mp3', '.m4a', '.wav', '.flac'];

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

interface UploadResult {
  file: string;
  status: 'success' | 'duplicate' | 'error';
  message?: string;
  song?: {
    title: string;
    artist: string;
  };
}

/**
 * Recursively find all audio files in a directory
 */
async function findAudioFiles(dirPath: string): Promise<string[]> {
  const audioFiles: string[] = [];

  async function scanDirectory(currentPath: string) {
    try {
      const entries = await readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);

        if (entry.isDirectory()) {
          // Recurse into subdirectories
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (SUPPORTED_FORMATS.includes(ext)) {
            audioFiles.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`${colors.red}Error scanning directory ${currentPath}:${colors.reset}`, error);
    }
  }

  await scanDirectory(dirPath);
  return audioFiles;
}

/**
 * Upload a single file to the server
 */
async function uploadFile(filePath: string): Promise<UploadResult> {
  try {
    // Read file as Blob
    const file = Bun.file(filePath);
    const blob = await file.arrayBuffer();

    // Create FormData
    const formData = new FormData();
    formData.append('file', new Blob([blob]), basename(filePath));

    // Upload to server
    const response = await fetch(`${SERVER_URL}/api/songs/upload`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (response.ok) {
      return {
        file: filePath,
        status: 'success',
        song: {
          title: data.title,
          artist: data.artist,
        },
      };
    } else if (response.status === 409) {
      // Duplicate
      return {
        file: filePath,
        status: 'duplicate',
        message: data.error || 'Already exists',
      };
    } else {
      return {
        file: filePath,
        status: 'error',
        message: data.error || `HTTP ${response.status}`,
      };
    }
  } catch (error) {
    return {
      file: filePath,
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Main execution
 */
async function main() {
  console.log(`${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.blue}   🎵 Blind Test - Bulk Song Upload${colors.reset}`);
  console.log(`${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

  // Parse arguments
  const folderPath = process.argv[2];

  if (!folderPath) {
    console.error(`${colors.red}Error: No folder path provided${colors.reset}`);
    console.log('\nUsage: bun scripts/bulk-upload-songs.ts <folder-path>');
    console.log('Example: bun scripts/bulk-upload-songs.ts ~/Music\n');
    process.exit(1);
  }

  // Check if folder exists
  try {
    const stats = await stat(folderPath);
    if (!stats.isDirectory()) {
      console.error(`${colors.red}Error: ${folderPath} is not a directory${colors.reset}\n`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`${colors.red}Error: Folder not found: ${folderPath}${colors.reset}\n`);
    process.exit(1);
  }

  // Check server availability
  console.log(`${colors.gray}Checking server at ${SERVER_URL}...${colors.reset}`);
  try {
    const response = await fetch(`${SERVER_URL}/api/songs`);
    if (!response.ok) {
      throw new Error('Server not responding');
    }
    console.log(`${colors.green}✓ Server is online${colors.reset}\n`);
  } catch (error) {
    console.error(`${colors.red}✗ Cannot connect to server at ${SERVER_URL}${colors.reset}`);
    console.error(`${colors.red}  Make sure the server is running with: bun run dev:server${colors.reset}\n`);
    process.exit(1);
  }

  // Find all audio files
  console.log(`${colors.gray}Scanning for audio files in: ${folderPath}${colors.reset}`);
  const audioFiles = await findAudioFiles(folderPath);

  if (audioFiles.length === 0) {
    console.log(`${colors.yellow}No audio files found (${SUPPORTED_FORMATS.join(', ')})${colors.reset}\n`);
    process.exit(0);
  }

  console.log(`${colors.green}Found ${audioFiles.length} audio file(s)${colors.reset}\n`);

  // Upload files
  const results: UploadResult[] = [];
  let successCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  console.log(`${colors.blue}Starting upload...${colors.reset}\n`);

  for (let i = 0; i < audioFiles.length; i++) {
    const filePath = audioFiles[i];
    const fileName = basename(filePath);
    const progress = `[${i + 1}/${audioFiles.length}]`;

    process.stdout.write(`${colors.gray}${progress} Uploading ${fileName}...${colors.reset}`);

    const result = await uploadFile(filePath);
    results.push(result);

    // Clear line and show result
    process.stdout.write('\r' + ' '.repeat(100) + '\r');

    if (result.status === 'success') {
      successCount++;
      console.log(
        `${colors.green}${progress} ✓ ${fileName}${colors.reset}\n` +
        `${colors.gray}        ${result.song?.title} - ${result.song?.artist}${colors.reset}`
      );
    } else if (result.status === 'duplicate') {
      duplicateCount++;
      console.log(
        `${colors.yellow}${progress} ⊘ ${fileName}${colors.reset}\n` +
        `${colors.gray}        Already exists${colors.reset}`
      );
    } else {
      errorCount++;
      console.log(
        `${colors.red}${progress} ✗ ${fileName}${colors.reset}\n` +
        `${colors.gray}        ${result.message}${colors.reset}`
      );
    }
  }

  // Summary
  console.log(`\n${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.blue}   Summary${colors.reset}`);
  console.log(`${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.green}   ✓ Uploaded: ${successCount}${colors.reset}`);
  console.log(`${colors.yellow}   ⊘ Duplicates: ${duplicateCount}${colors.reset}`);
  console.log(`${colors.red}   ✗ Errors: ${errorCount}${colors.reset}`);
  console.log(`${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

  if (errorCount > 0) {
    console.log(`${colors.red}Some uploads failed. Check the errors above for details.${colors.reset}\n`);
    process.exit(1);
  } else {
    console.log(`${colors.green}Upload complete!${colors.reset}\n`);
  }
}

// Run
main().catch((error) => {
  console.error(`${colors.red}Unexpected error:${colors.reset}`, error);
  process.exit(1);
});
