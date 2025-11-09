/**
 * WebSocket Connection Manager (Svelte 5 Runes)
 * Manages native WebSocket connections to room endpoints
 */

import type { Room, Player } from '@blind-test/shared';

// Auto-detect server URL based on current host
// In dev: uses localhost, in production: uses same host as client
const getServerUrl = () => {
  if (typeof window === 'undefined') return 'ws://localhost:3007';

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;

  // If accessing from local network (not localhost), use that IP
  if (host !== 'localhost' && host !== '127.0.0.1') {
    return `${protocol}//${host}:3007`;
  }

  return 'ws://localhost:3007';
};

const SERVER_URL = getServerUrl();

interface WebSocketMessage {
  type: string;
  data?: any;
}

/**
 * Room Socket Manager
 * Manages connection to a specific room namespace
 */
export class RoomSocket {
  socket: WebSocket | null = $state(null);
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
   * Connect to the room WebSocket
   */
  connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return;

    const wsUrl = `${SERVER_URL}/ws/rooms/${this.roomId}`;
    this.socket = new WebSocket(wsUrl);

    this.setupListeners();
  }

  /**
   * Setup event listeners
   */
  private setupListeners() {
    if (!this.socket) return;

    // Connection events
    this.socket.onopen = () => {
      this.connected = true;
      this.error = null;
      console.log(`Connected to room ${this.roomId}`);

      // Request initial state sync
      this.requestStateSync();
    };

    this.socket.onclose = (event) => {
      this.connected = false;
      console.log(`Disconnected from room ${this.roomId}:`, event.reason);
    };

    this.socket.onerror = (error) => {
      this.error = 'Connection error';
      console.error('WebSocket error:', error);
    };

    this.socket.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: WebSocketMessage) {
    console.log('Received message:', message.type, message.data);

    switch (message.type) {
      case 'connected':
        // Initial connection confirmed
        break;

      case 'state:synced':
        this.room = message.data.room;
        this.players = message.data.players || [];
        console.log('State synced:', message.data);
        break;

      case 'player:joined':
        this.room = message.data.room;
        // Add player if not already in list
        if (message.data.player && !this.players.find((p) => p.id === message.data.player.id)) {
          this.players = [...this.players, message.data.player];
        }
        console.log(`Player joined: ${message.data.player?.name}`);
        break;

      case 'player:left':
        this.players = this.players.filter((p) => p.id !== message.data.playerId);
        console.log(`Player left: ${message.data.playerName}`);
        break;

      case 'player:kicked':
        this.error = `You were kicked: ${message.data.reason}`;
        this.disconnect();
        break;

      case 'player:disconnected':
        // Mark player as disconnected
        this.players = this.players.map((p) =>
          p.id === message.data.playerId ? { ...p, connected: false } : p
        );
        console.log(`Player disconnected: ${message.data.playerName}`);
        break;

      case 'player:reconnected':
        // Mark player as reconnected
        this.players = this.players.map((p) =>
          p.id === message.data.playerId ? { ...p, connected: true } : p
        );
        console.log(`Player reconnected: ${message.data.playerName}`);
        break;

      case 'game:started':
        // Update room status when game starts
        this.room = message.data.room;
        console.log('Game started:', message.data.room);
        break;

      case 'error':
        this.error = message.data.message;
        console.error(`Server error [${message.data.code}]:`, message.data.message);
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  /**
   * Send a message to the server
   */
  private send(message: WebSocketMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not open');
    }
  }

  /**
   * Join the room as a player
   */
  joinRoom(playerName: string) {
    this.send({
      type: 'player:join',
      data: { name: playerName }
    });
  }

  /**
   * Leave the room
   */
  leaveRoom() {
    this.send({
      type: 'player:leave'
    });
  }

  /**
   * Kick a player (master only)
   */
  kickPlayer(playerId: string) {
    this.send({
      type: 'player:kick',
      data: { playerId }
    });
  }

  /**
   * Request state synchronization
   */
  requestStateSync() {
    this.send({
      type: 'state:sync'
    });
  }

  /**
   * Disconnect from the room
   */
  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.connected = false;
    }
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
