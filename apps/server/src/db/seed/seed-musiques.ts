/**
 * Seed Script for musiques.json
 *
 * Reads musiques.json, fetches Spotify metadata, downloads from YouTube,
 * and updates the file with full song objects matching the app's Song interface.
 *
 * Usage:
 *   bun run apps/server/src/db/seed/seed-musiques.ts
 *
 * Options:
 *   --dry-run          Don't download files, just fetch metadata
 *   --limit=N          Process only N songs
 *   --skip=N           Skip first N songs
 *   --no-download      Fetch metadata only, skip YouTube download
 *   --retry-failed     Only retry entries that previously failed
 *   --fix-album-art    Re-fetch albumArt for songs missing it in DB
 */

import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import YoutubeSearch from 'youtube-search-api';
import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { db, schema, runMigrations } from '../index';
import { generateId } from '@blind-test/shared';
import { sql, isNull, eq } from 'drizzle-orm';
import { GenreMapper } from '../../services/GenreMapper';

const execAsync = promisify(exec);

// ============================================================================
// Helpers
// ============================================================================

/**
 * Sanitize a string for use in filenames
 * - Lowercase, remove accents, remove special chars, replace spaces with underscores
 */
function sanitizeFilename(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s-]/g, '')    // Remove special chars
    .replace(/\s+/g, '_')            // Spaces to underscores
    .replace(/_+/g, '_')             // Collapse multiple underscores
    .replace(/^_|_$/g, '')           // Trim leading/trailing underscores
    .substring(0, 50);               // Limit length
}

// ============================================================================
// Types
// ============================================================================

interface MusiqueEntry {
  title: string;
  artist: string;
  lang?: string; // ISO 639-1 language code (e.g., 'en', 'fr')
}

interface EnrichedSong {
  // Original
  title: string;
  artist: string;
  lang?: string; // ISO 639-1 language code (e.g., 'en', 'fr')

  // From Spotify
  spotifyId?: string;
  album?: string;
  year?: number;
  genre?: string;
  duration?: number; // Full track length in seconds
  albumArt?: string; // Spotify album cover URL

  // From YouTube
  youtubeId?: string;

  // File info (after download)
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

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  inputFile: path.join(__dirname, 'musiques.json'),
  outputFile: path.join(__dirname, 'musiques.json'), // Edit in place
  uploadDir: process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'),

  // Rate limiting
  spotifyDelay: 100,     // ms between Spotify requests
  youtubeDelay: 2000,    // ms between YouTube downloads (be nice to YouTube)

  // Defaults
  defaultClipStart: 0,    // Start at beginning (matches app default)
  defaultClipDuration: 60, // Download 60 seconds
  audioFormat: 'mp3' as const,
  audioQuality: '128k',
};

// ============================================================================
// Spotify Service
// ============================================================================

class SpotifyClient {
  private api: SpotifyApi | null = null;

  async initialize(): Promise<boolean> {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('❌ Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET');
      return false;
    }

