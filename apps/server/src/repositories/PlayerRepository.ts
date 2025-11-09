/**
 * Player Repository - In-memory implementation
 */

import type { Player, Repository } from '@blind-test/shared';
import { generateId } from '@blind-test/shared';

export class PlayerRepository implements Repository<Player> {
  private players = new Map<string, Player>();
  private roomIndex = new Map<string, Set<string>>(); // roomId → Set<playerId>

  async findById(id: string): Promise<Player | null> {
    return this.players.get(id) || null;
  }

  async findAll(): Promise<Player[]> {
    return Array.from(this.players.values());
  }

  async findByRoom(roomId: string): Promise<Player[]> {
    const playerIds = this.roomIndex.get(roomId) || new Set();
    return Array.from(playerIds)
      .map(id => this.players.get(id))
      .filter(Boolean) as Player[];
  }

  async findByRoomAndName(roomId: string, name: string): Promise<Player | null> {
    const players = await this.findByRoom(roomId);
    return players.find(p => p.name === name) || null;
  }

  async create(data: Partial<Player>): Promise<Player> {
    if (!data.roomId || !data.name) {
      throw new Error('roomId and name are required');
    }

    const id = generateId();
    const now = new Date();

    const player: Player = {
      id,
      roomId: data.roomId,
      name: data.name,
      role: data.role || 'player',
      connected: true,
      joinedAt: now,
      score: 0,
      roundScore: 0,
      isActive: false,
      isLockedOut: false,
      stats: {
        totalAnswers: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        buzzCount: 0,
        averageAnswerTime: 0,
      },
      ...data,
    } as Player;

    this.players.set(id, player);

    // Update room index
    if (!this.roomIndex.has(player.roomId)) {
      this.roomIndex.set(player.roomId, new Set());
    }
    this.roomIndex.get(player.roomId)!.add(id);

    return player;
  }

  async update(id: string, data: Partial<Player>): Promise<Player> {
    const player = this.players.get(id);
    if (!player) throw new Error('Player not found');

    const updated = {
      ...player,
      ...data,
    };

    this.players.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const player = this.players.get(id);
    if (player) {
      // Remove from room index
      const playerIds = this.roomIndex.get(player.roomId);
      if (playerIds) {
        playerIds.delete(id);
        if (playerIds.size === 0) {
          this.roomIndex.delete(player.roomId);
        }
      }

      this.players.delete(id);
    }
  }

  /**
   * Delete all players in a room
   */
  async deleteByRoom(roomId: string): Promise<void> {
    const playerIds = this.roomIndex.get(roomId);
    if (playerIds) {
      for (const id of playerIds) {
        this.players.delete(id);
      }
      this.roomIndex.delete(roomId);
    }
  }

  /**
   * Reset scores for all players in a room
   */
  async resetScores(roomId: string): Promise<void> {
    const players = await this.findByRoom(roomId);
    for (const player of players) {
      await this.update(player.id, {
        score: 0,
        roundScore: 0,
        isActive: false,
        isLockedOut: false,
      });
    }
  }

  /**
   * Count connected players in a room
   */
  async countConnected(roomId: string): Promise<number> {
    const players = await this.findByRoom(roomId);
    return players.filter(p => p.connected).length;
  }
}
