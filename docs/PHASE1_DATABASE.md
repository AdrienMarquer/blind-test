# Blind Test - Database Schema & Data Models

## 📊 Data Architecture Strategy

### Phase 1: In-Memory Storage
- Store all data in TypeScript Maps
- Fast development iteration
- No persistence (data lost on restart)
- Suitable for MVP testing

### Phase 2: SQLite Persistence
- Migrate to SQLite database
- Persistent playlists and music library
- Optional game history
- Easy backup and migration

## 🗂 TypeScript Data Models

### Core Entities

#### Room
```typescript
interface Room {
  id: string;                          // Unique room identifier
  name: string;                        // Display name
  code: string;                        // 6-character join code
  qrCode: string;                      // Data URL for QR code
  masterIp: string;                    // Master device IP
  status: RoomStatus;                  // Current room state
  createdAt: Date;                     // Creation timestamp
  updatedAt: Date;                     // Last update
  maxPlayers: number;                  // Player limit (default: 8)

  // Relations
  players: Player[];                   // Connected players
  session?: GameSession;               // Active game session
  config: GameConfig;                  // Game configuration
}

type RoomStatus = 'lobby' | 'playing' | 'between_rounds' | 'finished';
```

#### Player
```typescript
interface Player {
  id: string;                          // Unique player ID
  roomId: string;                      // Parent room
  name: string;                        // Display name
  role: PlayerRole;                    // Player or Master
  connected: boolean;                  // Connection status
  joinedAt: Date;                      // Join timestamp

  // Game state
  score: number;                       // Total score across all rounds
  roundScore: number;                  // Score for current round
  isActive: boolean;                   // Currently answering
  isLockedOut: boolean;                // Locked out of current song

  // Statistics
  stats: PlayerStats;
}

type PlayerRole = 'master' | 'player';

interface PlayerStats {
  totalAnswers: number;                // Total submissions
  correctAnswers: number;              // Correct submissions
  wrongAnswers: number;                // Wrong submissions
  buzzCount: number;                   // Times buzzed
  averageAnswerTime: number;           // Avg time in ms
}
```

#### GameSession
```typescript
interface GameSession {
  id: string;                          // Unique session ID
  roomId: string;                      // Parent room
  startedAt: Date;                     // Start time
  endedAt?: Date;                      // End time

  // Configuration
  config: GameConfig;                  // Game settings

  // State
  currentRoundIndex: number;           // Index in rounds array
  currentSongIndex: number;            // Index in current playlist
  status: GameStatus;                  // Current state

  // Rounds
  rounds: Round[];                     // All rounds in session

  // Results
  finalScores?: FinalScore[];          // Computed at end
}

type GameStatus = 'waiting' | 'playing' | 'paused' | 'finished';

interface GameConfig {
  numRounds: number;                   // Total rounds
  playlistId: string;                  // Selected playlist
  shuffleSongs: boolean;               // Randomize song order
  allowRejoin: boolean;                // Rejoin if disconnected

  // Default parameters (can be overridden per round)
  defaultParams: ModeParams;
}
```

#### Round
```typescript
interface Round {
  id: string;                          // Unique round ID
  sessionId: string;                   // Parent session
  index: number;                       // Round number (0-based)
  modeType: ModeType;                  // Which mode to use
  playlistId: string;                  // Playlist for this round

  // Configuration
  params: ModeParams;                  // Mode-specific parameters

  // State
  status: RoundStatus;                 // Current status
  startedAt?: Date;                    // Start time
  endedAt?: Date;                      // End time

  // Songs
  songs: RoundSong[];                  // Songs in this round
  currentSongIndex: number;            // Current song

  // Scores
  scores: Map<string, number>;         // playerId → round score
}

type RoundStatus = 'pending' | 'active' | 'finished';
type ModeType = 'buzz_and_choice' | 'fast_buzz' | 'text_input' | 'picture_round';
```

#### Mode
```typescript
interface Mode {
  type: ModeType;                      // Mode identifier
  name: string;                        // Display name
  description: string;                 // Description
  defaultParams: ModeParams;           // Default parameters

  // Mode behavior (defined in code, not database)
  // execute: (round: Round, song: Song) => Promise<void>;
  // validateAnswer: (answer: Answer) => boolean;
  // calculateScore: (answer: Answer) => number;
}

interface ModeParams {
  // Universal parameters
  songDuration?: number;               // Seconds (default: 15)
  answerTimer?: number;                // Seconds (default: 5)

  // Buzz + Choice specific
  numChoices?: number;                 // Options (default: 4)
  pointsTitle?: number;                // Points for title (default: 1)
  pointsArtist?: number;               // Points for artist (default: 1)
  penaltyEnabled?: boolean;            // Enable penalties (default: false)
  penaltyAmount?: number;              // Penalty points (default: 0)
  allowRebuzz?: boolean;               // Rebuzz after wrong (default: true)

  // Fast Buzz specific
  manualValidation?: boolean;          // Master validates (default: true)

  // Text Input specific
  fuzzyMatch?: boolean;                // Allow typos (default: true)
  levenshteinDistance?: number;        // Max edit distance (default: 2)
}
```

