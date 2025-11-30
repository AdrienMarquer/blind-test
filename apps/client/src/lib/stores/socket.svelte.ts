/**
 * WebSocket Connection Manager (Svelte 5 Runes)
 * Type-safe event-driven architecture for real-time communication
 */

import type { Room, Player, ServerMessage, ClientMessage, MediaQuestion } from '@blind-test/shared';
import { writable, type Writable, get } from 'svelte/store';

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
  songPreparing = $state<{ songIndex: number; genre?: string; year?: number; countdown: number } | null>(null);
  songStarted = $state<{ songIndex: number; duration: number; audioUrl: string; clipStart: number; audioPlayback: 'master' | 'players' | 'all'; songTitle?: string; songArtist?: string } | null>(null);
  songEnded = $state<{
    songIndex: number;
    correctTitle: string;
    correctArtist: string;
    winners?: Array<{
      playerId: string;
      playerName: string;
      answersCorrect: ('title' | 'artist')[];
      pointsEarned: number;
      timeToAnswer: number;
    }>;
  } | null>(null);

  // Player events (gameplay)
  playerBuzzed = $state<{ playerId: string; playerName: string; songIndex: number; modeType: import('@blind-test/shared').ModeType; manualValidation?: boolean; artistQuestion?: MediaQuestion } | null>(null);
  buzzRejected = $state<{ playerId: string; reason: string } | null>(null);
  answerResult = $state<{
    playerId: string;
    playerName: string;
    answerType: 'title' | 'artist';
    isCorrect: boolean;
    pointsAwarded: number;
    shouldShowTitleChoices?: boolean;
    lockOutPlayer?: boolean;
  } | null>(null);
  titleChoices = $state<{ playerId: string; titleQuestion: MediaQuestion } | null>(null);

  // Round events
  roundStarted = $state<{ roundIndex: number; songCount: number; modeType: string } | null>(null);
  roundEnded = $state<{ roundIndex: number; scores: Array<{ playerId: string; playerName: string; score: number; rank: number }> } | null>(null);
  roundBetween = $state<{
    completedRoundIndex: number;
    nextRoundIndex: number;
    nextRoundMode: string;
    nextRoundMedia: string;
    scores: Array<{ playerId: string; playerName: string; score: number; rank: number }>;
  } | null>(null);
  gameEnded = $state<{ finalScores: import('@blind-test/shared').FinalScore[] } | null>(null);

  // Game control events
  gamePaused = $state<{ timestamp: number } | null>(null);
  gameResumed = $state<{ timestamp: number } | null>(null);

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

  // Public reactive state (Svelte stores for easy subscription)
  connected: Writable<boolean> = writable(false);
  room: Writable<Room | null> = writable(null);
  players: Writable<Player[]> = writable([]);
  error: Writable<string | null> = writable(null);

  // Reactive event stream
  events = new GameEvents();

  // Timer state
  songTimeRemaining = $state<number>(0);
  answerTimeRemaining = $state<number>(0);
  answerPlayerId = $state<string | null>(null);

  constructor(
    private roomId: string,
    private auth: {
      token?: string;
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

    // Build WebSocket URL with optional auth query parameters
    let wsUrl = `${SERVER_URL}/ws/rooms/${this.roomId}`;
    const params = new URLSearchParams();

    if (this.auth.token) {
      params.append('token', this.auth.token);
    }
    if (this.auth.playerId) {
      params.append('playerId', this.auth.playerId);
    }

    if (params.toString()) {
      wsUrl += `?${params.toString()}`;
    }

    console.log('[WebSocket] Connecting to:', wsUrl);

    this.socket = new WebSocket(wsUrl);

    // Set connection timeout (5 seconds)
    this.connectionTimeout = window.setTimeout(() => {
      if (!get(this.connected) && this.socket) {
        console.error('[WebSocket] Connection timeout');
        this.error.set('Connection timeout - server may be unavailable');
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

      this.connected.set(true);
      this.error.set(null);

      // Request initial state sync
      this.requestStateSync();
    };

    this.socket.onclose = (event) => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }

      this.connected.set(false);
      console.log(`[WebSocket] Disconnected. Code: ${event.code}, Reason: ${event.reason}`);

      if (event.code !== 1000 && event.code !== 1005) {
        this.error.set(event.reason || 'Connection closed unexpectedly');
      }
    };

    this.socket.onerror = () => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }

      this.connected.set(false);
      this.error.set('Connection error - check if server is running');
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
    // Log all messages except high-frequency timer updates
    if (!message.type.startsWith('timer:')) {
      console.log('[WS]', message.type, message.data);
    }

    switch (message.type) {
      // Connection
      case 'connected':
        break;

      case 'state:synced':
        this.room.set(message.data.room);
        this.players.set(message.data.players || []);
        break;

      case 'error':
        this.error.set(message.data.message);
        console.error(`[WS Error] ${message.data.code || 'ERROR'}:`, message.data.message);
        break;

      // Player Events
      case 'player:joined':
        this.room.set(message.data.room);
        if (message.data.player && !get(this.players).find((p) => p.id === message.data.player.id)) {
          this.players.update((players) => [...players, message.data.player]);
        }
        break;

      case 'player:left':
        this.players.update((players) => players.filter((p) => p.id !== message.data.playerId));
        break;

      case 'player:kicked':
        this.error.set(`You were kicked: ${message.data.reason}`);
        this.disconnect();
        break;

      case 'player:disconnected':
        this.players.update((players) =>
          players.map((p) => (p.id === message.data.playerId ? { ...p, connected: false } : p))
        );
        break;

      case 'player:reconnected':
        this.players.update((players) =>
          players.map((p) => (p.id === message.data.playerId ? { ...p, connected: true } : p))
        );
        break;

      // Game Flow
      case 'game:started':
        this.room.set(message.data.room);
        break;

      case 'round:started':
        console.log('[WS] Received round:started event', message.data);
        // Update room status to playing
        if (message.data.room) {
          this.room.set(message.data.room);
        }
        this.events.roundStarted = message.data;
        break;

      case 'round:ended':
        this.events.roundEnded = message.data;
        break;

      case 'round:between':
        console.log('[WS] Received round:between event', message.data);
        // Update room status to between_rounds
        if (message.data.room) {
          this.room.set(message.data.room);
        }
        this.events.roundBetween = message.data;
        break;

      case 'game:ended':
        console.log('[WS] Received game:ended event', {
          finalScoresCount: message.data.finalScores?.length,
          scores: message.data.finalScores?.map(fs => ({ name: fs.playerName, score: fs.totalScore }))
        });
        this.events.gameEnded = message.data;
        break;

      // Song Events - emit to reactive stream
      case 'song:preparing':
        this.events.songPreparing = message.data;
        break;

      case 'song:started':
        this.events.songStarted = message.data;
        break;

      case 'song:ended':
        this.events.songEnded = message.data;
        // Reset timer when song ends
        this.songTimeRemaining = 0;
        break;

      // Gameplay - emit to reactive stream
      case 'player:buzzed':
        // Initialize answer timer with value from server to avoid showing stale timer
        if (message.data.answerTimer) {
          this.answerTimeRemaining = message.data.answerTimer;
        }
        this.events.playerBuzzed = message.data;
        break;

      case 'buzz:rejected':
        this.events.buzzRejected = message.data;
        break;

      case 'answer:result':
        this.events.answerResult = message.data;
        break;

      case 'choices:title':
        // Reset answer timer for title question (fresh 6 seconds)
        if (message.data.answerTimer) {
          this.answerTimeRemaining = message.data.answerTimer;
        }
        this.events.titleChoices = message.data;
        break;

      // Master Controls - emit to reactive stream
      case 'game:paused':
        this.events.gamePaused = message.data;
        break;

      case 'game:resumed':
        this.events.gameResumed = message.data;
        break;

      // Timer Events
      case 'timer:song':
        this.songTimeRemaining = message.data.timeRemaining;
        break;

      case 'timer:answer':
        this.answerTimeRemaining = message.data.timeRemaining;
        this.answerPlayerId = message.data.playerId;
        break;

      // Score Updates
      case 'score:updated':
        console.log('[WS] Score updated', {
          playerId: message.data.playerId,
          playerName: message.data.playerName,
          newScore: message.data.score,
          pointsAwarded: message.data.pointsAwarded
        });
        // Update player score in local players array
        this.players.update((players) =>
          players.map((p) =>
            p.id === message.data.playerId ? { ...p, score: message.data.score } : p
          )
        );
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
      this.connected.set(false);
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
    token?: string;
    playerId?: string;
    playerName?: string;
    role?: 'master' | 'player';
  }
): RoomSocket {
  return new RoomSocket(roomId, auth);
}
