/**
 * MP3 Metadata Extraction Utility
 * Extracts ID3 tags and audio info from music files
 */

import { parseFile } from 'music-metadata';
import type { IAudioMetadata } from 'music-metadata';

export interface ExtractedMetadata {
  title: string;
  artist: string;
  album?: string;
  year: number;
  genre?: string;
  duration: number; // seconds
  format: string;
}

/**
 * Extract metadata from an audio file
 */
export async function extractMetadata(filePath: string): Promise<ExtractedMetadata> {
  try {
    const metadata: IAudioMetadata = await parseFile(filePath);

    // Extract basic tags
    const title = metadata.common.title || extractTitleFromFilename(filePath);
    const artist = metadata.common.artist || 'Unknown Artist';
    const album = metadata.common.album;
    const year = metadata.common.year || extractYearFromMetadata(metadata);
    const genre = metadata.common.genre?.[0]; // Genre is an array
    const duration = Math.floor(metadata.format.duration || 0);
    const format = metadata.format.container || 'mp3';

    // Year is mandatory - if not found, throw error
    if (!year) {
      throw new Error(
        `No year information found in file metadata. Please ensure the file has ID3 tags with year information.`
      );
    }

    return {
      title,
      artist,
      album,
      year,
      genre,
      duration,
      format,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to extract metadata: ${error.message}`);
    }
    throw new Error('Failed to extract metadata from audio file');
  }
}

/**
 * Extract title from filename if ID3 tag is missing
 * Example: "01 - Artist - Song Title.mp3" -> "Song Title"
 */
function extractTitleFromFilename(filePath: string): string {
  const filename = filePath.split('/').pop() || '';
  const nameWithoutExt = filename.replace(/\.(mp3|m4a|wav|flac)$/i, '');

  // Try to parse "Track - Artist - Title" format
  const parts = nameWithoutExt.split(' - ');
  if (parts.length >= 2) {
    return parts[parts.length - 1].trim();
  }

  // Try to remove leading track numbers
  const withoutTrackNumber = nameWithoutExt.replace(/^\d+[\s.-]*/, '');
  return withoutTrackNumber || 'Unknown Title';
}

/**
 * Try to extract year from various metadata fields
 */
function extractYearFromMetadata(metadata: IAudioMetadata): number | undefined {
  // Try year field
  if (metadata.common.year) return metadata.common.year;

  // Try date field (YYYY-MM-DD or YYYY)
  if (metadata.common.date) {
    const yearMatch = metadata.common.date.match(/^(\d{4})/);
    if (yearMatch) return parseInt(yearMatch[1], 10);
  }

  // Try originalyear (ID3v2.4)
  if (metadata.common.originalyear) return metadata.common.originalyear;

  return undefined;
}

/**
 * Validate that a file is a supported audio format
 */
export function isSupportedAudioFormat(filename: string): boolean {
  const supportedFormats = ['.mp3', '.m4a', '.wav', '.flac'];
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  return ext ? supportedFormats.includes(ext) : false;
}

/**
 * Get the file format from filename
 */
export function getFileFormat(filename: string): string {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  return ext ? ext.substring(1) : 'mp3';
}