#### Song
```typescript
interface Song {
  id: string;                          // Unique song ID
  filePath: string;                    // Path to MP3 file
  fileName: string;                    // Original filename

  // Metadata (from ID3 tags)
  title: string;                       // Track title
  artist: string;                      // Artist name
  album?: string;                      // Album name
  year?: number;                       // Release year
  genre?: string;                      // Genre
  duration: number;                    // Length in seconds

  // Playback
  clipStart: number;                   // Start time (default: 30)
  clipDuration: number;                // Clip length (default: 15)

  // Metadata
  createdAt: Date;                     // Upload time
  fileSize: number;                    // Bytes
  format: string;                      // 'mp3' | 'm4a' | 'wav' | 'flac'
}
```

#### Playlist
```typescript
interface Playlist {
  id: string;                          // Unique playlist ID
  name: string;                        // Display name
  description?: string;                // Optional description
  songIds: string[];                   // Ordered song IDs

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  songCount: number;                   // Cached count
  totalDuration: number;               // Cached duration
}
```

#### RoundSong
```typescript
interface RoundSong {
  songId: string;                      // Reference to Song
  song: Song;                          // Populated song data
  index: number;                       // Song number in round
  status: SongStatus;                  // Current status

  // State
  startedAt?: Date;                    // When song started
  endedAt?: Date;                      // When song ended
  activePlayerId?: string;             // Current answering player
  lockedOutPlayerIds: string[];        // Players locked out

  // Answers
  answers: Answer[];                   // All submitted answers

  // Generated choices (for multiple choice modes)
  titleChoices?: string[];             // 4 title options
  artistChoices?: string[];            // 4 artist options
}

type SongStatus = 'pending' | 'playing' | 'answering' | 'finished';
```

#### Answer
```typescript
interface Answer {
  id: string;                          // Unique answer ID
  playerId: string;                    // Who answered
  roundId: string;                     // Which round
  songId: string;                      // Which song

  // Answer data
  type: AnswerType;                    // What was answered
  value: string;                       // Selected/typed answer
  submittedAt: Date;                   // Timestamp
  timeToAnswer: number;                // Milliseconds from buzz

  // Validation
  isCorrect: boolean;                  // Validation result
  pointsAwarded: number;               // Points earned
}

type AnswerType = 'title' | 'artist' | 'both';
```

#### FinalScore
```typescript
interface FinalScore {
  playerId: string;                    // Player reference
  playerName: string;                  // Cached name
  totalScore: number;                  // Final score

  // Round breakdown
  roundScores: number[];               // Score per round

  // Tiebreaker stats
  correctAnswers: number;
  wrongAnswers: number;
  averageAnswerTime: number;

  // Rank
  rank: number;                        // Final position
}
```

## 🗄 SQLite Schema

### Table Definitions

#### rooms
```sql
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  qr_code TEXT NOT NULL,
  master_ip TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('lobby', 'playing', 'between_rounds', 'finished')),
  max_players INTEGER NOT NULL DEFAULT 8,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_rooms_code ON rooms(code);
CREATE INDEX idx_rooms_status ON rooms(status);
```

#### players
```sql
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('master', 'player')),
  connected INTEGER NOT NULL DEFAULT 1,
  joined_at INTEGER NOT NULL,

  -- Game state
  score INTEGER NOT NULL DEFAULT 0,
  round_score INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 0,
  is_locked_out INTEGER NOT NULL DEFAULT 0,

  -- Statistics
  total_answers INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  wrong_answers INTEGER NOT NULL DEFAULT 0,
  buzz_count INTEGER NOT NULL DEFAULT 0,
  average_answer_time REAL NOT NULL DEFAULT 0,

  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE INDEX idx_players_room ON players(room_id);
CREATE UNIQUE INDEX idx_players_room_name ON players(room_id, name);
```

#### game_sessions
```sql
CREATE TABLE game_sessions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL UNIQUE,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,

  -- Configuration (JSON)
  config TEXT NOT NULL,  -- Stored as JSON

  -- State
  current_round_index INTEGER NOT NULL DEFAULT 0,
  current_song_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('waiting', 'playing', 'paused', 'finished')),

  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_room ON game_sessions(room_id);
```

#### rounds
```sql
CREATE TABLE rounds (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  round_index INTEGER NOT NULL,
  mode_type TEXT NOT NULL,
  playlist_id TEXT NOT NULL,

  -- Configuration (JSON)
  params TEXT NOT NULL,  -- Stored as JSON (ModeParams)

  -- State
  status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'finished')),
  started_at INTEGER,
  ended_at INTEGER,
  current_song_index INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id)
);

CREATE INDEX idx_rounds_session ON rounds(session_id);
CREATE UNIQUE INDEX idx_rounds_session_index ON rounds(session_id, round_index);
```

