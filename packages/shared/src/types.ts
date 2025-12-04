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

// Music Genres - Canonical list for normalization across providers
export const CANONICAL_GENRES = [
  'Rock', 'Metal', 'Punk', 'Alternative', 'Indie',
  'Pop', 'K-Pop', 'Chanson',
  'Hip-Hop/Rap', 'R&B', 'Soul', 'Funk',
  'Electronic', 'House', 'Techno', 'Trance', 'Drum & Bass', 'Dubstep', 'Ambient',
  'Jazz', 'Blues', 'Country', 'Folk', 'Classical', 'Latin', 'Reggae', 'Reggaeton', 'Afrobeat',
] as const;

export type CanonicalGenre = typeof CANONICAL_GENRES[number];

// Game Mechanics - HOW players interact
export type ModeType = 'buzz_and_choice' | 'fast_buzz';

// Media Type - WHAT content is shown
export type MediaType = 'music' | 'picture' | 'video' | 'text_question';

export type SongStatus = 'pending' | 'playing' | 'answering' | 'finished';
export type AnswerType = 'title' | 'artist';

// ============================================================================
// Core Entities
// ============================================================================

export interface Room {
  id: string;
  name: string;
  code: string;              // 4-character join code (uppercase alphanumeric)
  qrCode: string;            // Data URL for QR code
  masterIp: string;          // Master device IP
  masterPlayerId?: string;   // Player ID when master is also playing
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
  token?: string;            // Session token (only returned when authenticated)

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
    songIds?: string[];      // Explicit song IDs to use (takes precedence)
    includeNiche?: boolean;  // Include niche songs (default: false)
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
  songDuration?: number;        // Seconds (default: 30)
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

  // Metadata (from ID3 tags or Spotify)
  title: string;
  artist: string;
  album?: string;
  year: number;                // Mandatory - Release year
  genre?: string;
  duration: number;            // Full track length in seconds

  // Enhanced metadata for answer generation
  language?: string;           // ISO 639-1 code (e.g., 'en', 'fr', 'es')
  niche: boolean;              // Is this a niche/obscure song? (default: false)

  // Source tracking
  spotifyId?: string;          // Spotify track ID
  youtubeId?: string;          // YouTube video ID
  albumArt?: string;           // Album cover URL (from Spotify)
  source: string;              // 'upload' | 'spotify-youtube' | 'manual'

  // Playback configuration
  clipStart: number;           // Start time in seconds (default: 30)
  clipDuration: number;        // Stored clip length in seconds (default: 45)
  // Note: Actual playback duration during game comes from ModeParams.songDuration

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

/**
 * Universal answer choice structure - works for ALL media types
 * Future-proof design for music, images, video, text questions
 */
export interface AnswerChoice {
  id: string;                     // Unique identifier for this choice
  correct: boolean;               // Is this the correct answer?
  displayText: string;            // What to show the user (always present)

  // Content fields (optional - depends on media type)
  // For music: displayText is the title or artist name (simple text)
  // For images: displayText is the caption, imageUrl contains the image
  // For video: displayText is the caption, videoUrl contains the video
  // For text questions: displayText is the answer text
  imageUrl?: string;              // Image URL (for picture rounds)
  videoUrl?: string;              // Video URL (for video rounds)

  // Optional enrichment metadata
  metadata?: {
    year?: number;
    genre?: string;
    album?: string;
    artist?: string;              // Can be stored here for reference
    [key: string]: any;           // Extensible
  };
}

/**
 * Question structure for different media types
 * Supports: music (title/artist split), images, video, text questions
 */
export interface MediaQuestion {
  type: MediaType;                // 'music' | 'picture' | 'video' | 'text_question'

  // For title/artist split questions (music only)
  phase?: 'title' | 'artist';

  // The choices to present (always 4 choices)
  choices: AnswerChoice[];

  // Optional question text (for text_question type)
  questionText?: string;

  // Optional media URL (for picture/video types)
  mediaUrl?: string;
}

export interface RoundSong {
  songId: string;
  song: Song;                  // Populated song data (or picture/video data)
  index: number;               // Song number in round
  status: SongStatus;          // Note: mediaType inherited from parent Round
  params?: ModeParams;         // Effective params applied to this song (defaults overridden per-round)

  // State
  startedAt?: Date;
  endedAt?: Date;
  activePlayerId?: string;     // Current answering player
  lockedOutPlayerIds: string[];
  buzzTimestamps?: Map<string, number>; // playerId → timestamp (for race condition resolution)

  // Answers
  answers: Answer[];

