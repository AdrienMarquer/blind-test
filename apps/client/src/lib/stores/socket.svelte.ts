/**
 * WebSocket Connection Manager (Svelte 5 Runes)
 * Type-safe event-driven architecture for real-time communication
 */

import type { Room, Player, ServerMessage, ClientMessage, MediaQuestion, MediaType } from '@blind-test/shared';
import { writable, type Writable, get } from 'svelte/store';
import { getWsUrl } from '$lib/api';

const SERVER_URL = getWsUrl();

/**
 * Reactive event stream - components subscribe to specific events using $effect()
 */
export class GameEvents {
  // Song events
  songPreparing = $state<{ songIndex: number; genre?: string; year?: number; countdown: number } | null>(null);
  songStarted = $state<{ songIndex: number; duration: number; audioUrl: string; clipStart: number; audioPlayback: 'master' | 'players' | 'all'; songTitle?: string; songArtist?: string; albumArt?: string; answerTimer?: number } | null>(null);
  songEnded = $state<{
    songIndex: number;
    correctTitle: string;
    correctArtist: string;
    albumArt?: string;
    winners?: Array<{
      playerId: string;
      playerName: string;
      answersCorrect: ('title' | 'artist')[];
      pointsEarned: number;
      timeToAnswer: number;
    }>;
  } | null>(null);

  // Player events (gameplay)
  playerBuzzed = $state<{ playerId: string; playerName: string; songIndex: number; modeType: import('@blind-test/shared').ModeType; manualValidation?: boolean; artistQuestion?: MediaQuestion; titleQuestion?: MediaQuestion; answerTimer?: number } | null>(null);
  buzzRejected = $state<{ playerId: string; reason: string } | null>(null);
  answerResult = $state<{
    playerId: string;
    playerName: string;
    answerType: 'title' | 'artist';
    isCorrect: boolean;
    pointsAwarded: number;
    shouldShowTitleChoices?: boolean;
    lockOutPlayer?: boolean;
    message?: string;
  } | null>(null);
  titleChoices = $state<{ playerId: string; titleQuestion: MediaQuestion; answerTimer?: number } | null>(null);

  // Round events
  roundStarted = $state<{ room: Room | null; roundIndex: number; songCount: number; modeType: string; mediaType: MediaType } | null>(null);
  roundEnded = $state<{ roundIndex: number; scores: Array<{ playerId: string; playerName: string; score: number; rank: number }> } | null>(null);
  roundBetween = $state<{
    room: Room;
    completedRoundIndex: number;
    nextRoundIndex: number;
    nextRoundMode: string;
    nextRoundMedia: string;
    scores: Array<{ playerId: string; playerName: string; score: number; rank: number }>;
  } | null>(null);
  gameEnded = $state<{ finalScores: import('@blind-test/shared').FinalScore[] } | null>(null);
  gameRestarted = $state<{ room: import('@blind-test/shared').Room; players: import('@blind-test/shared').Player[] } | null>(null);

  // Game control events
  gamePaused = $state<{ timestamp: number } | null>(null);
  gameResumed = $state<{ timestamp: number; reason?: string } | null>(null);

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
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: number | null = null;
  private isManualDisconnect = false;

  // Public reactive state (Svelte stores for easy subscription)
  connected: Writable<boolean> = writable(false);
  room: Writable<Room | null> = writable(null);
  players: Writable<Player[]> = writable([]);
  error: Writable<string | null> = writable(null);
  reconnecting: Writable<boolean> = writable(false);

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

    this.isManualDisconnect = false;

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
        // Try to reconnect on timeout
        this.scheduleReconnect();
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

      // Reset reconnection state on successful connection
      this.reconnectAttempts = 0;
      this.reconnecting.set(false);
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
      console.log(`[WebSocket] Disconnected. Code: ${event.code}, Reason: ${event.reason}, Manual: ${this.isManualDisconnect}`);

      // Don't reconnect on clean close (1000) or manual disconnect
      if (event.code !== 1000 && !this.isManualDisconnect) {
        this.error.set(event.reason || 'Connection perdue');
        this.scheduleReconnect();
      }
    };

    this.socket.onerror = () => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }

      this.connected.set(false);
      this.error.set('Erreur de connexion');
      console.error('[WebSocket] Connection failed');

      // Schedule reconnect on error
      if (!this.isManualDisconnect) {
        this.scheduleReconnect();
      }
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

      case 'game:restarted':
        console.log('[WS] Received game:restarted event - returning to lobby', {
          roomStatus: message.data.room?.status,
          playerCount: message.data.players?.length
        });
        // Update room and players stores
        this.room.set(message.data.room);
        this.players.set(message.data.players);
        // Emit event for UI to handle
        this.events.gameRestarted = message.data;
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

  restartGame() {
    this.send({ type: 'game:restart' });
  }

  // ========================================================================
  // Reconnection
  // ========================================================================

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect() {
    // Don't reconnect if manually disconnected or max attempts reached
    if (this.isManualDisconnect) {
      console.log('[WebSocket] Manual disconnect - not reconnecting');
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WebSocket] Max reconnection attempts reached');
      this.error.set('Impossible de se reconnecter. Rafraîchis la page.');
      this.reconnecting.set(false);
      return;
    }

    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    this.reconnecting.set(true);

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 16000);
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimeout = window.setTimeout(() => {
      console.log(`[WebSocket] Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      this.connect();
    }, delay);
  }

  // ========================================================================
  // Cleanup
  // ========================================================================

  disconnect() {
    this.isManualDisconnect = true;

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.reconnecting.set(false);

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