    try {
      this.api = SpotifyApi.withClientCredentials(clientId, clientSecret);
      console.log('✅ Spotify API initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Spotify:', error);
      return false;
    }
  }

  async search(title: string, artist: string): Promise<{
    spotifyId: string;
    title: string;
    artist: string;
    album?: string;
    year?: number;
    genre?: string;
    duration: number;
    albumArt?: string;
  } | null> {
    if (!this.api) return null;

    try {
      // Use Spotify's search filters for better accuracy
      const query = `track:${title} artist:${artist}`;
      const results = await this.api.search(query, ['track'], undefined, 10);

      if (results.tracks.items.length === 0) {
        // Fallback to simple search if no results
        const fallbackQuery = `${artist} ${title}`;
        const fallbackResults = await this.api.search(fallbackQuery, ['track'], undefined, 5);
        if (fallbackResults.tracks.items.length === 0) {
          return null;
        }
        results.tracks.items = fallbackResults.tracks.items;
      }

      // Find best match - prefer exact artist name match
      const normalizedArtist = artist.toLowerCase();
      let track = results.tracks.items.find(t =>
        t.artists.some(a => a.name.toLowerCase() === normalizedArtist)
      ) || results.tracks.items[0];

      // Get year from release date
      const year = track.album.release_date
        ? parseInt(track.album.release_date.substring(0, 4))
        : undefined;

      // Get genre from artist using GenreMapper (same as app)
      let genre: string | undefined;
      if (track.artists.length > 0) {
        try {
          const artistData = await this.api.artists.get(track.artists[0].id);
          if (artistData.genres && artistData.genres.length > 0) {
            const normalized = GenreMapper.normalize(artistData.genres[0]);
            genre = normalized !== 'Unknown' ? normalized : undefined;
          }
        } catch (e) {
          // Ignore - genre will be undefined
        }
      }

      return {
        spotifyId: track.id,
        title: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        year,
        genre,
        duration: Math.floor(track.duration_ms / 1000),
        albumArt: track.album.images[0]?.url,
      };
    } catch (error) {
      console.error(`  ⚠️ Spotify search failed: ${error}`);
      return null;
    }
  }

  async getAlbumArt(title: string, artist: string): Promise<string | null> {
    if (!this.api) return null;

    try {
      const query = `track:${title} artist:${artist}`;
      const results = await this.api.search(query, ['track'], undefined, 10);

      if (results.tracks.items.length === 0) {
        const fallbackQuery = `${artist} ${title}`;
        const fallbackResults = await this.api.search(fallbackQuery, ['track'], undefined, 5);
        if (fallbackResults.tracks.items.length === 0) {
          return null;
        }
        results.tracks.items = fallbackResults.tracks.items;
      }

      const normalizedArtist = artist.toLowerCase();
      const track = results.tracks.items.find(t =>
        t.artists.some(a => a.name.toLowerCase() === normalizedArtist)
      ) || results.tracks.items[0];

      return track.album.images[0]?.url || null;
    } catch (error) {
      console.error(`  ⚠️ Spotify search failed: ${error}`);
      return null;
    }
  }
}

// ============================================================================
// YouTube Service
// ============================================================================

class YouTubeClient {
  async search(title: string, artist: string): Promise<{
    videoId: string;
    title: string;
    duration?: number;
  } | null> {
    try {
      const query = `${artist} ${title} official audio`;
      const results = await YoutubeSearch.GetListByKeyword(query, false, 5);

      if (!results.items || results.items.length === 0) {
        return null;
      }

      // Return first result
      const video = results.items[0];
      return {
        videoId: video.id,
        title: video.title,
        duration: this.parseDuration(video.length?.simpleText || '0:00'),
      };
    } catch (error) {
      console.error(`  ⚠️ YouTube search failed: ${error}`);
      return null;
    }
  }

  async download(
    videoId: string,
    outputDir: string,
    artist: string,
    title: string,
    options: {
      clipStart?: number;
      clipDuration?: number;
      format?: 'mp3' | 'm4a';
      quality?: string;
    } = {}
  ): Promise<{
    filePath: string;
    fileName: string;
    fileSize: number;
    duration: number;
    skipped?: boolean;
  } | null> {
    const {
      clipStart = 0,
      clipDuration = 60,
      format = 'mp3',
      quality = '192'
    } = options;

    try {
      await fs.mkdir(outputDir, { recursive: true });

      // Generate clean filename from artist and title
      const sanitizedArtist = sanitizeFilename(artist);
      const sanitizedTitle = sanitizeFilename(title);
      const fileName = `${sanitizedArtist}_-_${sanitizedTitle}.${format}`;
      const outputPath = path.join(outputDir, fileName);

      // Check if file already exists (duplicate prevention)
      try {
        const existingStats = await fs.stat(outputPath);
        console.log(`     ⏭️ File already exists: ${fileName}`);
        return {
          filePath: outputPath,
          fileName,
          fileSize: existingStats.size,
          duration: clipDuration,
          skipped: true,
        };
      } catch {
        // File doesn't exist, proceed with download
      }

      const clipEnd = clipStart + clipDuration;

      // Ensure absolute path
      const absoluteOutputPath = path.resolve(outputPath);

      console.log(`     🔗 Downloading: https://www.youtube.com/watch?v=${videoId}`);
      console.log(`     📁 Output: ${absoluteOutputPath}`);
      console.log(`     ✂️  Clipping: ${clipStart}s to ${clipStart + clipDuration}s (${clipDuration}s)`);

      // Use yt-dlp with ffmpeg postprocessor for clipping, quality control, and loudness normalization
      const ffmpegArgs = `-ss ${clipStart} -t ${clipDuration} -b:a ${quality} -af loudnorm=I=-16:LRA=11:TP=-1.5`;
      const cmd = `yt-dlp --extract-audio --audio-format ${format} --postprocessor-args "ffmpeg:${ffmpegArgs}" --no-playlist -o "${absoluteOutputPath}" "https://www.youtube.com/watch?v=${videoId}"`;

      await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });

      const stats = await fs.stat(outputPath);

      return {
        filePath: outputPath,
        fileName,
        fileSize: stats.size,
        duration: clipDuration,
      };
    } catch (error: any) {
      // Extract detailed error info from yt-dlp
      const stderr = error?.stderr || '';
      const message = error?.message || String(error);
      console.error(`  ⚠️ YouTube download failed:`);
      console.error(`     Message: ${message}`);
      if (stderr) console.error(`     stderr: ${stderr}`);
      return null;
    }
  }

  private parseDuration(durationStr: string): number {
    const parts = durationStr.split(':').map(p => parseInt(p, 10));
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }
}

// ============================================================================
// Database Service
// ============================================================================

class DatabaseService {
  async initialize(): Promise<void> {
    console.log('🗄️  Initializing database...');
    runMigrations();
    console.log('✅ Database ready');
  }

  async findByTitleAndArtist(title: string, artist: string): Promise<boolean> {
    const result = await db
      .select()
      .from(schema.songs)
      .where(
        sql`LOWER(${schema.songs.title}) = LOWER(${title}) AND LOWER(${schema.songs.artist}) = LOWER(${artist})`
      )
      .limit(1);
    return result.length > 0;
  }

  async findByFilePath(filePath: string): Promise<boolean> {
    const result = await db
      .select()
      .from(schema.songs)
      .where(sql`${schema.songs.filePath} = ${filePath}`)
      .limit(1);
    return result.length > 0;
  }

  async insertSong(song: EnrichedSong): Promise<string | null> {
    // Skip if missing required fields
    if (!song.filePath || !song.fileName || !song.duration || !song.fileSize) {
      console.log('     ⚠️ Missing required fields for DB insert');
      return null;
    }

    // Check if already exists by title/artist
    const existsByMeta = await this.findByTitleAndArtist(song.title, song.artist);
    if (existsByMeta) {
      console.log('     ⏭️ Already in database (matching title/artist)');
      return null;
    }

    // Check if file path already exists (unique constraint)
    const existsByPath = await this.findByFilePath(song.filePath);
    if (existsByPath) {
      console.log('     ⏭️ Already in database (matching file path)');
      return null;
    }

    const id = generateId();
    const now = new Date();

    const newSong = {
      id,
      filePath: song.filePath,
      fileName: song.fileName,
      title: song.title,
      artist: song.artist,
      album: song.album || null,
      year: song.year || 2000, // Default year if missing
      genre: song.genre || null,
      duration: song.duration,
      language: song.lang || null,
      niche: false,
      spotifyId: song.spotifyId || null,
      youtubeId: song.youtubeId || null,
      albumArt: song.albumArt || null,
      source: 'seed',
      clipStart: song.clipStart ?? 0,
      clipDuration: song.clipDuration ?? 60,
      createdAt: now.toISOString(),
      fileSize: song.fileSize,
      format: song.format || 'mp3',
    };

    await db.insert(schema.songs).values(newSong);
    console.log(`     ✅ Inserted into database (id: ${id})`);
    return id;
  }

  async getSongsWithoutAlbumArt(): Promise<{ id: string; title: string; artist: string }[]> {
    return await db
      .select({
        id: schema.songs.id,
        title: schema.songs.title,
        artist: schema.songs.artist,
      })
      .from(schema.songs)
      .where(isNull(schema.songs.albumArt));
  }

  async updateAlbumArt(id: string, albumArt: string): Promise<void> {
    await db
      .update(schema.songs)
      .set({ albumArt })
      .where(eq(schema.songs.id, id));
  }
}

// ============================================================================
// Main Processing
// ============================================================================

