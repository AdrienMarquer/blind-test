/**
 * GameSession Repository - SQLite implementation with Drizzle ORM
 */

import { eq } from 'drizzle-orm';
import type { GameSession, Repository } from '@blind-test/shared';
import { generateId } from '@blind-test/shared';
import { db, schema } from '../db';

export class GameSessionRepository implements Repository<GameSession> {
  /**
   * Convert database row to GameSession type
   */
  private async toGameSession(dbSession: typeof schema.gameSessions.$inferSelect): Promise<GameSession> {
    // Fetch rounds for this session
    const dbRounds = await db
      .select()
      .from(schema.rounds)
      .where(eq(schema.rounds.sessionId, dbSession.id))
      .orderBy(schema.rounds.index);

    // For now, return basic structure - we'll populate full Round details later
    return {
      id: dbSession.id,
      roomId: dbSession.roomId,
      startedAt: new Date(dbSession.startedAt),
      endedAt: dbSession.endedAt ? new Date(dbSession.endedAt) : undefined,
      currentRoundIndex: dbSession.currentRoundIndex,
      currentSongIndex: dbSession.currentSongIndex,
      status: dbSession.status as GameSession['status'],
      rounds: [], // Will be populated when we implement Round repository
    };
  }

  async findById(id: string): Promise<GameSession | null> {
    const result = await db
      .select()
      .from(schema.gameSessions)
      .where(eq(schema.gameSessions.id, id))
      .limit(1);

    if (result.length === 0) return null;
    return this.toGameSession(result[0]);
  }

  async findAll(): Promise<GameSession[]> {
    const results = await db.select().from(schema.gameSessions);
    return Promise.all(results.map(s => this.toGameSession(s)));
  }

  async findByRoom(roomId: string): Promise<GameSession | null> {
    const result = await db
      .select()
      .from(schema.gameSessions)
      .where(eq(schema.gameSessions.roomId, roomId))
      .limit(1);

    if (result.length === 0) return null;
    return this.toGameSession(result[0]);
  }

  async create(data: Partial<GameSession>): Promise<GameSession> {
    if (!data.roomId) {
      throw new Error('roomId is required');
    }

    const id = generateId();
    const now = new Date();

    const newSession = {
      id,
      roomId: data.roomId,
      startedAt: now,
      endedAt: null,
      currentRoundIndex: 0,
      currentSongIndex: 0,
      status: 'waiting' as const,
    };

    await db.insert(schema.gameSessions).values(newSession);

    return this.toGameSession(newSession as any);
  }

  async update(id: string, data: Partial<GameSession>): Promise<GameSession> {
    const existing = await this.findById(id);
    if (!existing) throw new Error('GameSession not found');

    const updateData: any = {};

    if (data.status !== undefined) updateData.status = data.status;
    if (data.currentRoundIndex !== undefined) updateData.currentRoundIndex = data.currentRoundIndex;
    if (data.currentSongIndex !== undefined) updateData.currentSongIndex = data.currentSongIndex;
    if (data.endedAt !== undefined) updateData.endedAt = data.endedAt;

    await db
      .update(schema.gameSessions)
      .set(updateData)
      .where(eq(schema.gameSessions.id, id));

    return this.findById(id) as Promise<GameSession>;
  }

  async delete(id: string): Promise<void> {
    // Rounds will be cascade deleted due to foreign key constraint
    await db.delete(schema.gameSessions).where(eq(schema.gameSessions.id, id));
  }

  /**
   * End a game session
   */
  async endSession(id: string): Promise<GameSession> {
    return this.update(id, {
      status: 'finished',
      endedAt: new Date(),
    });
  }

  /**
   * Advance to next round
   */
  async nextRound(id: string): Promise<GameSession> {
    const session = await this.findById(id);
    if (!session) throw new Error('GameSession not found');

    return this.update(id, {
      currentRoundIndex: session.currentRoundIndex + 1,
      currentSongIndex: 0,
    });
  }

  /**
   * Advance to next song in current round
   */
  async nextSong(id: string): Promise<GameSession> {
    const session = await this.findById(id);
    if (!session) throw new Error('GameSession not found');

    return this.update(id, {
      currentSongIndex: session.currentSongIndex + 1,
    });
  }
}
