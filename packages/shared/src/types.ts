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
export type ModeType = 'buzz_and_choice' | 'fast_buzz' | 'text_input' | 'picture_round';
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
  modeType: ModeType;
  playlistId: string;

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
  year?: number;
  genre?: string;
  duration: number;            // Seconds

  // Playback
  clipStart: number;           // Default: 30
  clipDuration: number;        // Default: 15

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
  song: Song;                  // Populated song data
  index: number;               // Song number in round
  status: SongStatus;

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