async function loadMusiques(): Promise<MusiqueEntry[]> {
  const content = await fs.readFile(CONFIG.inputFile, 'utf-8');
  return JSON.parse(content);
}

async function loadProgress(): Promise<Map<string, EnrichedSong>> {
  try {
    const content = await fs.readFile(CONFIG.outputFile, 'utf-8');
    const data = JSON.parse(content) as EnrichedSong[];
    const map = new Map<string, EnrichedSong>();
    for (const song of data) {
      const key = `${song.artist}|${song.title}`;
      map.set(key, song);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function saveProgress(songs: EnrichedSong[]): Promise<void> {
  await fs.writeFile(CONFIG.outputFile, JSON.stringify(songs, null, 2));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🎵 Musiques Seed Script');
  console.log('========================\n');

  // Parse arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const noDownload = args.includes('--no-download');
  const retryFailed = args.includes('--retry-failed');
  const fixAlbumArt = args.includes('--fix-album-art');

  let limit = Infinity;
  let skip = 0;

  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10);
    }
    if (arg.startsWith('--skip=')) {
      skip = parseInt(arg.split('=')[1], 10);
    }
  }

  if (dryRun) console.log('🔍 Dry run mode - no files will be downloaded\n');
  if (noDownload) console.log('📋 Metadata only mode - skipping YouTube downloads\n');
  if (fixAlbumArt) console.log('🎨 Fix album art mode - re-fetching missing albumArt\n');

  // Initialize services
  const spotify = new SpotifyClient();
  const youtube = new YouTubeClient();
  const database = new DatabaseService();

  const spotifyReady = await spotify.initialize();
  if (!spotifyReady) {
    console.error('\n⚠️ Continuing without Spotify (metadata will be incomplete)');
  }

  // Initialize database (skip in dry-run mode)
  if (!dryRun && !noDownload || fixAlbumArt) {
    await database.initialize();
  }

  // Handle --fix-album-art mode
  if (fixAlbumArt) {
    if (!spotifyReady) {
      console.error('❌ Cannot fix album art without Spotify API');
      process.exit(1);
    }

    const songsWithoutArt = await database.getSongsWithoutAlbumArt();
    console.log(`📊 Found ${songsWithoutArt.length} songs without album art\n`);

    if (songsWithoutArt.length === 0) {
      console.log('✅ All songs have album art!');
      return;
    }

    let updated = 0;
    let notFound = 0;

    for (let i = 0; i < songsWithoutArt.length; i++) {
      const song = songsWithoutArt[i];
      console.log(`[${i + 1}/${songsWithoutArt.length}] ${song.artist} - ${song.title}`);

      const albumArt = await spotify.getAlbumArt(song.title, song.artist);

      if (albumArt) {
        if (!dryRun) {
          await database.updateAlbumArt(song.id, albumArt);
        }
        console.log(`  ✅ ${dryRun ? 'Would update' : 'Updated'}`);
        updated++;
      } else {
        console.log('  ❌ Not found on Spotify');
        notFound++;
      }

      await sleep(CONFIG.spotifyDelay);
    }

    console.log('\n========================');
    console.log('📊 Summary:');
    console.log(`   Total processed: ${songsWithoutArt.length}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Not found: ${notFound}`);

    if (dryRun) {
      console.log('\n⚠️  Dry run - no changes were made.');
    }
    return;
  }

  // Load data
  const musiques = await loadMusiques();
  const progress = await loadProgress();

  console.log(`📂 Loaded ${musiques.length} songs from musiques.json`);
  console.log(`📊 Progress: ${progress.size} songs already processed\n`);

  // Process songs
  const enrichedSongs: EnrichedSong[] = Array.from(progress.values());
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = skip; i < Math.min(musiques.length, skip + limit); i++) {
    const entry = musiques[i];
    const key = `${entry.artist}|${entry.title}`;

    // Check if already processed
    const existing = progress.get(key);
    if (existing) {
      if (retryFailed && existing.status === 'failed') {
        console.log(`🔄 Retrying: ${entry.artist} - ${entry.title}`);
      } else if (existing.status === 'downloaded') {
        skipped++;
        continue;
      }
    }

    processed++;
    console.log(`\n[${i + 1}/${musiques.length}] ${entry.artist} - ${entry.title}`);

    const song: EnrichedSong = {
      title: entry.title,
      artist: entry.artist,
      lang: entry.lang,
      status: 'pending',
      processedAt: new Date().toISOString(),
    };

    // Step 1: Search Spotify
    if (spotifyReady) {
      console.log('  🎧 Searching Spotify...');
      const spotifyData = await spotify.search(entry.title, entry.artist);

      if (spotifyData) {
        song.spotifyId = spotifyData.spotifyId;
        song.album = spotifyData.album;
        song.year = spotifyData.year;
        song.genre = spotifyData.genre;
        song.duration = spotifyData.duration;
        song.albumArt = spotifyData.albumArt;
        song.status = 'spotify_done';
        console.log(`     ✓ Found: ${spotifyData.album} (${spotifyData.year}) - ${spotifyData.genre || 'unknown genre'}`);
      } else {
        console.log('     ✗ Not found on Spotify');
      }

      await sleep(CONFIG.spotifyDelay);
    }

    // Step 2: Check if already in database (skip download if exists)
    if (!dryRun && !noDownload) {
      const existsInDb = await database.findByTitleAndArtist(entry.title, entry.artist);
      if (existsInDb) {
        console.log('  ⏭️  Already in database, skipping download');
        song.status = 'downloaded';
        progress.set(key, song);
        skipped++;
        continue;
      }
    }

    // Step 3: Search YouTube
    if (!dryRun) {
      console.log('  📺 Searching YouTube...');
      const youtubeData = await youtube.search(entry.title, entry.artist);

      if (youtubeData) {
        song.youtubeId = youtubeData.videoId;
        song.status = 'youtube_found';
        console.log(`     ✓ Found: ${youtubeData.title}`);

        // Step 3: Download from YouTube
        if (!noDownload) {
          console.log('  📥 Downloading audio...');
          const downloadResult = await youtube.download(
            youtubeData.videoId,
            CONFIG.uploadDir,
            entry.artist,
            entry.title,
            {
              clipStart: CONFIG.defaultClipStart,
              clipDuration: CONFIG.defaultClipDuration,
              format: CONFIG.audioFormat,
              quality: CONFIG.audioQuality,
            }
          );

          if (downloadResult) {
            song.filePath = downloadResult.filePath;
            song.fileName = downloadResult.fileName;
            song.fileSize = downloadResult.fileSize;
            song.format = CONFIG.audioFormat;
            song.clipStart = CONFIG.defaultClipStart;
            song.clipDuration = CONFIG.defaultClipDuration;
            song.status = 'downloaded';
            console.log(`     ✓ Downloaded: ${downloadResult.fileName} (${Math.round(downloadResult.fileSize / 1024)}KB)`);

            // Step 4: Insert into database
            console.log('  🗄️  Inserting into database...');
            await database.insertSong(song);
          } else {
            song.status = 'failed';
            song.error = 'Download failed';
            errors++;
          }

          await sleep(CONFIG.youtubeDelay);
        }
      } else {
        console.log('     ✗ Not found on YouTube');
        song.status = 'failed';
        song.error = 'Not found on YouTube';
        errors++;
      }
    }

    // Update progress
    progress.set(key, song);
    enrichedSongs.push(song);

    // Save progress every 10 songs
    if (processed % 10 === 0) {
      await saveProgress(Array.from(progress.values()));
      console.log(`\n💾 Progress saved (${processed} processed)`);
    }
  }

  // Final save
  await saveProgress(Array.from(progress.values()));

  // Summary
  console.log('\n========================');
  console.log('📊 Summary:');
  console.log(`   Total in file: ${musiques.length}`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Skipped (already done): ${skipped}`);
  console.log(`   Errors: ${errors}`);
  console.log(`\n📁 Output saved to: ${CONFIG.outputFile}`);

  // Show stats by status
  const statuses = new Map<string, number>();
  for (const song of progress.values()) {
    const status = song.status || 'unknown';
    statuses.set(status, (statuses.get(status) || 0) + 1);
  }
  console.log('\n📈 Status breakdown:');
  for (const [status, count] of statuses) {
    console.log(`   ${status}: ${count}`);
  }
}

// Run
main().catch(console.error);
