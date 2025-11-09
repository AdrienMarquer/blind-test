/**
 * WebSocket Connection Manager (Svelte 5 Runes)
 * Manages Socket.io connections to room namespaces
 */

import { io, type Socket } from 'socket.io-client';
import type { Room, Player } from '@blind-test/shared';

const SERVER_URL = 'http://localhost:3007';

/**
 * Room Socket Manager
 * Manages connection to a specific room namespace
 */
export class RoomSocket {
  socket: Socket | null = $state(null);
  connected = $state(false);
  room = $state<Room | null>(null);
  players = $state<Player[]>([]);
  error = $state<string | null>(null);

  constructor(
    private roomId: string,
    private auth: {
      playerId?: string;
      playerName?: string;
      role?: 'master' | 'player';
    } = {}
  ) {}

  /**
   * Connect to the room namespace
   */
  connect() {
    if (this.socket?.connected) return;

    this.socket = io(`${SERVER_URL}/rooms/${this.roomId}`, {
      auth: this.auth,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.setupListeners();
  }

  /**
   * Setup event listeners
   */
  private setupListeners() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      this.connected = true;
      this.error = null;
      console.log(`Connected to room ${this.roomId}`);

      // Request initial state sync
      this.requestStateSync();
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      console.log(`Disconnected from room ${this.roomId}:`, reason);
    });

    this.socket.on('connection_error', (error) => {
      this.error = error.message;
      console.error('Connection error:', error);
    });

    // State sync
    this.socket.on('state:synced', (data: { room: Room; players: Player[] }) => {
      this.room = data.room;
      this.players = data.players;
      console.log('State synced:', data);
    });

    // Player events
    this.socket.on('player:joined', (data: { player: Player; room: Room }) => {
      this.room = data.room;

      // Add player if not already in list
      if (!this.players.find((p) => p.id === data.player.id)) {
        this.players = [...this.players, data.player];
      }

      console.log(`Player joined: ${data.player.name}`);
    });

    this.socket.on('player:left', (data: { playerId: string; playerName: string; remainingPlayers: number }) => {
      this.players = this.players.filter((p) => p.id !== data.playerId);
      console.log(`Player left: ${data.playerName}`);
    });

    this.socket.on('player:kicked', (data: { reason: string }) => {
      this.error = `You were kicked: ${data.reason}`;
      this.disconnect();
    });

    this.socket.on('player:disconnected', (data: { playerId: string; playerName: string }) => {
      // Mark player as disconnected
      this.players = this.players.map((p) =>
        p.id === data.playerId ? { ...p, connected: false } : p
      );
      console.log(`Player disconnected: ${data.playerName}`);
    });

    this.socket.on('player:reconnected', (data: { playerId: string; playerName: string }) => {
      // Mark player as reconnected
      this.players = this.players.map((p) =>
        p.id === data.playerId ? { ...p, connected: true } : p
      );
      console.log(`Player reconnected: ${data.playerName}`);
    });

    // Error events
    this.socket.on('error', (data: { code: string; message: string }) => {
      this.error = data.message;
      console.error(`Server error [${data.code}]:`, data.message);
    });
  }

  /**
   * Join the room as a player
   */
  joinRoom(playerName: string) {
    this.socket?.emit('player:join', { name: playerName });
  }

  /**
   * Leave the room
   */
  leaveRoom() {
    this.socket?.emit('player:leave');
  }

  /**
   * Kick a player (master only)
   */
  kickPlayer(playerId: string) {
    this.socket?.emit('player:kick', { playerId });
  }

  /**
   * Request state synchronization
   */
  requestStateSync() {
    this.socket?.emit('state:sync');
  }

  /**
   * Disconnect from the room
   */
  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.connected = false;
  }

  /**
   * Cleanup on destroy
   */
  destroy() {
    this.disconnect();
  }
}

/**
 * Create a room socket connection
 */
export function createRoomSocket(
  roomId: string,
  auth?: {
    playerId?: string;
    playerName?: string;
    role?: 'master' | 'player';
  }
): RoomSocket {
  return new RoomSocket(roomId, auth);
}
