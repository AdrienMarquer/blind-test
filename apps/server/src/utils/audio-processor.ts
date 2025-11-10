/**
 * Audio Processing Utilities
 * Handles audio trimming, format conversion, and waveform generation using FFmpeg
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { unlink, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from './logger';

const execPromise = promisify(exec);
const audioLogger = logger.child({ module: 'AudioProcessor' });

export interface TrimOptions {
  inputPath: string;
  outputPath: string;
  startTime: number; // seconds
  duration: number; // seconds (e.g., 45)
  format?: 'mp3' | 'm4a' | 'wav' | 'flac';
  bitrate?: string; // e.g., '192k'
}

export interface AudioInfo {
  duration: number; // seconds
  bitrate: number; // kbps
  sampleRate: number; // Hz
  channels: number;
  format: string;
  fileSize: number; // bytes
}

/**
 * Check if FFmpeg is installed
 */
export async function checkFFmpegInstalled(): Promise<boolean> {
  try {
    await execPromise('ffmpeg -version');
    return true;
  } catch (error) {
    audioLogger.error('FFmpeg not found. Please install FFmpeg to enable audio processing.');
    return false;
  }
}

/**
 * Get audio file information using FFprobe
 */
export async function getAudioInfo(filePath: string): Promise<AudioInfo> {
  try {
    const { stdout } = await execPromise(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
    );

    const data = JSON.parse(stdout);
    const audioStream = data.streams.find((s: any) => s.codec_type === 'audio');

    if (!audioStream) {
      throw new Error('No audio stream found in file');
    }

    const stats = await stat(filePath);

    return {
      duration: parseFloat(data.format.duration),
      bitrate: parseInt(data.format.bit_rate) / 1000, // Convert to kbps
      sampleRate: parseInt(audioStream.sample_rate),
      channels: audioStream.channels,
      format: data.format.format_name,
      fileSize: stats.size,
    };
  } catch (error) {
    audioLogger.error('Failed to get audio info', error, { filePath });
    throw new Error(`Failed to analyze audio file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Trim audio file to a specific duration starting at a specific time
 * This is the main function for creating 45-second clips
 */
export async function trimAudio(options: TrimOptions): Promise<{ success: boolean; outputPath: string; fileSize: number }> {
  const { inputPath, outputPath, startTime, duration, format = 'mp3', bitrate = '192k' } = options;

  // Validate input file exists
  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  // Check FFmpeg availability
  const ffmpegAvailable = await checkFFmpegInstalled();
  if (!ffmpegAvailable) {
    throw new Error('FFmpeg is not installed. Audio trimming requires FFmpeg.');
  }

  try {
    audioLogger.info('Trimming audio', {
      inputPath,
      outputPath,
      startTime,
      duration,
      format,
      bitrate
    });

    // Build FFmpeg command
    // -ss: start time
    // -t: duration
    // -i: input file
    // -ab: audio bitrate
    // -y: overwrite output file
    const command = [
      'ffmpeg',
      '-ss', startTime.toString(),
      '-t', duration.toString(),
      '-i', `"${inputPath}"`,
      '-ab', bitrate,
      '-map', 'a', // Only include audio stream
      '-y', // Overwrite output
      `"${outputPath}"`
    ].join(' ');

    audioLogger.debug('Executing FFmpeg command', { command });

    await execPromise(command);

    // Verify output file was created
    if (!existsSync(outputPath)) {
      throw new Error('FFmpeg completed but output file was not created');
    }

    // Get output file size
    const stats = await stat(outputPath);

    audioLogger.info('Audio trimmed successfully', {
      outputPath,
      fileSize: stats.size
    });

    return {
      success: true,
      outputPath,
      fileSize: stats.size,
    };
  } catch (error) {
    audioLogger.error('Audio trimming failed', error, { inputPath, outputPath });

    // Clean up output file if it was partially created
    if (existsSync(outputPath)) {
      try {
        await unlink(outputPath);
      } catch (unlinkError) {
        // Ignore cleanup errors
      }
    }

    throw new Error(`Failed to trim audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Replace original file with trimmed version
 * Useful for optimizing storage by replacing full songs with clips
 */
export async function trimAndReplace(options: Omit<TrimOptions, 'outputPath'>): Promise<{ success: boolean; fileSize: number }> {
  const tempPath = `${options.inputPath}.tmp${path.extname(options.inputPath)}`;

  try {
    // Trim to temp file
    const result = await trimAudio({
      ...options,
      outputPath: tempPath,
    });

    // Delete original
    await unlink(options.inputPath);

    // Rename temp to original
    await execPromise(`mv "${tempPath}" "${options.inputPath}"`);

    audioLogger.info('Audio replaced with trimmed version', {
      path: options.inputPath,
      originalSize: result.fileSize
    });

    return {
      success: true,
      fileSize: result.fileSize,
    };
  } catch (error) {
    // Clean up temp file if it exists
    if (existsSync(tempPath)) {
      try {
        await unlink(tempPath);
      } catch (unlinkError) {
        // Ignore cleanup errors
      }
    }

    throw error;
  }
}

/**
 * Generate waveform data for visualization
 * Returns array of peak values for client-side rendering
 */
export async function generateWaveformData(
  filePath: string,
  samples: number = 200
): Promise<number[]> {
  try {
    // Use FFmpeg to extract audio data
    const { stdout } = await execPromise(
      `ffmpeg -i "${filePath}" -ac 1 -filter:a "aresample=8000,volumedetect" -f null - 2>&1`
    );

    // This is a simplified version - for production, you'd want to use a proper waveform library
    // or implement a more sophisticated FFmpeg pipeline
    // For now, return placeholder data
    audioLogger.warn('Waveform generation not fully implemented, returning placeholder');

    // Return normalized random data as placeholder
    return Array.from({ length: samples }, () => Math.random());
  } catch (error) {
    audioLogger.error('Waveform generation failed', error, { filePath });
    throw new Error('Failed to generate waveform data');
  }
}

/**
 * Convert audio to a different format
 */
export async function convertAudioFormat(
  inputPath: string,
  outputPath: string,
  targetFormat: 'mp3' | 'm4a' | 'wav' | 'flac',
  bitrate: string = '192k'
): Promise<void> {
  const ffmpegAvailable = await checkFFmpegInstalled();
  if (!ffmpegAvailable) {
    throw new Error('FFmpeg is not installed');
  }

  try {
    const command = `ffmpeg -i "${inputPath}" -ab ${bitrate} -y "${outputPath}"`;
    await execPromise(command);

    audioLogger.info('Audio format converted', { inputPath, outputPath, targetFormat });
  } catch (error) {
    audioLogger.error('Format conversion failed', error, { inputPath, outputPath });
    throw new Error(`Failed to convert audio format: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
