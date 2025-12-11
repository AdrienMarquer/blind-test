/**
 * Musiques Seed Data
 *
 * This file aggregates all seed data from individual JSON files.
 * - Manual seed files: placed directly in this folder (e.g., chaise.json)
 * - Playlist imports: auto-loaded from ./playlists/ folder
 *
 * To add songs:
 * 1. Use fetch-playlist.ts to import from Spotify playlists (auto-saved to ./playlists/)
 * 2. Or manually create a JSON file with an array of { title, artist, lang?, niche? } objects
 */

import fs from 'fs';
import path from 'path';

// Import processed/existing data
import musiquesData from './musiques.json';

// Type for raw seed entries (minimal data needed to process)
export interface SeedEntry {
  title: string;
  artist: string;
  lang?: string; // ISO 639-1 language code (e.g., 'en', 'fr')
  niche?: boolean; // Is this a niche/obscure song?
}

// Auto-load all JSON files from playlists folder
const PLAYLISTS_DIR = path.join(__dirname, 'playlists');

function loadPlaylistFiles(): Record<string, SeedEntry[]> {
  const playlists: Record<string, SeedEntry[]> = {};

  try {
    if (!fs.existsSync(PLAYLISTS_DIR)) {
      return playlists;
    }

    const files = fs.readdirSync(PLAYLISTS_DIR).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(PLAYLISTS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as SeedEntry[];
      const name = file.replace('.json', '');
      playlists[name] = data;
    }
  } catch (error) {
    console.warn('Warning: Could not load playlist files:', error);
  }

  return playlists;
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
 * All seed sources - auto-loaded from ./playlists/ folder
 */
export const seedSources: Record<string, SeedEntry[]> = loadPlaylistFiles();

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
