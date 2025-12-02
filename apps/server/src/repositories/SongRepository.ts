/**
 * Song Repository - SQLite implementation with Drizzle ORM
 */

import { eq, like, inArray, sql, or, isNull } from 'drizzle-orm';
import type { Song, Repository } from '@blind-test/shared';
import { generateId, shuffle, SONG_CONFIG } from '@blind-test/shared';
import { db, schema } from '../db';
import { logger } from '../utils/logger';
import { existsSync } from 'fs';
import path from 'path';

const songLogger = logger.child({ module: 'SongRepository' });

/**
 * DTO for updating song fields
 */
interface SongUpdateDTO {
  title?: string;
  artist?: string;
  album?: string | null;
  year?: number;
  genre?: string | null;
  clipStart?: number;
  clipDuration?: number;
  language?: string | null;
  niche?: boolean;
  spotifyId?: string | null;
  youtubeId?: string | null;
  source?: string;
}

export class SongRepository implements Repository<Song> {
  /**
   * Convert database row to Song type
   */
  private toSong(dbSong: typeof schema.songs.$inferSelect): Song {
    return {
      id: dbSong.id,
      filePath: dbSong.filePath,
      fileName: dbSong.fileName,
      title: dbSong.title,
      artist: dbSong.artist,
      album: dbSong.album || undefined,
      year: dbSong.year,
      genre: dbSong.genre || undefined,
      duration: dbSong.duration,
      clipStart: dbSong.clipStart,
      clipDuration: dbSong.clipDuration,
      createdAt: new Date(dbSong.createdAt),
      fileSize: dbSong.fileSize,
      format: dbSong.format,
      language: dbSong.language || undefined,
      niche: dbSong.niche,
      spotifyId: dbSong.spotifyId || undefined,
      youtubeId: dbSong.youtubeId || undefined,
      albumArt: dbSong.albumArt || undefined,
      source: dbSong.source,
    };
  }

  async findById(id: string): Promise<Song | null> {
    const result = await db
      .select()
      .from(schema.songs)
      .where(eq(schema.songs.id, id))
      .limit(1);

    if (result.length === 0) return null;
    return this.toSong(result[0]);
  }

  async findAll(): Promise<Song[]> {
    const results = await db.select().from(schema.songs);
    return results.map(s => this.toSong(s));
  }

  async findByFilePath(filePath: string): Promise<Song | null> {
    const result = await db
      .select()
      .from(schema.songs)
      .where(eq(schema.songs.filePath, filePath))
      .limit(1);

    if (result.length === 0) return null;
    return this.toSong(result[0]);
  }

  async findByTitleAndArtist(title: string, artist: string): Promise<Song | null> {
    const result = await db
      .select()
      .from(schema.songs)
      .where(
        sql`LOWER(${schema.songs.title}) = LOWER(${title}) AND LOWER(${schema.songs.artist}) = LOWER(${artist})`
      )
      .limit(1);

    if (result.length === 0) return null;
    return this.toSong(result[0]);
  }

  async findByArtist(artist: string): Promise<Song[]> {
    const results = await db
      .select()
      .from(schema.songs)
      .where(like(schema.songs.artist, `%${artist}%`));

    return results.map(s => this.toSong(s));
  }

  async findByYear(year: number): Promise<Song[]> {
    const results = await db
      .select()
      .from(schema.songs)
      .where(eq(schema.songs.year, year));

    return results.map(s => this.toSong(s));
  }

  async findByGenre(genre: string): Promise<Song[]> {
    const results = await db
      .select()
      .from(schema.songs)
      .where(like(schema.songs.genre, `%${genre}%`));

    return results.map(s => this.toSong(s));
  }

  async findByIds(ids: string[]): Promise<Song[]> {
    if (ids.length === 0) return [];

    const results = await db
      .select()
      .from(schema.songs)
      .where(inArray(schema.songs.id, ids));

    return results.map(s => this.toSong(s));
  }

  /**
   * Find song by Spotify ID
   * Used for exact duplicate detection
   */
  async findBySpotifyId(spotifyId: string): Promise<Song | null> {
    const result = await db
      .select()
      .from(schema.songs)
      .where(eq(schema.songs.spotifyId, spotifyId))
      .limit(1);

    if (result.length === 0) return null;
    return this.toSong(result[0]);
  }

  /**
   * Find song by YouTube ID
   * Used for exact duplicate detection
   */
  async findByYoutubeId(youtubeId: string): Promise<Song | null> {
    const result = await db
      .select()
      .from(schema.songs)
      .where(eq(schema.songs.youtubeId, youtubeId))
      .limit(1);

    if (result.length === 0) return null;
    return this.toSong(result[0]);
  }

