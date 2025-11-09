/**
 * WebSocket Connection Manager (Svelte 5 Runes)
 * Type-safe event-driven architecture for real-time communication
 */

import type { Room, Player, ServerMessage, ClientMessage } from '@blind-test/shared';

// Auto-detect server URL based on current host
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

/**
 * Reactive event stream - components subscribe to specific events using $effect()
 */
export class GameEvents {
  // Song events
  songStarted = $state<{ songIndex: number; duration: number; audioUrl: string; clipStart: number } | null>(null);
  songEnded = $state<{ songIndex: number; correctTitle: string; correctArtist: string } | null>(null);

  // Player events (gameplay)
  playerBuzzed = $state<{ playerId: string; playerName: string; titleChoices?: string[] } | null>(null);
  buzzRejected = $state<{ playerId: string; reason: string } | null>(null);
  answerResult = $state<{
    playerId: string;
    isCorrect: boolean;
    pointsAwarded: number;
    shouldShowArtistChoices?: boolean;
    lockOutPlayer?: boolean;
  } | null>(null);
  artistChoices = $state<{ playerId: string; artistChoices: string[] } | null>(null);

  // Round events
  roundStarted = $state<{ roundIndex: number; songCount: number; modeType: string } | null>(null);
  roundEnded = $state<{ roundIndex: number; scores: Record<string, number> } | null>(null);

  // Game control events
  gamePaused = $state<{ timestamp: number } | null>(null);
  gameResumed = $state<{ timestamp: number } | null>(null);
  gameSkipped = $state<{ timestamp: number } | null>(null);

  /**
   * Clear an event after it's been processed
   */
  clear(eventName: keyof Omit<GameEvents, 'clear'>) {
    (this as any)[eventName] = null;
  }
}

/**
 * Room Socket Manager
 * Manages connection to a specific room with type-safe event emission
 */
export class RoomSocket {
  // Private WebSocket - components can't access directly
  private socket: WebSocket | null = $state(null);
  private connectionTimeout: number | null = null;

  // Public reactive state
  connected = $state(false);
  room = $state<Room | null>(null);
  players = $state<Player[]>([]);
  error = $state<string | null>(null);

  // Reactive event stream
  events = new GameEvents();

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
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected');
      return;
    }

    const wsUrl = `${SERVER_URL}/ws/rooms/${this.roomId}`;
    console.log('[WebSocket] Connecting to:', wsUrl);

    this.socket = new WebSocket(wsUrl);

    // Set connection timeout (5 seconds)
    this.connectionTimeout = window.setTimeout(() => {
      if (!this.connected && this.socket) {
        console.error('[WebSocket] Connection timeout');
        this.error = 'Connection timeout - server may be unavailable';
        this.socket.close();
        this.socket = null;
      }
    }, 5000);

    this.setupListeners();
  }

  /**
   * Setup event listeners
   */
  private setupListeners() {
    if (!this.socket) return;

    this.socket.onopen = () => {
      console.log('[WebSocket] Connected');

      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }

      this.connected = true;
      this.error = null;

      // Request initial state sync
      this.requestStateSync();
    };

    this.socket.onclose = (event) => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }

      this.connected = false;
      console.log(`[WebSocket] Disconnected. Code: ${event.code}, Reason: ${event.reason}`);

      if (event.code !== 1000 && event.code !== 1005) {
        this.error = event.reason || 'Connection closed unexpectedly';
      }
    };

    this.socket.onerror = () => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }

      this.connected = false;
      this.error = 'Connection error - check if server is running';
      console.error('[WebSocket] Connection failed');
    };

    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage;
        this.handleMessage(message);
      } catch (error) {
        console.error('[WebSocket] Error parsing message:', error);
      }
    };
  }

  /**
   * Handle incoming WebSocket messages
   * Single source of truth for message parsing
   */
  private handleMessage(message: ServerMessage) {
    console.log('[WS]', message.type, message.data);

    switch (message.type) {
      // Connection
      case 'connected':
        break;

      case 'state:synced':
        this.room = message.data.room;
        this.players = message.data.players || [];
        break;

      case 'error':
        this.error = message.data.message;
        console.error(`[WS Error] ${message.data.code || 'ERROR'}:`, message.data.message);
        break;

      // Player Events
      case 'player:joined':
        this.room = message.data.room;
        if (message.data.player && !this.players.find((p) => p.id === message.data.player.id)) {
          this.players = [...this.players, message.data.player];
        }
        break;

      case 'player:left':
        this.players = this.players.filter((p) => p.id !== message.data.playerId);
        break;

      case 'player:kicked':
        this.error = `You were kicked: ${message.data.reason}`;
        this.disconnect();
        break;

      case 'player:disconnected':
        this.players = this.players.map((p) =>
          p.id === message.data.playerId ? { ...p, connected: false } : p
        );
        break;

      case 'player:reconnected':
        this.players = this.players.map((p) =>
          p.id === message.data.playerId ? { ...p, connected: true } : p
        );
        break;

      // Game Flow
      case 'game:started':
        this.room = message.data.room;
        break;

      case 'round:started':
        this.events.roundStarted = message.data;
        break;

      case 'round:ended':
        this.events.roundEnded = message.data;
        break;

      // Song Events - emit to reactive stream
      case 'song:started':
        this.events.songStarted = message.data;
        break;

      case 'song:ended':
        this.events.songEnded = message.data;
        break;

      // Gameplay - emit to reactive stream
      case 'player:buzzed':
        this.events.playerBuzzed = message.data;
        break;

      case 'buzz:rejected':
        this.events.buzzRejected = message.data;
        break;

      case 'answer:result':
        this.events.answerResult = message.data;
        break;

      case 'choices:artist':
        this.events.artistChoices = message.data;
        break;

      // Master Controls - emit to reactive stream
      case 'game:paused':
        this.events.gamePaused = message.data;
        break;

      case 'game:resumed':
        this.events.gameResumed = message.data;
        break;

      case 'game:skipped':
        this.events.gameSkipped = message.data;
        break;
    }
  }

  /**
   * Send a message to the server (type-safe)
   */
  private send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.error('[WebSocket] Cannot send - socket not open');
    }
  }

  // ========================================================================
  // Connection Methods
  // ========================================================================

  requestStateSync() {
    this.send({ type: 'state:sync' });
  }

  joinRoom(playerName: string) {
    this.send({
      type: 'player:join',
      data: { name: playerName }
    });
  }

  leaveRoom() {
    this.send({ type: 'player:leave' });
  }

  kickPlayer(playerId: string) {
    this.send({
      type: 'player:kick',
      data: { playerId }
    });
  }

  // ========================================================================
  // Gameplay Methods
  // ========================================================================

  buzz(songIndex: number) {
    this.send({
      type: 'player:buzz',
      data: { songIndex }
    });
  }

  submitAnswer(songIndex: number, answerType: 'title' | 'artist', value: string) {
    this.send({
      type: 'player:answer',
      data: { songIndex, answerType, value }
    });
  }

  pauseGame() {
    this.send({ type: 'game:pause' });
  }

  resumeGame() {
    this.send({ type: 'game:resume' });
  }

  skipSong() {
    this.send({ type: 'game:skip' });
  }

  // ========================================================================
  // Cleanup
  // ========================================================================

  disconnect() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.connected = false;
    }
  }

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
