/**
 * Room Repository - SQLite implementation with Drizzle ORM
 */

import { eq, and, lt } from 'drizzle-orm';
import type { Room, Repository, PlayerStats } from '@blind-test/shared';
import { generateId, generateRoomCode, ROOM_CONFIG } from '@blind-test/shared';
import { db, schema } from '../db';
import { getLocalNetworkIP, generateQRCodeDataURL, generateRoomJoinURL } from '../utils/network';
import { AuthService } from '../services/AuthService';
import { logger } from '../utils/logger';

const roomLogger = logger.child({ module: 'RoomRepository' });

/**
 * DTO for updating room fields
 */
interface RoomUpdateDTO {
  name?: string;
  status?: Room['status'];
  maxPlayers?: number;
  masterIp?: string;
}

export class RoomRepository implements Repository<Room> {
  /**
   * Convert database row to Room with players array
   * @param dbRoom - Database room record
   * @param dbPlayers - Optional pre-fetched players (avoids N+1 queries)
   */
  private async toRoom(
    dbRoom: typeof schema.rooms.$inferSelect,
    dbPlayers?: Array<typeof schema.players.$inferSelect>
  ): Promise<Room> {
    // Fetch players for this room if not provided
    const playersData = dbPlayers ?? await db
      .select()
      .from(schema.players)
      .where(eq(schema.players.roomId, dbRoom.id));

    // Convert DB players to shared Player type with proper stats typing
    const players = playersData.map(p => ({
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
      // Drizzle returns JSON fields as the parsed object, we just need to type it
      stats: p.stats as PlayerStats,
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
    // Fetch all rooms
    const rooms = await db.select().from(schema.rooms);

    if (rooms.length === 0) return [];

    // Fetch all players in one query (avoids N+1 problem)
    const allPlayers = await db.select().from(schema.players);

    // Group players by roomId for efficient lookup
    const playersByRoom = new Map<string, Array<typeof schema.players.$inferSelect>>();
    for (const player of allPlayers) {
      if (!playersByRoom.has(player.roomId)) {
        playersByRoom.set(player.roomId, []);
      }
      playersByRoom.get(player.roomId)!.push(player);
    }

    // Convert rooms with their pre-fetched players (2 queries total instead of N+1)
    return Promise.all(
      rooms.map(room => this.toRoom(room, playersByRoom.get(room.id) || []))
    );
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

  async create(data: Partial<Room>): Promise<Room & { masterToken: string }> {
    const id = generateId();
    const code = await this.generateUniqueCode();
    const masterToken = AuthService.generateToken();
    const now = new Date();

    // Get local network IP for QR code
    const localIP = getLocalNetworkIP();
    const joinURL = generateRoomJoinURL(id, localIP);
    const qrCode = await generateQRCodeDataURL(joinURL);

    const newRoom = {
      id,
      name: data.name || 'New Room',
      code,
      qrCode,
      masterIp: localIP,
      masterToken, // Store master token in database
      status: 'lobby' as const,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      maxPlayers: data.maxPlayers || ROOM_CONFIG.DEFAULT_MAX_PLAYERS,
    };

    await db.insert(schema.rooms).values(newRoom);

    roomLogger.info('Created room with QR code', { roomId: id, joinURL });

    // Return room with masterToken for initial response (client needs it once)
    return {
      ...newRoom,
      createdAt: now,
      updatedAt: now,
      players: [],
      masterToken, // Client gets this once on creation
    };
  }

  async update(id: string, data: Partial<Room>): Promise<Room> {
    const existing = await this.findById(id);
    if (!existing) throw new Error('Room not found');

    // Build typed update DTO with only allowed fields
    const updateData: RoomUpdateDTO & { updatedAt: string } = {
      updatedAt: new Date().toISOString(),
    };

    // Only update allowed fields (explicit whitelisting)
    if (data.name !== undefined) updateData.name = data.name;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.maxPlayers !== undefined) updateData.maxPlayers = data.maxPlayers;
    if (data.masterIp !== undefined) updateData.masterIp = data.masterIp;

    await db
      .update(schema.rooms)
      .set(updateData)
      .where(eq(schema.rooms.id, id));

    // Safe to cast because we just updated it
    const updated = await this.findById(id);
    if (!updated) throw new Error('Failed to fetch updated room');
    return updated;
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
   * Get master token for a room (for authorization checks)
   * INTERNAL USE ONLY - never expose to client
   */
  async getMasterToken(roomId: string): Promise<string | null> {
    const result = await db
      .select({ masterToken: schema.rooms.masterToken })
      .from(schema.rooms)
      .where(eq(schema.rooms.id, roomId))
      .limit(1);

    return result.length > 0 ? result[0].masterToken : null;
  }

  /**
   * Clean up finished rooms older than specified time
   */
  async cleanupOldRooms(maxAge: number = 24 * 60 * 60 * 1000): Promise<number> {
    const cutoffDate = new Date(Date.now() - maxAge).toISOString();

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

  /**
   * Delete all rooms created more than N days ago
   * @param days - Number of days after which rooms should be deleted
   * @returns Number of deleted rooms
   */
  async deleteOlderThan(days: number): Promise<number> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Count rooms to be deleted first
    const toDelete = await db
      .select()
      .from(schema.rooms)
      .where(lt(schema.rooms.createdAt, cutoffDate));

    const count = toDelete.length;

    if (count > 0) {
      await db
        .delete(schema.rooms)
        .where(lt(schema.rooms.createdAt, cutoffDate));
    }

    return count;
  }
}
