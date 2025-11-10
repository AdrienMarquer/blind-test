/**
 * Song Repository - SQLite implementation with Drizzle ORM
 */

import { eq, like, inArray, sql } from 'drizzle-orm';
import type { Song, Repository } from '@blind-test/shared';
import { generateId, shuffle, SONG_CONFIG } from '@blind-test/shared';
import { db, schema } from '../db';
import { logger } from '../utils/logger';

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
      createdAt: new Date(dbSong.createdAt),
      fileSize: dbSong.fileSize,
      format: dbSong.format,
      language: dbSong.language || undefined,
      subgenre: dbSong.subgenre || undefined,
      spotifyId: dbSong.spotifyId || undefined,
      youtubeId: dbSong.youtubeId || undefined,
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
      clipStart: data.clipStart || SONG_CONFIG.DEFAULT_CLIP_START,
      createdAt: now,
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
   */
  async getRandom(count: number): Promise<Song[]> {
    // SQLite doesn't have a simple RANDOM() that works with Drizzle easily
    // Get all songs and shuffle in memory (fine for moderate song libraries)
    const allSongs = await this.findAll();

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
   */
  async findByFilters(filters: {
    genre?: string | string[];
    yearMin?: number;
    yearMax?: number;
    artistName?: string;
    songCount?: number;
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
}
