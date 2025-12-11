/**
 * Fetch Spotify Playlist to Seed JSON
 *
 * Fetches tracks from a Spotify playlist and generates a seed JSON file
 * compatible with seed-musiques.ts
 *
 * Usage:
 *   bun run apps/server/src/db/seed/fetch-playlist.ts --url=<PLAYLIST_URL>
 *
 * Options:
 *   --url       Spotify playlist URL or URI (required)
 *   --output    Output JSON filename (optional, auto-generated from playlist name)
 *   --niche     Mark all songs as niche (default: false)
 *   --dry-run   Don't write file, just show what would be fetched
 */

import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import path from 'path';
import fs from 'fs/promises';
import { db, schema, runMigrations } from '../index';
import { getAllSeedEntries, type SeedEntry } from './musiques';

// ============================================================================
// Configuration
// ============================================================================

const PLAYLISTS_DIR = path.join(__dirname, 'playlists');

// ============================================================================
// Types
// ============================================================================

interface PlaylistTrack {
  title: string;
  artist: string;
  spotifyId: string;
}

interface DuplicateInfo {
  source: 'database_spotify' | 'database_name' | 'seed_file' | 'playlist';
  existing: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Normalize string for comparison (lowercase, remove accents, trim)
 */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Sanitize playlist name for use as filename
 */
function sanitizeForFilename(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s-]/g, '')    // Remove special chars
    .replace(/\s+/g, '-')            // Spaces to dashes
    .replace(/-+/g, '-')             // Collapse multiple dashes
    .replace(/^-|-$/g, '')           // Trim leading/trailing dashes
    .substring(0, 50);               // Limit length
}

/**
 * Parse Spotify playlist URL or URI to get playlist ID
 * Supports:
 *   - https://open.spotify.com/playlist/37i9dQZF1DX1X7WV84927n
 *   - spotify:playlist:37i9dQZF1DX1X7WV84927n
 *   - 37i9dQZF1DX1X7WV84927n (raw ID)
 */
function parsePlaylistId(input: string): string | null {
  // Already a raw ID (22 alphanumeric chars)
  if (/^[a-zA-Z0-9]{22}$/.test(input)) {
    return input;
  }

  // URL format
  const urlMatch = input.match(/playlist\/([a-zA-Z0-9]{22})/);
  if (urlMatch) return urlMatch[1];

  // URI format
  const uriMatch = input.match(/spotify:playlist:([a-zA-Z0-9]{22})/);
  if (uriMatch) return uriMatch[1];

  return null;
}

/**
 * Extract primary artist name (handles "feat.", "ft.", "&", etc.)
 */
function extractPrimaryArtist(artists: string[]): string {
  if (artists.length === 0) return 'Unknown';

  // Return first artist only (primary)
  return artists[0];
}

// ============================================================================
// Spotify Client
// ============================================================================

class SpotifyPlaylistFetcher {
  private api: SpotifyApi | null = null;

  async initialize(): Promise<boolean> {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('❌ Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET');
      console.error('   Set these environment variables before running.');
      return false;
    }

    try {
      this.api = SpotifyApi.withClientCredentials(clientId, clientSecret);
      console.log('✅ Spotify API initialized\n');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Spotify:', error);
      return false;
    }
  }

  async getPlaylistInfo(playlistId: string): Promise<{ name: string; total: number } | null> {
    if (!this.api) return null;

    try {
      const playlist = await this.api.playlists.getPlaylist(playlistId);
      return {
        name: playlist.name,
        total: playlist.tracks.total,
      };
    } catch (error: any) {
      // Handle Spotify's November 2024 API changes
      // Editorial/algorithmic playlists now return 404 for client credentials flow
      if (error.message?.includes('404')) {
        console.error('❌ Playlist not accessible (404)');
        console.error('');
        console.error('   ℹ️  Since November 2024, Spotify blocks access to:');
        console.error('      - Editorial playlists (e.g., "Today\'s Top Hits")');
        console.error('      - Algorithmic playlists (e.g., "Discover Weekly")');
        console.error('');
        console.error('   ✅ Workarounds:');
        console.error('      1. Use your own playlist (create one and add songs to it)');
        console.error('      2. Use user-created public playlists');
        console.error('');
        return null;
      }
      console.error('❌ Failed to fetch playlist:', error);
      return null;
    }
  }

  async fetchAllTracks(playlistId: string): Promise<PlaylistTrack[]> {
    if (!this.api) return [];

    const tracks: PlaylistTrack[] = [];
    let offset = 0;
    const limit = 50;

    try {
      while (true) {
        const response = await this.api.playlists.getPlaylistItems(
          playlistId,
          undefined,
          undefined,
          limit,
          offset
        );

        for (const item of response.items) {
          if (item.track && 'name' in item.track && item.track.type === 'track') {
            const track = item.track;
            tracks.push({
              title: track.name,
              artist: extractPrimaryArtist(track.artists.map(a => a.name)),
              spotifyId: track.id,
            });
          }
        }

        if (response.next === null) break;
        offset += limit;

        // Progress indicator
        process.stdout.write(`\r  Fetched ${tracks.length}/${response.total} tracks...`);
      }
      console.log(''); // New line after progress

      return tracks;
    } catch (error) {
      console.error('❌ Failed to fetch tracks:', error);
      return tracks;
    }
  }
}