  /**
   * Find songs with incomplete metadata
   * A song is considered incomplete if it's missing genre or album
   * Uses database-level filtering for optimal performance
   */
  async findWithIncompleteMetadata(): Promise<Song[]> {
    const results = await db
      .select()
      .from(schema.songs)
      .where(
        or(
          isNull(schema.songs.genre),
          isNull(schema.songs.album)
        )
      );

    songLogger.debug('Found songs with incomplete metadata', { count: results.length });
    return results.map(s => this.toSong(s));
  }

  /**
   * Find songs where the MP3 file is missing from disk
   * Useful for identifying songs that need re-downloading
   */
  async findWithMissingFile(): Promise<Song[]> {
    const allSongs = await this.findAll();
    const uploadsDir = path.resolve(process.cwd(), 'uploads');

    const songsWithMissingFiles = allSongs.filter(song => {
      // Resolve the file path - could be absolute or relative
      const filePath = path.isAbsolute(song.filePath)
        ? song.filePath
        : path.resolve(process.cwd(), song.filePath);

      // Also check if file is in uploads directory by filename
      const uploadsPath = path.join(uploadsDir, song.fileName);

      const exists = existsSync(filePath) || existsSync(uploadsPath);
      return !exists;
    });

    songLogger.debug('Found songs with missing files', { count: songsWithMissingFiles.length });
    return songsWithMissingFiles;
  }

  /**
   * Find potential duplicates based on title and artist
   * Returns all songs with similar title or artist for fuzzy matching
   * This is a broad search - the duplicate detection service handles confidence scoring
   */
  async findPotentialDuplicates(criteria: {
    title: string;
    artist: string;
  }): Promise<Song[]> {
    // Use LIKE for partial matching to catch variations
    // The DuplicateDetectionService will do precise fuzzy matching on results
    const results = await db
      .select()
      .from(schema.songs)
      .where(
        sql`
          LOWER(${schema.songs.title}) LIKE LOWER(${'%' + criteria.title + '%'})
          OR LOWER(${schema.songs.artist}) LIKE LOWER(${'%' + criteria.artist + '%'})
        `
      );

    return results.map(s => this.toSong(s));
  }

  async create(data: Partial<Song>): Promise<Song> {
    if (!data.filePath || !data.fileName || !data.title || !data.artist || data.year === undefined || !data.duration || !data.fileSize || !data.format) {
      throw new Error('Required fields missing: filePath, fileName, title, artist, year, duration, fileSize, format');
    }

    const id = generateId();
    const now = new Date();

    const newSong = {
      id,
      filePath: data.filePath,
      fileName: data.fileName,
      title: data.title,
      artist: data.artist,
      album: data.album || null,
      year: data.year,
      genre: data.genre || null,
      duration: data.duration,
      language: data.language || null,
      niche: data.niche ?? false,
      spotifyId: data.spotifyId || null,
      youtubeId: data.youtubeId || null,
      source: data.source || 'upload',
      clipStart: data.clipStart ?? SONG_CONFIG.DEFAULT_CLIP_START,
      clipDuration: data.clipDuration ?? SONG_CONFIG.DEFAULT_CLIP_DURATION,
      createdAt: now.toISOString(),
      fileSize: data.fileSize,
      format: data.format,
    };

    await db.insert(schema.songs).values(newSong);

    // Fetch the created song to ensure proper type conversion
    const created = await this.findById(id);
    if (!created) throw new Error('Failed to create song');
    return created;
  }

  async update(id: string, data: Partial<Song>): Promise<Song> {
    const existing = await this.findById(id);
    if (!existing) throw new Error('Song not found');

    // Build typed update DTO with only allowed fields
    const updateData: SongUpdateDTO = {};

    // Only update allowed fields (explicit whitelisting)
    if (data.title !== undefined) updateData.title = data.title;
    if (data.artist !== undefined) updateData.artist = data.artist;
    if (data.album !== undefined) updateData.album = data.album;
    if (data.year !== undefined) updateData.year = data.year;
    if (data.genre !== undefined) updateData.genre = data.genre;
    if (data.clipStart !== undefined) updateData.clipStart = data.clipStart;
    if (data.clipDuration !== undefined) updateData.clipDuration = data.clipDuration;
    if (data.language !== undefined) updateData.language = data.language;
    if (data.niche !== undefined) updateData.niche = data.niche;
    if (data.spotifyId !== undefined) updateData.spotifyId = data.spotifyId;
    if (data.youtubeId !== undefined) updateData.youtubeId = data.youtubeId;
    if (data.source !== undefined) updateData.source = data.source;

    await db
      .update(schema.songs)
      .set(updateData)
      .where(eq(schema.songs.id, id));

    // Safe because we just updated it
    const updated = await this.findById(id);
    if (!updated) throw new Error('Failed to fetch updated song');
    return updated;
  }