#### songs
```sql
CREATE TABLE songs (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,

  -- Metadata
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  year INTEGER,
  genre TEXT,
  duration INTEGER NOT NULL,  -- Seconds

  -- Playback
  clip_start INTEGER NOT NULL DEFAULT 30,  -- Seconds
  clip_duration INTEGER NOT NULL DEFAULT 15,  -- Seconds

  -- File info
  created_at INTEGER NOT NULL,
  file_size INTEGER NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('mp3', 'm4a', 'wav', 'flac'))
);

CREATE INDEX idx_songs_artist ON songs(artist);
CREATE INDEX idx_songs_title ON songs(title);
CREATE INDEX idx_songs_genre ON songs(genre);
```

#### playlists
```sql
CREATE TABLE playlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,

  -- Metadata
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  song_count INTEGER NOT NULL DEFAULT 0,
  total_duration INTEGER NOT NULL DEFAULT 0  -- Seconds
);

CREATE INDEX idx_playlists_name ON playlists(name);
```

#### playlist_songs
```sql
CREATE TABLE playlist_songs (
  playlist_id TEXT NOT NULL,
  song_id TEXT NOT NULL,
  position INTEGER NOT NULL,  -- Order in playlist

  PRIMARY KEY (playlist_id, song_id),
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

CREATE INDEX idx_playlist_songs_playlist ON playlist_songs(playlist_id, position);
```

#### answers
```sql
CREATE TABLE answers (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  song_id TEXT NOT NULL,

  -- Answer data
  type TEXT NOT NULL CHECK(type IN ('title', 'artist', 'both')),
  value TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  time_to_answer INTEGER NOT NULL,  -- Milliseconds

  -- Validation
  is_correct INTEGER NOT NULL,
  points_awarded INTEGER NOT NULL,

  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id)
);

CREATE INDEX idx_answers_player ON answers(player_id);
CREATE INDEX idx_answers_round ON answers(round_id);
CREATE INDEX idx_answers_song ON answers(song_id);
```

#### round_scores
```sql
CREATE TABLE round_scores (
  round_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,

  PRIMARY KEY (round_id, player_id),
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE INDEX idx_round_scores_round ON round_scores(round_id);
```

## 🔄 Parameter Inheritance Implementation

### Resolution Order
```typescript
function resolveParam<T>(
  paramName: keyof ModeParams,
  round: Round,
  game: GameSession,
  mode: Mode
): T {
  // 1. Round-level override (highest priority)
  if (round.params[paramName] !== undefined) {
    return round.params[paramName] as T;
  }

  // 2. Game-level default
  if (game.config.defaultParams[paramName] !== undefined) {
    return game.config.defaultParams[paramName] as T;
  }

  // 3. Mode-level default
  if (mode.defaultParams[paramName] !== undefined) {
    return mode.defaultParams[paramName] as T;
  }

  // 4. System-level fallback
  return SYSTEM_DEFAULTS[paramName] as T;
}
```

### System Defaults
```typescript
const SYSTEM_DEFAULTS: ModeParams = {
  songDuration: 30,
  answerTimer: 5,
  numChoices: 4,
  pointsTitle: 1,
  pointsArtist: 1,
  penaltyEnabled: false,
  penaltyAmount: 0,
  allowRebuzz: true,
  manualValidation: false,
  fuzzyMatch: true,
  levenshteinDistance: 2,
};
```

## 💾 Data Access Layer

### Repository Pattern
```typescript
interface Repository<T> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

// Example: RoomRepository
class RoomRepository implements Repository<Room> {
  // In-memory implementation
  private rooms = new Map<string, Room>();

  async findById(id: string): Promise<Room | null> {
    return this.rooms.get(id) || null;
  }

  async findAll(): Promise<Room[]> {
    return Array.from(this.rooms.values());
  }

  async create(data: Partial<Room>): Promise<Room> {
    const room: Room = {
      id: generateId(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Room;

    this.rooms.set(room.id, room);
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
    this.rooms.delete(id);
  }
}
```

## 🔍 Query Examples

### Find room with all players
```typescript
const room = await roomRepository.findById(roomId);
const players = await playerRepository.findByRoom(roomId);
room.players = players;
```

### Get current game state
```typescript
const session = await sessionRepository.findByRoom(roomId);
const currentRound = await roundRepository.findById(
  session.rounds[session.currentRoundIndex]
);
const currentSong = currentRound.songs[currentRound.currentSongIndex];
```

### Calculate final scores
```typescript
const players = await playerRepository.findByRoom(roomId);
const finalScores = players
  .map(player => ({
    playerId: player.id,
    playerName: player.name,
    totalScore: player.score,
    correctAnswers: player.stats.correctAnswers,
    wrongAnswers: player.stats.wrongAnswers,
    averageAnswerTime: player.stats.averageAnswerTime,
  }))
  .sort((a, b) => {
    // Primary: score
    if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
    // Tiebreaker 1: correct answers
    if (a.correctAnswers !== b.correctAnswers) return b.correctAnswers - a.correctAnswers;
    // Tiebreaker 2: fewer wrong answers
    if (a.wrongAnswers !== b.wrongAnswers) return a.wrongAnswers - b.wrongAnswers;
    // Tiebreaker 3: faster answers
    return a.averageAnswerTime - b.averageAnswerTime;
  })
  .map((score, index) => ({ ...score, rank: index + 1 }));
```

---

**Last Updated**: 2024-11-09
**Version**: 1.0