// ============================================================================
// Deduplication Service
// ============================================================================

class DeduplicationService {
  private dbSpotifyIds: Set<string> = new Set();
  private dbNames: Set<string> = new Set();
  private seedNames: Set<string> = new Set();

  async initialize(): Promise<void> {
    console.log('🔍 Loading existing data for deduplication...');

    // Load from database
    try {
      runMigrations();
      const songs = await db
        .select({
          spotifyId: schema.songs.spotifyId,
          title: schema.songs.title,
          artist: schema.songs.artist,
        })
        .from(schema.songs);

      for (const song of songs) {
        if (song.spotifyId) {
          this.dbSpotifyIds.add(song.spotifyId);
        }
        const key = `${normalize(song.artist)}|${normalize(song.title)}`;
        this.dbNames.add(key);
      }
      console.log(`   Database: ${songs.length} songs loaded`);
    } catch (error) {
      console.warn('   ⚠️ Could not load database (may not exist yet)');
    }

    // Load from seed files
    try {
      const seedEntries = getAllSeedEntries();
      for (const entry of seedEntries) {
        const key = `${normalize(entry.artist)}|${normalize(entry.title)}`;
        this.seedNames.add(key);
      }
      console.log(`   Seed files: ${seedEntries.length} entries loaded`);
    } catch (error) {
      console.warn('   ⚠️ Could not load seed files');
    }

    console.log('');
  }

  checkDuplicate(track: PlaylistTrack): DuplicateInfo | null {
    // Check by Spotify ID in database
    if (this.dbSpotifyIds.has(track.spotifyId)) {
      return { source: 'database_spotify', existing: track.spotifyId };
    }

    const key = `${normalize(track.artist)}|${normalize(track.title)}`;

    // Check by name in database
    if (this.dbNames.has(key)) {
      return { source: 'database_name', existing: `${track.artist} - ${track.title}` };
    }

    // Check by name in seed files
    if (this.seedNames.has(key)) {
      return { source: 'seed_file', existing: `${track.artist} - ${track.title}` };
    }

    return null;
  }