  async delete(id: string): Promise<void> {
    await db.delete(schema.songs).where(eq(schema.songs.id, id));
  }

  /**
   * Search songs by title (case-insensitive partial match)
   */
  async searchByTitle(query: string): Promise<Song[]> {
    const results = await db
      .select()
      .from(schema.songs)
      .where(like(schema.songs.title, `%${query}%`));

    return results.map(s => this.toSong(s));
  }

  /**
   * Get random songs for a game round
   * Excludes niche songs by default unless includeNiche is true
   */
  async getRandom(count: number, includeNiche: boolean = false): Promise<Song[]> {
    // Get all songs (or non-niche songs)
    let allSongs: Song[];
    if (includeNiche) {
      allSongs = await this.findAll();
    } else {
      // Use findByFilters with includeNiche: false to exclude niche songs
      allSongs = await this.findByFilters({ includeNiche: false });
    }

    // Shuffle using shared utility (Fisher-Yates algorithm)
    return shuffle([...allSongs]).slice(0, count);
  }

  /**
   * Get total number of songs
   */
  async count(): Promise<number> {
    const result = await db.select().from(schema.songs);
    return result.length;
  }

  /**
   * Find songs by metadata filters
   * Combines genre, year range, and artist filters
   * Excludes niche songs by default unless includeNiche is true
   */
  async findByFilters(filters: {
    genre?: string | string[];
    yearMin?: number;
    yearMax?: number;
    artistName?: string;
    songCount?: number;
    includeNiche?: boolean;
  }): Promise<Song[]> {
    songLogger.debug('Finding songs with filters', { filters });

    // Start with base query
    let query = db.select().from(schema.songs);

    // Build WHERE conditions using sql template
    const conditions: ReturnType<typeof sql>[] = [];

    // Handle genre (single or multiple with OR logic)
    if (filters.genre) {
      if (Array.isArray(filters.genre)) {
        // Multiple genres - use OR logic
        if (filters.genre.length > 0) {
          const genreConditions = filters.genre.map(g =>
            like(schema.songs.genre, `%${g}%`)
          );
          const genreOrClause = genreConditions.reduce((acc, condition, index) => {
            if (index === 0) return condition;
            return sql`${acc} OR ${condition}`;
          });
          conditions.push(sql`(${genreOrClause})`);
        }
      } else {
        // Single genre
        conditions.push(like(schema.songs.genre, `%${filters.genre}%`));
      }
    }

    if (filters.yearMin !== undefined) {
      conditions.push(sql`${schema.songs.year} >= ${filters.yearMin}`);
    }

    if (filters.yearMax !== undefined) {
      conditions.push(sql`${schema.songs.year} <= ${filters.yearMax}`);
    }

    if (filters.artistName) {
      conditions.push(like(schema.songs.artist, `%${filters.artistName}%`));
    }

    // Exclude niche songs by default unless includeNiche is true
    if (!filters.includeNiche) {
      conditions.push(eq(schema.songs.niche, false));
    }

    // Apply all conditions with AND logic
    if (conditions.length > 0) {
      // For multiple conditions, we need to use sql template
      const whereClause = conditions.reduce((acc, condition, index) => {
        if (index === 0) return condition;
        return sql`${acc} AND ${condition}`;
      });
      query = query.where(whereClause) as any;
    }

    const results = await query;
    let songs = results.map(s => this.toSong(s));

    songLogger.debug('Found songs matching filters', { count: songs.length });

    // Shuffle and limit if songCount is specified
    if (filters.songCount && filters.songCount < songs.length) {
      // Shuffle using shared utility (Fisher-Yates algorithm)
      songs = shuffle([...songs]).slice(0, filters.songCount);
      songLogger.debug('Randomly selected songs', { selected: songs.length, total: results.length });
    }

    return songs;
  }