  // Question structure (supports all media types)
  titleQuestion?: MediaQuestion;   // Title question with choices (music)
  artistQuestion?: MediaQuestion;  // Artist question with choices (music)
  question?: MediaQuestion;        // Generic question (images, video, text)
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

// Round Configuration (for creating multi-round games)
export interface RoundConfig {
  modeType: ModeType;
  mediaType: MediaType;
  songFilters?: {
    genre?: string | string[];
    yearMin?: number;
    yearMax?: number;
    artistName?: string;
    songCount?: number;
    songIds?: string[];
    includeNiche?: boolean;  // Include niche songs (default: false)
  };
  params?: ModeParams;
}

// ============================================================================
// System Defaults
// ============================================================================

export const DEFAULT_SONG_DURATION = 30;

export const SYSTEM_DEFAULTS: Required<ModeParams> = {
  songDuration: DEFAULT_SONG_DURATION,
  answerTimer: 6,
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
  | { type: 'state:synced'; data: { room: Room; players: Player[]; masterPlaying?: { playing: boolean; playerName: string | null } } }
  | { type: 'error'; data: { code?: string; message: string } }

  // Player Events
  | { type: 'player:joined'; data: { room: Room; player: Player } }
  | { type: 'player:left'; data: { playerId: string; playerName: string; remainingPlayers: number } }
  | { type: 'player:kicked'; data: { reason: string } }
  | { type: 'player:disconnected'; data: { playerId: string; playerName: string; canRejoin: boolean } }
  | { type: 'player:reconnected'; data: { playerId: string; playerName: string } }

  // Master Playing Status (for lobby preview)
  | { type: 'master:playing'; data: { playing: boolean; playerName: string | null } }

  // Game Flow
  | { type: 'game:started'; data: { room: Room; session: GameSession | null; players?: Player[] } }
  | { type: 'round:started'; data: { room: Room | null; roundIndex: number; songCount: number; modeType: ModeType; mediaType: MediaType } }
  | { type: 'round:ended'; data: { roundIndex: number; scores: Array<{ playerId: string; playerName: string; score: number; rank: number }> } }
  | { type: 'round:between'; data: {
      room: Room;
      completedRoundIndex: number;
      nextRoundIndex: number;
      nextRoundMode: ModeType;
      nextRoundMedia: MediaType;
      scores: Array<{ playerId: string; playerName: string; score: number; rank: number; averageAnswerTime?: number }>;
    } }
  | { type: 'game:ended'; data: { finalScores: FinalScore[] } }
  | { type: 'game:restarted'; data: { room: Room; players: Player[] } }

  // Song Events
  | { type: 'song:preparing'; data: {
      songIndex: number;
      genre?: string;
      year?: number;
      countdown: number; // Duration of countdown in seconds (6 seconds)
    } }
  | { type: 'song:started'; data: {
      songIndex: number;
      duration: number;
      audioUrl: string;
      clipStart: number;
      audioPlayback: 'master' | 'players' | 'all';
      answerTimer?: number;
      answerChoices?: Array<{ title: string; artist: string; correct: boolean }>;
      // For master only - players should ignore these fields
      songTitle?: string;
      songArtist?: string;
      albumArt?: string;
    } }
  | { type: 'song:ended'; data: {
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
    } }

  // Gameplay
  | { type: 'player:buzzed'; data: { playerId: string; playerName: string; songIndex: number; modeType: ModeType; manualValidation?: boolean; artistQuestion?: MediaQuestion; titleQuestion?: MediaQuestion; answerTimer?: number } }
  | { type: 'buzz:rejected'; data: { playerId: string; reason: string } }
  | { type: 'answer:result'; data: {
      playerId: string;
      playerName: string;
      answerType: 'title' | 'artist';
      isCorrect: boolean;
      pointsAwarded: number;
      shouldShowTitleChoices?: boolean;
      lockOutPlayer?: boolean;
      message?: string;
    } }
  | { type: 'choices:title'; data: { playerId: string; titleQuestion: MediaQuestion; answerTimer?: number } }

  // Master Controls
  | { type: 'game:paused'; data: { timestamp: number } }
  | { type: 'game:resumed'; data: { timestamp: number; reason?: string } }

  // Timers
  | { type: 'timer:song'; data: { timeRemaining: number } }
  | { type: 'timer:answer'; data: { playerId: string; timeRemaining: number } }

  // Score Updates
  | { type: 'score:updated'; data: { playerId: string; playerName: string; score: number; pointsAwarded: number } }

  // Import Job Events
  | { type: 'job:progress'; data: { jobId: string; type: string; status: string; progress: number; currentItem?: number; totalItems?: number } }
  | { type: 'job:completed'; data: { jobId: string; type: string; metadata: any } }
  | { type: 'job:failed'; data: { jobId: string; type: string; error: string } };

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
  | { type: 'game:restart' };

/**
 * Extract data type for a specific message type
 */
export type ExtractMessageData<T extends ServerMessage['type']> =
  Extract<ServerMessage, { type: T }>['data'];
