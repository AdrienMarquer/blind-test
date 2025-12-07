/**
 * Musiques Seed Data
 *
 * This file aggregates all seed data from individual JSON files.
 * Each JSON file represents a category/playlist of songs to seed.
 *
 * To add a new seed source:
 * 1. Create a new JSON file (e.g., myplaylist.json) with an array of { title, artist, lang? } objects
 * 2. Import it here and add it to the seedSources array
 */

import chaiseData from './chaise.json';

// Import processed/existing data
import musiquesData from './musiques.json';

// Type for raw seed entries (minimal data needed to process)
export interface SeedEntry {
  title: string;
  artist: string;
  lang?: string; // ISO 639-1 language code (e.g., 'en', 'fr')
  niche?: boolean; // Is this a niche/obscure song?
}

// Type for enriched songs (after processing)
export interface EnrichedSong extends SeedEntry {
  // From Spotify
  spotifyId?: string;
  album?: string;
  year?: number;
  genre?: string;
  duration?: number;
  albumArt?: string;

  // From YouTube
  youtubeId?: string;
  youtubeTitle?: string;

  // File info
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  format?: string;

  // Playback configuration
  clipStart?: number;
  clipDuration?: number;

  // Processing status
  status?: 'pending' | 'spotify_done' | 'youtube_found' | 'downloaded' | 'failed';
  error?: string;
  processedAt?: string;
}

/**
 * All seed sources - add new JSON imports here
 * Each source is a named collection of songs
 */
export const seedSources: Record<string, SeedEntry[]> = {
  chaise: chaiseData as SeedEntry[],
  // Add more sources here:
  // disco: discoData as SeedEntry[],
  // rock: rockData as SeedEntry[],
};

/**
 * Get all seed entries from all sources (deduplicated)
 */
export function getAllSeedEntries(): SeedEntry[] {
  const seen = new Set<string>();
  const entries: SeedEntry[] = [];

  for (const source of Object.values(seedSources)) {
    for (const entry of source) {
      const key = `${entry.artist.toLowerCase()}|${entry.title.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        entries.push(entry);
      }
    }
  }

  return entries;
}

/**
 * Load existing processed data (enriched songs)
 */
export function getExistingData(): EnrichedSong[] {
  return musiquesData as EnrichedSong[];
}

/**
 * Get existing data as a Map keyed by artist|title for quick lookup
 */
export function getExistingDataMap(): Map<string, EnrichedSong> {
  const map = new Map<string, EnrichedSong>();
  for (const song of musiquesData as EnrichedSong[]) {
    const key = `${song.artist}|${song.title}`;
    map.set(key, song);
  }
  return map;
}

/**
 * Get entries that haven't been processed yet
 */
export function getNewEntries(): SeedEntry[] {
  const existing = getExistingDataMap();
  const allEntries = getAllSeedEntries();

  return allEntries.filter(entry => {
    const key = `${entry.artist}|${entry.title}`;
    return !existing.has(key);
  });
}

/**
 * Get entries that failed processing (for retry)
 */
export function getFailedEntries(): EnrichedSong[] {
  return (musiquesData as EnrichedSong[]).filter(song => song.status === 'failed');
}

// Default export: all unique seed entries
export default getAllSeedEntries();
