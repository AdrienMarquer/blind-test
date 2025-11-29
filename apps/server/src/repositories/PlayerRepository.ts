/**
 * Player Repository - SQLite implementation with Drizzle ORM
 */

import { eq, and } from 'drizzle-orm';
import type { Player, Repository, PlayerStats } from '@blind-test/shared';
import { generateId } from '@blind-test/shared';
import { db, schema } from '../db';
import { AuthService } from '../services/AuthService';

/**
 * DTO for updating player fields
 */
interface PlayerUpdateDTO {
  name?: string;
  role?: Player['role'];
  connected?: boolean;
  score?: number;
  roundScore?: number;
  isActive?: boolean;
  isLockedOut?: boolean;
  stats?: PlayerStats;
}

export class PlayerRepository implements Repository<Player> {
  /**
   * Convert database row to Player type
   */
  private toPlayer(dbPlayer: typeof schema.players.$inferSelect): Player {
    return {
      id: dbPlayer.id,
      roomId: dbPlayer.roomId,
      name: dbPlayer.name,
      role: dbPlayer.role as 'master' | 'player',
      connected: dbPlayer.connected,
      joinedAt: new Date(dbPlayer.joinedAt),
      score: dbPlayer.score,
      roundScore: dbPlayer.roundScore,
      isActive: dbPlayer.isActive,
      isLockedOut: dbPlayer.isLockedOut,
      // Drizzle returns JSON fields as parsed objects, just need proper typing
      stats: dbPlayer.stats as PlayerStats,
    };
  }

  async findById(id: string): Promise<Player | null> {
    const result = await db
      .select()
      .from(schema.players)
      .where(eq(schema.players.id, id))
      .limit(1);

    if (result.length === 0) return null;
    return this.toPlayer(result[0]);
  }

  async findAll(): Promise<Player[]> {
    const results = await db.select().from(schema.players);
    return results.map(p => this.toPlayer(p));
  }

  async findByRoom(roomId: string): Promise<Player[]> {
    const results = await db
      .select()
      .from(schema.players)
      .where(eq(schema.players.roomId, roomId));

    return results.map(p => this.toPlayer(p));
  }

  async findByRoomAndName(roomId: string, name: string): Promise<Player | null> {
    const result = await db
      .select()
      .from(schema.players)
      .where(
        and(
          eq(schema.players.roomId, roomId),
          eq(schema.players.name, name)
        )
      )
      .limit(1);

    if (result.length === 0) return null;
    return this.toPlayer(result[0]);
  }

  async create(data: Partial<Player>): Promise<Player & { token: string }> {
    if (!data.roomId || !data.name) {
      throw new Error('roomId and name are required');
    }

    const id = generateId();
    const token = AuthService.generateToken();
    const now = new Date();

    // Default stats for new players
    const defaultStats: PlayerStats = {
      totalAnswers: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      buzzCount: 0,
      averageAnswerTime: 0,
    };

    const newPlayer = {
      id,
      roomId: data.roomId,
      name: data.name,
      role: (data.role || 'player') as 'master' | 'player',
      token, // Generate session token
      connected: true,
      joinedAt: now.toISOString(),
      score: 0,
      roundScore: 0,
      isActive: false,
      isLockedOut: false,
      stats: defaultStats,
    };

    await db.insert(schema.players).values(newPlayer);

    // Fetch the created player to ensure proper type conversion
    const created = await this.findById(id);
    if (!created) throw new Error('Failed to create player');

    // Return player with token for client to store
    return {
      ...created,
      token, // Client needs this once to authenticate future requests
    };
  }

  async update(id: string, data: Partial<Player>): Promise<Player> {
    const existing = await this.findById(id);
    if (!existing) throw new Error('Player not found');

    // Build typed update DTO with only allowed fields
    const updateData: PlayerUpdateDTO = {};

    // Only update allowed fields (explicit whitelisting)
    if (data.name !== undefined) updateData.name = data.name;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.connected !== undefined) updateData.connected = data.connected;
    if (data.score !== undefined) updateData.score = data.score;
    if (data.roundScore !== undefined) updateData.roundScore = data.roundScore;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.isLockedOut !== undefined) updateData.isLockedOut = data.isLockedOut;
    if (data.stats !== undefined) updateData.stats = data.stats;

    await db
      .update(schema.players)
      .set(updateData)
      .where(eq(schema.players.id, id));

    // Safe because we just updated it
    const updated = await this.findById(id);
    if (!updated) throw new Error('Failed to fetch updated player');
    return updated;
  }

  async delete(id: string): Promise<void> {
    await db.delete(schema.players).where(eq(schema.players.id, id));
  }

  /**
   * Delete all players in a room
   */
  async deleteByRoom(roomId: string): Promise<void> {
    await db.delete(schema.players).where(eq(schema.players.roomId, roomId));
  }

  /**
   * Reset scores for all players in a room
   */
  async resetScores(roomId: string): Promise<void> {
    await db
      .update(schema.players)
      .set({
        score: 0,
        roundScore: 0,
        isActive: false,
        isLockedOut: false,
      })
      .where(eq(schema.players.roomId, roomId));
  }

  /**
   * Get player token for validation (INTERNAL USE ONLY)
   */
  async getPlayerToken(playerId: string): Promise<string | null> {
    const result = await db
      .select({ token: schema.players.token })
      .from(schema.players)
      .where(eq(schema.players.id, playerId))
      .limit(1);

    return result.length > 0 ? result[0].token : null;
  }

  /**
   * Count connected players in a room
   */
  async countConnected(roomId: string): Promise<number> {
    const players = await db
      .select()
      .from(schema.players)
      .where(
        and(
          eq(schema.players.roomId, roomId),
          eq(schema.players.connected, true)
        )
      );

    return players.length;
  }
}
