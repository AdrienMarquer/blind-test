/**
 * Blind Test - Shared Type Definitions
 * Based on DATABASE.md specification
 */

// ============================================================================
// Type Aliases
// ============================================================================

export type RoomStatus = 'lobby' | 'playing' | 'between_rounds' | 'finished';
export type PlayerRole = 'master' | 'player';
export type GameStatus = 'waiting' | 'playing' | 'paused' | 'finished';
export type RoundStatus = 'pending' | 'active' | 'finished';

// Game Mechanics - HOW players interact
export type ModeType = 'buzz_and_choice' | 'fast_buzz' | 'text_input' | 'timed_answer';

// Media Type - WHAT content is shown
export type MediaType = 'music' | 'picture' | 'video' | 'text_question';

export type SongStatus = 'pending' | 'playing' | 'answering' | 'finished';
export type AnswerType = 'title' | 'artist' | 'both';

// ============================================================================
// Core Entities
// ============================================================================

export interface Room {
  id: string;
  name: string;
  code: string;              // 4-character join code (uppercase alphanumeric)
  qrCode: string;            // Data URL for QR code
  masterIp: string;          // Master device IP
  status: RoomStatus;
  createdAt: Date;
  updatedAt: Date;
  maxPlayers: number;        // Default: 8

  // Relations
  players: Player[];
  session?: GameSession;
}

export interface Player {
  id: string;
  roomId: string;
  name: string;
  role: PlayerRole;
  connected: boolean;
  joinedAt: Date;

  // Game state
  score: number;             // Total score across all rounds
  roundScore: number;        // Score for current round
  isActive: boolean;         // Currently answering
  isLockedOut: boolean;      // Locked out of current song

  // Statistics
  stats: PlayerStats;
}

export interface PlayerStats {
  totalAnswers: number;
  correctAnswers: number;
  wrongAnswers: number;
  buzzCount: number;
  averageAnswerTime: number; // Milliseconds
}

export interface GameSession {
  id: string;
  roomId: string;
  startedAt: Date;
  endedAt?: Date;

  // State
  currentRoundIndex: number;
  currentSongIndex: number;
  status: GameStatus;

  // Rounds
  rounds: Round[];

  // Results
  finalScores?: FinalScore[];
}

export interface Round {
  id: string;
  sessionId: string;
  index: number;             // Round number (0-based)
  modeType: ModeType;        // Game mechanic (HOW to play)
  mediaType: MediaType;      // Content type (WHAT to show)
  playlistId?: string;       // Optional - legacy support

  // Metadata-based song filtering (replaces playlists)
  songFilters?: {
    genre?: string | string[]; // Filter by genre (single or multiple)
    yearMin?: number;        // Minimum year (inclusive)
    yearMax?: number;        // Maximum year (inclusive)
    artistName?: string;     // Filter by artist name (partial match)
    songCount?: number;      // Number of songs to select (random if more available)
  };

  // Configuration (simplified - no game-level config)
  params: ModeParams;

  // State
  status: RoundStatus;
  startedAt?: Date;
  endedAt?: Date;

  // Songs
  songs: RoundSong[];
  currentSongIndex: number;

  // Scores
  scores: Map<string, number>; // playerId → round score
}

export interface Mode {
  type: ModeType;
  name: string;
  description: string;
  defaultParams: ModeParams;
}

export interface ModeParams {
  // Universal parameters
  songDuration?: number;        // Seconds (default: 15)
  answerTimer?: number;         // Seconds (default: 5)
  audioPlayback?: 'master' | 'players' | 'all'; // Where audio plays (default: 'master')

  // Buzz + Choice specific
  numChoices?: number;          // Options (default: 4)
  pointsTitle?: number;         // Points for title (default: 1)
  pointsArtist?: number;        // Points for artist (default: 1)
  penaltyEnabled?: boolean;     // Enable penalties (default: false)
  penaltyAmount?: number;       // Penalty points (default: 0)
  allowRebuzz?: boolean;        // Rebuzz after wrong (default: false)

  // Fast Buzz specific
  manualValidation?: boolean;   // Master validates (default: true)

  // Text Input specific
  fuzzyMatch?: boolean;         // Allow typos (default: true)
  levenshteinDistance?: number; // Max edit distance (default: 2)
}

export interface Song {
  id: string;
  filePath: string;
  fileName: string;

  // Metadata (from ID3 tags)
  title: string;
  artist: string;
  album?: string;
  year: number;                // Mandatory - Release year
  genre?: string;
  duration: number;            // Full track length in seconds

  // Playback configuration
  clipStart: number;           // Start time in seconds (default: 30)
  // Note: Clip duration comes from ModeParams.songDuration, not stored here

  // File info
  createdAt: Date;
  fileSize: number;            // Bytes
  format: string;              // 'mp3' | 'm4a' | 'wav' | 'flac'
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  songIds: string[];           // Ordered song IDs

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  songCount: number;           // Cached count
  totalDuration: number;       // Cached duration in seconds
}