  /**
   * Find similar songs based on metadata criteria
   * Used for answer generation in multiple choice mode
   */
  async findSimilar(criteria: {
    genre?: string;
    yearMin?: number;
    yearMax?: number;
    language?: string;
    excludeSongId?: string;
    limit?: number;
  }): Promise<Song[]> {
    songLogger.debug('Finding similar songs', criteria);

    let query = db.select().from(schema.songs);

    const conditions: any[] = [];

    // Exclude specific song
    if (criteria.excludeSongId) {
      conditions.push(sql`${schema.songs.id} != ${criteria.excludeSongId}`);
    }

    // Match genre
    if (criteria.genre) {
      conditions.push(eq(schema.songs.genre, criteria.genre));
    }

    // Year range
    if (criteria.yearMin !== undefined) {
      conditions.push(sql`${schema.songs.year} >= ${criteria.yearMin}`);
    }
    if (criteria.yearMax !== undefined) {
      conditions.push(sql`${schema.songs.year} <= ${criteria.yearMax}`);
    }

    // Match language
    if (criteria.language) {
      conditions.push(eq(schema.songs.language, criteria.language));
    }

    // Apply all conditions
    if (conditions.length > 0) {
      query = query.where(sql`${sql.join(conditions, sql` AND `)}`);
    }

    // Apply limit
    if (criteria.limit) {
      query = query.limit(criteria.limit);
    }

    const results = await query;
    const songs = results.map(s => this.toSong(s));

    songLogger.debug('Found similar songs', { count: songs.length });

    return songs;
  }

  /**
   * Get aggregated statistics for the song library
   * Used for dashboard charts and analytics
   * @param includeNiche - If false (default), excludes niche songs from statistics
   */
  async getStats(includeNiche: boolean = false): Promise<{
    total: number;
    totalDuration: number;
    byGenre: Array<{ genre: string; count: number }>;
    byDecade: Array<{ decade: string; count: number }>;
    byArtist: Array<{ artist: string; count: number }>;
    byLanguage: Array<{ language: string; count: number }>;
    bySource: Array<{ source: string; count: number }>;
  }> {
    songLogger.debug('Fetching song statistics', { includeNiche });

    // Base filter: exclude niche songs unless includeNiche is true
    const nicheFilter = includeNiche ? sql`1=1` : eq(schema.songs.niche, false);

    // 1. Total count and duration
    const totals = await db
      .select({
        total: sql<number>`CAST(COUNT(*) AS INTEGER)`,
        totalDuration: sql<number>`COALESCE(SUM(${schema.songs.duration}), 0)`,
      })
      .from(schema.songs)
      .where(nicheFilter);

    // 2. By Genre (excluding nulls)
    const byGenre = await db
      .select({
        genre: schema.songs.genre,
        count: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      })
      .from(schema.songs)
      .where(sql`${schema.songs.genre} IS NOT NULL AND ${nicheFilter}`)
      .groupBy(schema.songs.genre)
      .orderBy(sql`COUNT(*) DESC`);

    // 3. By Decade (computed from year)
    const byDecade = await db
      .select({
        decade: sql<string>`CAST((${schema.songs.year} / 10 * 10) AS TEXT) || 's'`,
        count: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      })
      .from(schema.songs)
      .where(nicheFilter)
      .groupBy(sql`${schema.songs.year} / 10`)
      .orderBy(sql`${schema.songs.year} / 10`);

    // 4. By Artist (Top 15)
    const byArtist = await db
      .select({
        artist: schema.songs.artist,
        count: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      })
      .from(schema.songs)
      .where(nicheFilter)
      .groupBy(schema.songs.artist)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(15);

    // 5. By Language (with 'unknown' fallback for nulls)
    const byLanguage = await db
      .select({
        language: sql<string>`COALESCE(${schema.songs.language}, 'unknown')`,
        count: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      })
      .from(schema.songs)
      .where(nicheFilter)
      .groupBy(schema.songs.language)
      .orderBy(sql`COUNT(*) DESC`);

    // 6. By Source
    const bySource = await db
      .select({
        source: schema.songs.source,
        count: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      })
      .from(schema.songs)
      .where(nicheFilter)
      .groupBy(schema.songs.source)
      .orderBy(sql`COUNT(*) DESC`);

    const stats = {
      total: Number(totals[0]?.total ?? 0),
      totalDuration: Number(totals[0]?.totalDuration ?? 0),
      byGenre: byGenre.map((r) => ({ genre: r.genre || 'Unknown', count: Number(r.count) })),
      byDecade: byDecade.map((r) => ({ decade: r.decade, count: Number(r.count) })),
      byArtist: byArtist.map((r) => ({ artist: r.artist, count: Number(r.count) })),
      byLanguage: byLanguage.map((r) => ({ language: r.language, count: Number(r.count) })),
      bySource: bySource.map((r) => ({ source: r.source, count: Number(r.count) })),
    };

    songLogger.debug('Song statistics computed', { total: stats.total });
    return stats;
  }
}
