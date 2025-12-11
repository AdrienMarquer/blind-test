/**
 * Artist Repository - SQLite implementation with Drizzle ORM
 */

import { eq, sql, inArray } from 'drizzle-orm';
import type { Artist } from '@blind-test/shared';
import { generateId } from '@blind-test/shared';
import { db, schema } from '../db';
import { logger } from '../utils/logger';

const artistLogger = logger.child({ module: 'ArtistRepository' });

export class ArtistRepository {
  /**
   * Convert database row to Artist type
   */
  private toArtist(dbArtist: typeof schema.artists.$inferSelect): Artist {
    return {
      id: dbArtist.id,
      name: dbArtist.name,
      spotifyId: dbArtist.spotifyId || undefined,
      genres: dbArtist.genres || undefined,
      popularity: dbArtist.popularity || undefined,
      imageUrl: dbArtist.imageUrl || undefined,
      createdAt: new Date(dbArtist.createdAt),
      updatedAt: new Date(dbArtist.updatedAt),
    };
  }

  async findById(id: string): Promise<Artist | null> {
    const result = await db
      .select()
      .from(schema.artists)
      .where(eq(schema.artists.id, id))
      .limit(1);

    if (result.length === 0) return null;
    return this.toArtist(result[0]);
  }

  async findByIds(ids: string[]): Promise<Artist[]> {
    if (ids.length === 0) return [];

    const results = await db
      .select()
      .from(schema.artists)
      .where(inArray(schema.artists.id, ids));

    return results.map(a => this.toArtist(a));
  }

  async findBySpotifyId(spotifyId: string): Promise<Artist | null> {
    const result = await db
      .select()
      .from(schema.artists)
      .where(eq(schema.artists.spotifyId, spotifyId))
      .limit(1);

    if (result.length === 0) return null;
    return this.toArtist(result[0]);
  }

  async findByName(name: string): Promise<Artist | null> {
    const result = await db
      .select()
      .from(schema.artists)
      .where(sql`LOWER(${schema.artists.name}) = LOWER(${name})`)
      .limit(1);

    if (result.length === 0) return null;
    return this.toArtist(result[0]);
  }

  async findAll(): Promise<Artist[]> {
    const results = await db.select().from(schema.artists);
    return results.map(a => this.toArtist(a));
  }

  async create(data: {
    name: string;
    spotifyId?: string;
    genres?: string[];
    popularity?: number;
    imageUrl?: string;
  }): Promise<Artist> {
    const id = generateId();
    const now = new Date().toISOString();

    const newArtist = {
      id,
      name: data.name,
      spotifyId: data.spotifyId || null,
      genres: data.genres || null,
      popularity: data.popularity || null,
      imageUrl: data.imageUrl || null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(schema.artists).values(newArtist);
    artistLogger.debug('Created artist', { id, name: data.name });

    return this.toArtist({ ...newArtist, genres: newArtist.genres as string[] | null });
  }

  /**
   * Find or create an artist
   * First checks by Spotify ID (most reliable), then by exact name match
   */
  async findOrCreate(data: {
    name: string;
    spotifyId?: string;
    genres?: string[];
    popularity?: number;
    imageUrl?: string;
  }): Promise<{ artist: Artist; created: boolean }> {
    // First check by Spotify ID (most reliable)
    if (data.spotifyId) {
      const existingBySpotifyId = await this.findBySpotifyId(data.spotifyId);
      if (existingBySpotifyId) {
        return { artist: existingBySpotifyId, created: false };
      }
    }

    // Then check by exact name match (case-insensitive)
    const existingByName = await this.findByName(data.name);
    if (existingByName) {
      return { artist: existingByName, created: false };
    }

    // Create new artist
    const artist = await this.create(data);
    return { artist, created: true };
  }

  async update(id: string, data: Partial<{
    name: string;
    spotifyId: string;
    genres: string[];
    popularity: number;
    imageUrl: string;
  }>): Promise<Artist | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    await db
      .update(schema.artists)
      .set({
        ...data,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.artists.id, id));

    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await db.delete(schema.artists).where(eq(schema.artists.id, id));
  }

  // ============================================================================
  // Related Artists Methods
  // ============================================================================

  /**
   * Get all related artists for a given artist
   */
  async getRelatedArtists(artistId: string): Promise<Artist[]> {
    const relations = await db
      .select({ relatedArtistId: schema.artistRelations.relatedArtistId })
      .from(schema.artistRelations)
      .where(eq(schema.artistRelations.artistId, artistId));

    if (relations.length === 0) return [];

    const relatedIds = relations.map(r => r.relatedArtistId);
    return this.findByIds(relatedIds);
  }

  /**
   * Add a single related artist relationship
   */
  async addRelatedArtist(artistId: string, relatedArtistId: string): Promise<void> {
    // Don't add self-reference
    if (artistId === relatedArtistId) return;

    const id = generateId();
    const now = new Date().toISOString();

    try {
      await db.insert(schema.artistRelations).values({
        id,
        artistId,
        relatedArtistId,
        createdAt: now,
      });
    } catch (error: any) {
      // Ignore unique constraint violations (relation already exists)
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.message?.includes('UNIQUE constraint failed')) {
        artistLogger.debug('Relation already exists', { artistId, relatedArtistId });
        return;
      }
      throw error;
    }
  }

  /**
   * Add multiple related artists in batch
   */
  async addRelatedArtists(artistId: string, relatedArtistIds: string[]): Promise<void> {
    for (const relatedId of relatedArtistIds) {
      await this.addRelatedArtist(artistId, relatedId);
    }
  }

  /**
   * Check if a relationship exists between two artists
   */
  async hasRelation(artistId: string, relatedArtistId: string): Promise<boolean> {
    const result = await db
      .select()
      .from(schema.artistRelations)
      .where(
        sql`${schema.artistRelations.artistId} = ${artistId} AND ${schema.artistRelations.relatedArtistId} = ${relatedArtistId}`
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Get count of related artists
   */
  async getRelatedArtistCount(artistId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.artistRelations)
      .where(eq(schema.artistRelations.artistId, artistId));

    return result[0]?.count || 0;
  }
}