export interface RoundSong {
  songId: string;
  song: Song;                  // Populated song data (or picture/video data)
  index: number;               // Song number in round
  status: SongStatus;          // Note: mediaType inherited from parent Round

  // State
  startedAt?: Date;
  endedAt?: Date;
  activePlayerId?: string;     // Current answering player
  lockedOutPlayerIds: string[];

  // Answers
  answers: Answer[];

  // Generated choices (for multiple choice modes)
  titleChoices?: string[];     // 4 title options (1 correct, 3 random)
  artistChoices?: string[];    // 4 artist options (1 correct, 3 random)
}

export interface Answer {
  id: string;
  playerId: string;
  roundId: string;
  songId: string;

  // Answer data
  type: AnswerType;
  value: string;               // Selected/typed answer
  submittedAt: Date;
  timeToAnswer: number;        // Milliseconds from buzz

  // Validation
  isCorrect: boolean;
  pointsAwarded: number;
}

export interface FinalScore {
  playerId: string;
  playerName: string;
  totalScore: number;

  // Round breakdown
  roundScores: number[];

  // Tiebreaker stats
  correctAnswers: number;
  wrongAnswers: number;
  averageAnswerTime: number;

  // Rank
  rank: number;
}

// ============================================================================
// System Defaults
// ============================================================================

export const SYSTEM_DEFAULTS: Required<ModeParams> = {
  songDuration: 30,
  answerTimer: 5,
  audioPlayback: 'master',     // Only master device plays audio by default
  numChoices: 4,
  pointsTitle: 1,
  pointsArtist: 1,
  penaltyEnabled: false,
  penaltyAmount: 0,
  allowRebuzz: false,          // Disabled by default
  manualValidation: false,
  fuzzyMatch: true,
  levenshteinDistance: 2,
};

// ============================================================================
// Repository Interface
// ============================================================================

export interface Repository<T> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

// ============================================================================
// WebSocket Messages - Type-Safe Event System
// ============================================================================

/**
 * Server → Client Messages
 */
export type ServerMessage =
  // Connection
  | { type: 'connected'; data: { roomId: string } }
  | { type: 'state:synced'; data: { room: Room; players: Player[] } }
  | { type: 'error'; data: { code?: string; message: string } }

  // Player Events
  | { type: 'player:joined'; data: { room: Room; player: Player } }
  | { type: 'player:left'; data: { playerId: string; playerName: string; remainingPlayers: number } }
  | { type: 'player:kicked'; data: { reason: string } }
  | { type: 'player:disconnected'; data: { playerId: string; playerName: string; canRejoin: boolean } }
  | { type: 'player:reconnected'; data: { playerId: string; playerName: string } }

  // Game Flow
  | { type: 'game:started'; data: { room: Room } }
  | { type: 'round:started'; data: { roundIndex: number; songCount: number; modeType: ModeType } }
  | { type: 'round:ended'; data: { roundIndex: number; scores: Record<string, number> } }

  // Song Events
  | { type: 'song:started'; data: { songIndex: number; duration: number; audioUrl: string; clipStart: number; audioPlayback: 'master' | 'players' | 'all' } }
  | { type: 'song:ended'; data: { songIndex: number; correctTitle: string; correctArtist: string } }

  // Gameplay
  | { type: 'player:buzzed'; data: { playerId: string; playerName: string; titleChoices?: string[] } }
  | { type: 'buzz:rejected'; data: { playerId: string; reason: string } }
  | { type: 'answer:result'; data: {
      playerId: string;
      isCorrect: boolean;
      pointsAwarded: number;
      shouldShowArtistChoices?: boolean;
      lockOutPlayer?: boolean;
    } }
  | { type: 'choices:artist'; data: { playerId: string; artistChoices: string[] } }

  // Master Controls
  | { type: 'game:paused'; data: { timestamp: number } }
  | { type: 'game:resumed'; data: { timestamp: number } }
  | { type: 'game:skipped'; data: { timestamp: number } };

/**
 * Client → Server Messages
 */
export type ClientMessage =
  // Connection
  | { type: 'state:sync' }

  // Player Actions
  | { type: 'player:join'; data: { name: string } }
  | { type: 'player:leave' }
  | { type: 'player:kick'; data: { playerId: string } }

  // Gameplay
  | { type: 'player:buzz'; data: { songIndex: number } }
  | { type: 'player:answer'; data: { songIndex: number; answerType: 'title' | 'artist'; value: string } }

  // Master Controls
  | { type: 'game:pause' }
  | { type: 'game:resume' }
  | { type: 'game:skip' };

/**
 * Extract data type for a specific message type
 */
export type ExtractMessageData<T extends ServerMessage['type']> =
  Extract<ServerMessage, { type: T }>['data'];
