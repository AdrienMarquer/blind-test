/**
 * Playlist Repository - SQLite implementation with Drizzle ORM
 */

import { eq } from 'drizzle-orm';
import type { Playlist, Repository } from '@blind-test/shared';
import { generateId } from '@blind-test/shared';
import { db, schema } from '../db';

export class PlaylistRepository implements Repository<Playlist> {
  /**
   * Convert database row to Playlist type
   */
  private async toPlaylist(dbPlaylist: typeof schema.playlists.$inferSelect): Promise<Playlist> {
    // Fetch songs for this playlist
    const playlistSongs = await db
      .select()
      .from(schema.playlistSongs)
      .where(eq(schema.playlistSongs.playlistId, dbPlaylist.id))
      .orderBy(schema.playlistSongs.order);

    const songIds = playlistSongs.map(ps => ps.songId);

    // Get total duration from songs
    let totalDuration = 0;
    if (songIds.length > 0) {
      const songs = await db
        .select()
        .from(schema.songs)
        .where(eq(schema.songs.id, songIds[0])); // We'll improve this with inArray

      totalDuration = songs.reduce((sum, song) => sum + song.duration, 0);
    }

    return {
      id: dbPlaylist.id,
      name: dbPlaylist.name,
      description: dbPlaylist.description || undefined,
      songIds,
      createdAt: new Date(dbPlaylist.createdAt),
      updatedAt: new Date(dbPlaylist.updatedAt),
      songCount: songIds.length,
      totalDuration,
    };
  }

  async findById(id: string): Promise<Playlist | null> {
    const result = await db
      .select()
      .from(schema.playlists)
      .where(eq(schema.playlists.id, id))
      .limit(1);

    if (result.length === 0) return null;
    return this.toPlaylist(result[0]);
  }

  async findAll(): Promise<Playlist[]> {
    const results = await db.select().from(schema.playlists);
    return Promise.all(results.map(p => this.toPlaylist(p)));
  }

  async create(data: Partial<Playlist>): Promise<Playlist> {
    if (!data.name) {
      throw new Error('name is required');
    }

    const id = generateId();
    const now = new Date();

    const newPlaylist = {
      id,
      name: data.name,
      description: data.description || null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(schema.playlists).values(newPlaylist);

    // Add songs if provided
    if (data.songIds && data.songIds.length > 0) {
      await this.setSongs(id, data.songIds);
    }

    return this.toPlaylist(newPlaylist as any);
  }

  async update(id: string, data: Partial<Playlist>): Promise<Playlist> {
    const existing = await this.findById(id);
    if (!existing) throw new Error('Playlist not found');

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;

    await db
      .update(schema.playlists)
      .set(updateData)
      .where(eq(schema.playlists.id, id));

    // Update songs if provided
    if (data.songIds !== undefined) {
      await this.setSongs(id, data.songIds);
    }

    return this.findById(id) as Promise<Playlist>;
  }

  async delete(id: string): Promise<void> {
    // Playlist songs will be cascade deleted due to foreign key constraint
    await db.delete(schema.playlists).where(eq(schema.playlists.id, id));
  }

  /**
   * Set songs for a playlist (replaces existing)
   */
  async setSongs(playlistId: string, songIds: string[]): Promise<void> {
    // Delete existing playlist songs
    await db
      .delete(schema.playlistSongs)
      .where(eq(schema.playlistSongs.playlistId, playlistId));

    // Insert new songs
    if (songIds.length > 0) {
      const playlistSongRecords = songIds.map((songId, index) => ({
        id: generateId(),
        playlistId,
        songId,
        order: index,
      }));

      await db.insert(schema.playlistSongs).values(playlistSongRecords);
    }
  }

  /**
   * Add a song to a playlist
   */
  async addSong(playlistId: string, songId: string): Promise<void> {
    const playlist = await this.findById(playlistId);
    if (!playlist) throw new Error('Playlist not found');

    const newOrder = playlist.songIds.length;

    await db.insert(schema.playlistSongs).values({
      id: generateId(),
      playlistId,
      songId,
      order: newOrder,
    });
  }

  /**
   * Remove a song from a playlist
   */
  async removeSong(playlistId: string, songId: string): Promise<void> {
    // Find the playlist song entry
    const playlistSongs = await db
      .select()
      .from(schema.playlistSongs)
      .where(eq(schema.playlistSongs.playlistId, playlistId));

    const toRemove = playlistSongs.find(ps => ps.songId === songId);
    if (!toRemove) return;

    // Delete it
    await db
      .delete(schema.playlistSongs)
      .where(eq(schema.playlistSongs.id, toRemove.id));
  }
}
