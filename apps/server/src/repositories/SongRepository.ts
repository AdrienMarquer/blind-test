/**
 * Song Repository - SQLite implementation with Drizzle ORM
 */

import { eq, like, inArray, sql } from 'drizzle-orm';
import type { Song, Repository } from '@blind-test/shared';
import { generateId } from '@blind-test/shared';
import { db, schema } from '../db';

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
      clipStart: data.clipStart || 30,
      createdAt: now,
      fileSize: data.fileSize,
      format: data.format,
    };

    await db.insert(schema.songs).values(newSong);

    return this.toSong(newSong as any);
  }

  async update(id: string, data: Partial<Song>): Promise<Song> {
    const existing = await this.findById(id);
    if (!existing) throw new Error('Song not found');

    const updateData: any = {};

    // Only update allowed fields
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

    return this.findById(id) as Promise<Song>;
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

    // Shuffle using Fisher-Yates
    const shuffled = [...allSongs];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count);
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
    console.log('[SongRepository] Finding songs with filters:', filters);

    // Start with base query
    let query = db.select().from(schema.songs);

    // Build WHERE conditions
    const conditions: any[] = [];

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

    console.log(`[SongRepository] Found ${songs.length} songs matching filters`);

    // Shuffle and limit if songCount is specified
    if (filters.songCount && filters.songCount < songs.length) {
      // Shuffle using Fisher-Yates
      const shuffled = [...songs];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      songs = shuffled.slice(0, filters.songCount);
      console.log(`[SongRepository] Randomly selected ${songs.length} songs from ${results.length} matches`);
    }

    return songs;
  }
}