  markAsAdded(track: PlaylistTrack): void {
    const key = `${normalize(track.artist)}|${normalize(track.title)}`;
    this.seedNames.add(key);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('🎵 Spotify Playlist to Seed JSON');
  console.log('=================================\n');

  // Parse arguments
  const args = process.argv.slice(2);
  let playlistUrl: string | null = null;
  let outputFile: string | null = null;
  let niche = false;
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith('--url=')) {
      playlistUrl = arg.split('=').slice(1).join('=');
    } else if (arg.startsWith('--output=')) {
      outputFile = arg.split('=').slice(1).join('=');
    } else if (arg === '--niche') {
      niche = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  // Validate arguments
  if (!playlistUrl) {
    console.error('❌ Missing --url argument');
    console.error('   Usage: bun run fetch-playlist.ts --url=<PLAYLIST_URL>');
    process.exit(1);
  }

  const playlistId = parsePlaylistId(playlistUrl);
  if (!playlistId) {
    console.error('❌ Invalid playlist URL/URI format');
    console.error('   Supported formats:');
    console.error('   - https://open.spotify.com/playlist/37i9dQZF1DX1X7WV84927n');
    console.error('   - spotify:playlist:37i9dQZF1DX1X7WV84927n');
    process.exit(1);
  }

  console.log(`📋 Playlist ID: ${playlistId}`);
  if (niche) console.log(`🎯 Niche: true`);
  if (dryRun) console.log(`🔍 Dry run mode`);
  console.log('');

  // Initialize services
  const spotify = new SpotifyPlaylistFetcher();
  const dedup = new DeduplicationService();

  const spotifyReady = await spotify.initialize();
  if (!spotifyReady) {
    process.exit(1);
  }

  await dedup.initialize();

  // Get playlist info
  const playlistInfo = await spotify.getPlaylistInfo(playlistId);
  if (!playlistInfo) {
    console.error('❌ Could not fetch playlist. Check if URL is correct and playlist is public.');
    process.exit(1);
  }

  console.log(`🎶 Playlist: "${playlistInfo.name}"`);
  console.log(`   Total tracks: ${playlistInfo.total}`);

  // Auto-generate output filename from playlist name if not provided
  if (!outputFile) {
    outputFile = sanitizeForFilename(playlistInfo.name) + '.json';
  } else if (!outputFile.endsWith('.json')) {
    outputFile += '.json';
  }

  const outputPath = path.join(PLAYLISTS_DIR, outputFile);
  console.log(`📁 Output: ${outputFile}\n`);

  // Fetch all tracks
  console.log('📥 Fetching tracks from Spotify...');
  const tracks = await spotify.fetchAllTracks(playlistId);
  console.log(`   Fetched ${tracks.length} tracks\n`);

  // Deduplicate
  console.log('🔄 Checking for duplicates...');
  const newTracks: SeedEntry[] = [];
  const duplicates: { track: PlaylistTrack; info: DuplicateInfo }[] = [];
  const playlistSeen = new Set<string>();

  for (const track of tracks) {
    // Check for duplicates within this playlist
    const playlistKey = `${normalize(track.artist)}|${normalize(track.title)}`;
    if (playlistSeen.has(playlistKey)) {
      duplicates.push({
        track,
        info: { source: 'playlist', existing: `${track.artist} - ${track.title}` },
      });
      continue;
    }
    playlistSeen.add(playlistKey);

    // Check against database and seed files
    const dupInfo = dedup.checkDuplicate(track);
    if (dupInfo) {
      duplicates.push({ track, info: dupInfo });
      continue;
    }

    // New track!
    newTracks.push({
      title: track.title,
      artist: track.artist,
      ...(niche && { niche }),
    });

    dedup.markAsAdded(track);
  }

  // Summary
  console.log('\n📊 Results:');
  console.log(`   Total tracks: ${tracks.length}`);
  console.log(`   ✅ New tracks: ${newTracks.length}`);
  console.log(`   ⏭️  Duplicates: ${duplicates.length}`);

  if (duplicates.length > 0) {
    const bySource = {
      database_spotify: 0,
      database_name: 0,
      seed_file: 0,
      playlist: 0,
    };
    for (const dup of duplicates) {
      bySource[dup.info.source]++;
    }
    console.log('      Breakdown:');
    if (bySource.database_spotify > 0) console.log(`      - In database (by Spotify ID): ${bySource.database_spotify}`);
    if (bySource.database_name > 0) console.log(`      - In database (by name): ${bySource.database_name}`);
    if (bySource.seed_file > 0) console.log(`      - In seed files: ${bySource.seed_file}`);
    if (bySource.playlist > 0) console.log(`      - Duplicates in playlist: ${bySource.playlist}`);
  }

  if (newTracks.length === 0) {
    console.log('\n✨ No new tracks to add!');
    return;
  }

  // Write output
  if (dryRun) {
    console.log('\n🔍 Dry run - would write these tracks:');
    for (const track of newTracks.slice(0, 10)) {
      console.log(`   - ${track.artist} - ${track.title}`);
    }
    if (newTracks.length > 10) {
      console.log(`   ... and ${newTracks.length - 10} more`);
    }
  } else {
    // Ensure playlists directory exists
    await fs.mkdir(PLAYLISTS_DIR, { recursive: true });

    // Check if file exists and merge
    let existingTracks: SeedEntry[] = [];
    try {
      const existing = await fs.readFile(outputPath, 'utf-8');
      existingTracks = JSON.parse(existing) as SeedEntry[];
      console.log(`\n📂 Appending to existing file (${existingTracks.length} existing tracks)`);
    } catch {
      // File doesn't exist, that's fine
    }

    const allTracks = [...existingTracks, ...newTracks];
    await fs.writeFile(outputPath, JSON.stringify(allTracks, null, 2));
    console.log(`\n✅ Saved ${newTracks.length} new tracks to playlists/${outputFile}`);
    console.log(`   Total tracks in file: ${allTracks.length}`);
  }

  // Show next steps
  console.log('\n📝 Next steps:');
  console.log(`   1. Review: src/db/seed/playlists/${outputFile}`);
  console.log(`   2. Run seed-musiques.ts to download and process (auto-imported!)`);
}

// Run
main().catch(console.error);
