/**
 * Room Repository - In-memory implementation
 */

import type { Room, Repository } from '@blind-test/shared';
import { generateId, generateRoomCode, generateQRCode } from '@blind-test/shared';

export class RoomRepository implements Repository<Room> {
  private rooms = new Map<string, Room>();
  private codeIndex = new Map<string, string>(); // code → roomId for fast lookups

  async findById(id: string): Promise<Room | null> {
    return this.rooms.get(id) || null;
  }

  async findAll(): Promise<Room[]> {
    return Array.from(this.rooms.values());
  }

  async findByCode(code: string): Promise<Room | null> {
    const roomId = this.codeIndex.get(code);
    if (!roomId) return null;
    return this.findById(roomId);
  }

  async findByStatus(status: Room['status']): Promise<Room[]> {
    return Array.from(this.rooms.values()).filter(r => r.status === status);
  }

  async create(data: Partial<Room>): Promise<Room> {
    const id = generateId();
    const code = await this.generateUniqueCode();
    const now = new Date();

    const room: Room = {
      id,
      name: data.name || 'New Room',
      code,
      qrCode: generateQRCode(code, data.masterIp || 'localhost'),
      masterIp: data.masterIp || 'localhost',
      status: 'lobby',
      createdAt: now,
      updatedAt: now,
      maxPlayers: data.maxPlayers || 8,
      players: [],
      ...data,
    } as Room;

    this.rooms.set(room.id, room);
    this.codeIndex.set(room.code, room.id);

    return room;
  }

  async update(id: string, data: Partial<Room>): Promise<Room> {
    const room = this.rooms.get(id);
    if (!room) throw new Error('Room not found');

    const updated = {
      ...room,
      ...data,
      updatedAt: new Date(),
    };

    this.rooms.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const room = this.rooms.get(id);
    if (room) {
      this.codeIndex.delete(room.code);
      this.rooms.delete(id);
    }
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
    } while (this.codeIndex.has(code));

    return code;
  }

  /**
   * Clean up finished rooms older than specified time
   */
  async cleanupOldRooms(maxAge: number = 24 * 60 * 60 * 1000): Promise<number> {
    const now = Date.now();
    const roomsToDelete: string[] = [];

    for (const [id, room] of this.rooms.entries()) {
      if (room.status === 'finished') {
        const age = now - room.updatedAt.getTime();
        if (age > maxAge) {
          roomsToDelete.push(id);
        }
      }
    }

    for (const id of roomsToDelete) {
      await this.delete(id);
    }

    return roomsToDelete.length;
  }
}
