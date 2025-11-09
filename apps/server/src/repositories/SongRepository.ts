/**
 * Song Repository - SQLite implementation with Drizzle ORM
 */

import { eq, like, inArray } from 'drizzle-orm';
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
}
