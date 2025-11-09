/**
 * Room Repository - SQLite implementation with Drizzle ORM
 */

import { eq, and, lt } from 'drizzle-orm';
import type { Room, Repository } from '@blind-test/shared';
import { generateId, generateRoomCode, generateRoomJoinURL } from '@blind-test/shared';
import { db, schema } from '../db';
import { getLocalNetworkIP, generateQRCodeDataURL } from '../utils/network';

export class RoomRepository implements Repository<Room> {
  /**
   * Convert database row to Room with players array
   */
  private async toRoom(dbRoom: typeof schema.rooms.$inferSelect): Promise<Room> {
    // Fetch players for this room
    const dbPlayers = await db
      .select()
      .from(schema.players)
      .where(eq(schema.players.roomId, dbRoom.id));

    // Convert DB players to shared Player type
    const players = dbPlayers.map(p => ({
      id: p.id,
      roomId: p.roomId,
      name: p.name,
      role: p.role as 'master' | 'player',
      connected: p.connected,
      joinedAt: new Date(p.joinedAt),
      score: p.score,
      roundScore: p.roundScore,
      isActive: p.isActive,
      isLockedOut: p.isLockedOut,
      stats: p.stats as any,
    }));

    return {
      id: dbRoom.id,
      name: dbRoom.name,
      code: dbRoom.code,
      qrCode: dbRoom.qrCode,
      masterIp: dbRoom.masterIp,
      status: dbRoom.status as Room['status'],
      createdAt: new Date(dbRoom.createdAt),
      updatedAt: new Date(dbRoom.updatedAt),
      maxPlayers: dbRoom.maxPlayers,
      players,
    };
  }

  async findById(id: string): Promise<Room | null> {
    const result = await db
      .select()
      .from(schema.rooms)
      .where(eq(schema.rooms.id, id))
      .limit(1);

    if (result.length === 0) return null;
    return this.toRoom(result[0]);
  }

  async findAll(): Promise<Room[]> {
    const results = await db.select().from(schema.rooms);
    return Promise.all(results.map(r => this.toRoom(r)));
  }

  async findByCode(code: string): Promise<Room | null> {
    const result = await db
      .select()
      .from(schema.rooms)
      .where(eq(schema.rooms.code, code))
      .limit(1);

    if (result.length === 0) return null;
    return this.toRoom(result[0]);
  }

  async findByStatus(status: Room['status']): Promise<Room[]> {
    const results = await db
      .select()
      .from(schema.rooms)
      .where(eq(schema.rooms.status, status));

    return Promise.all(results.map(r => this.toRoom(r)));
  }

  async create(data: Partial<Room>): Promise<Room> {
    const id = generateId();
    const code = await this.generateUniqueCode();
    const now = new Date();

    // Get local network IP for QR code
    const localIP = getLocalNetworkIP();
    const joinURL = generateRoomJoinURL(id, localIP, 5173);
    const qrCode = await generateQRCodeDataURL(joinURL);

    const newRoom = {
      id,
      name: data.name || 'New Room',
      code,
      qrCode,
      masterIp: localIP,
      status: 'lobby' as const,
      createdAt: now,
      updatedAt: now,
      maxPlayers: data.maxPlayers || 8,
    };

    await db.insert(schema.rooms).values(newRoom);

    console.log(`[RoomRepository] Created room with QR code URL: ${joinURL}`);

    return {
      ...newRoom,
      players: [],
    };
  }

  async update(id: string, data: Partial<Room>): Promise<Room> {
    const existing = await this.findById(id);
    if (!existing) throw new Error('Room not found');

    const updateData: any = {
      updatedAt: new Date(),
    };

    // Only update allowed fields
    if (data.name !== undefined) updateData.name = data.name;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.maxPlayers !== undefined) updateData.maxPlayers = data.maxPlayers;
    if (data.masterIp !== undefined) updateData.masterIp = data.masterIp;

    await db
      .update(schema.rooms)
      .set(updateData)
      .where(eq(schema.rooms.id, id));

    return this.findById(id) as Promise<Room>;
  }

  async delete(id: string): Promise<void> {
    // Players will be cascade deleted due to foreign key constraint
    await db.delete(schema.rooms).where(eq(schema.rooms.id, id));
  }

  /**
   * Generate a unique 4-character room code
   */
  private async generateUniqueCode(): Promise<string> {
    let code: string;
    let attempts = 0;
    const maxAttempts = 100;

    do {
      code = generateRoomCode();
      attempts++;

      if (attempts > maxAttempts) {
        throw new Error('Unable to generate unique room code');
      }

      // Check if code exists in database
      const existing = await db
        .select()
        .from(schema.rooms)
        .where(eq(schema.rooms.code, code))
        .limit(1);

      if (existing.length === 0) {
        return code;
      }
    } while (true);
  }

  /**
   * Clean up finished rooms older than specified time
   */
  async cleanupOldRooms(maxAge: number = 24 * 60 * 60 * 1000): Promise<number> {
    const cutoffDate = new Date(Date.now() - maxAge);

    // Delete finished rooms older than cutoff
    const result = await db
      .delete(schema.rooms)
      .where(
        and(
          eq(schema.rooms.status, 'finished'),
          lt(schema.rooms.updatedAt, cutoffDate)
        )
      );

    // Note: better-sqlite3 doesn't return affected rows count directly
    // This would need to be implemented with a SELECT COUNT before delete if needed
    return 0; // Placeholder - implement if count is needed
  }
}
