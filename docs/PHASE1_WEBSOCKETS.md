# Blind Test - WebSocket Events Specification

## 🔌 WebSocket Overview

**Protocol**: Socket.io v4.x

**Connection URL**: `ws://localhost:3007`

**Namespaces**: Room-specific namespaces for isolation
- `/rooms/:roomId` - All events for a specific room

## 🔗 Connection Lifecycle

### Client Connection
```typescript
import { io } from 'socket.io-client';

const socket = io(`http://localhost:3007/rooms/${roomId}`, {
  auth: {
    playerId: string;
    playerName: string;
    role: 'master' | 'player';
  },
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});
```

### Connection Events

#### `connect`
Emitted when client successfully connects.

**Client receives**:
```typescript
socket.on('connect', () => {
  console.log('Connected:', socket.id);
});
```

---

#### `disconnect`
Emitted when client disconnects.

**Client receives**:
```typescript
socket.on('disconnect', (reason: string) => {
  console.log('Disconnected:', reason);
});
```

---

#### `connection_error`
Emitted when connection fails.

**Client receives**:
```typescript
socket.on('connection_error', (error: Error) => {
  console.error('Connection error:', error.message);
});
```

---

## 👥 Room & Player Events

### `player:join`
Player requests to join the room.

**Client emits**:
```typescript
socket.emit('player:join', {
  name: string;
});
```

**Server responds** (to sender):
```typescript
socket.emit('player:joined', {
  player: Player;
  room: Room;
});
```

**Server broadcasts** (to all others in room):
```typescript
socket.broadcast.emit('player:joined', {
  player: Player;
  room: Room;
});
```

---

### `player:leave`
Player voluntarily leaves the room.

**Client emits**:
```typescript
socket.emit('player:leave');
```

**Server broadcasts** (to all in room):
```typescript
socket.broadcast.emit('player:left', {
  playerId: string;
  playerName: string;
  remainingPlayers: number;
});
```

---

### `player:kicked`
Master kicks a player from the room.

**Client emits** (master only):
```typescript
socket.emit('player:kick', {
  playerId: string;
});
```

**Server sends** (to kicked player):
```typescript
socket.to(kickedPlayerId).emit('player:kicked', {
  reason: 'Removed by host';
});
```

**Server broadcasts** (to all others):
```typescript
socket.broadcast.emit('player:left', {
  playerId: string;
  playerName: string;
  remainingPlayers: number;
});
```

---

### `player:disconnected`
Player loses connection.

**Server broadcasts** (to all in room):
```typescript
socket.broadcast.emit('player:disconnected', {
  playerId: string;
  playerName: string;
  canRejoin: boolean;  // Based on game config
});
```

---

### `player:reconnected`
Player reconnects after disconnect.

**Server broadcasts** (to all in room):
```typescript
socket.broadcast.emit('player:reconnected', {
  playerId: string;
  playerName: string;
});
```

---

## 🎮 Game Control Events

### `game:start`
Master starts the game session.

**Client emits** (master only):
```typescript
socket.emit('game:start', {
  config?: GameConfig;
});
```

**Server broadcasts** (to all):
```typescript
socket.emit('game:started', {
  sessionId: string;
  config: GameConfig;
  rounds: Round[];
  players: Player[];
});
```

---

### `game:pause`
Master pauses the game.

**Client emits** (master only):
```typescript
socket.emit('game:pause');
```

**Server broadcasts** (to all):
```typescript
socket.emit('game:paused', {
  pausedAt: string;  // ISO 8601
  timeRemaining: number;
});
```

---

### `game:resume`
Master resumes the game.

**Client emits** (master only):
```typescript
socket.emit('game:resume');
```

**Server broadcasts** (to all):
```typescript
socket.emit('game:resumed', {
  resumedAt: string;
});
```

---

### `game:end`
Master manually ends the game.

**Client emits** (master only):
```typescript
socket.emit('game:end');
```

**Server broadcasts** (to all):
```typescript
socket.emit('game:ended', {
  sessionId: string;
  endedAt: string;
  finalScores: FinalScore[];
  reason: 'manual' | 'completed';
});
```

---

## 🔄 Round Events

### `round:start`
Server starts a new round.

**Server broadcasts** (to all):
```typescript
socket.emit('round:started', {
  round: Round;
  roundIndex: number;
  totalRounds: number;
  mode: Mode;
  playlist: Playlist;
});
```

---

### `round:end`
Round completes.

**Server broadcasts** (to all):
```typescript
socket.emit('round:ended', {
  roundId: string;
  roundIndex: number;
  scores: Map<string, number>;  // playerId → round score
  nextRoundIndex?: number;
});
```

---

### `round:scoreboard`
Show scoreboard between rounds.

**Server broadcasts** (to all):
```typescript
socket.emit('round:scoreboard', {
  roundIndex: number;
  roundScores: Map<string, number>;
  overallScores: Map<string, number>;
  rankings: {
    playerId: string;
    playerName: string;
    roundScore: number;
    totalScore: number;
    rank: number;
  }[];
});
```

---

## 🎵 Song Events

### `song:start`
New song begins playing.

**Server broadcasts** (to all):
```typescript
socket.emit('song:started', {
  song: {
    id: string;
    index: number;  // Song number in round
    totalSongs: number;
    // Title and artist hidden until song ends
  };
  duration: number;  // Clip duration
  startedAt: string;  // ISO 8601
});
```

---

### `song:playing`
Song playback state update (sent periodically).

**Server broadcasts** (to all):
```typescript
socket.emit('song:playing', {
  songId: string;
  timeElapsed: number;
  timeRemaining: number;
  progress: number;  // 0-100
});
```

---

### `song:end`
Song finishes.

**Server broadcasts** (to all):
```typescript
socket.emit('song:ended', {
  songId: string;
  title: string;  // Revealed
  artist: string;  // Revealed
  correctPlayers: string[];  // Player IDs who got it right
  scores: Map<string, number>;  // Points awarded this song
  reason: 'correct_answer' | 'timer_expired' | 'all_locked_out' | 'skipped';
});
```

---

## 🎯 Buzz + Choice Mode Events

### `player:buzz`
Player presses the buzz button.

**Client emits**:
```typescript
socket.emit('player:buzz');
```

**Server responds** (to sender):
```typescript
// If first to buzz
socket.emit('buzz:accepted', {
  songId: string;
  titleChoices: string[];  // 4 options
  answerTimer: number;  // Seconds
});

// If not first
socket.emit('buzz:rejected', {
  reason: 'already_buzzed' | 'locked_out';
  activePlayerId: string;
});
```

**Server broadcasts** (to all others):
```typescript
socket.broadcast.emit('buzz:locked', {
  playerId: string;
  playerName: string;
  songId: string;
});
```

---

### `answer:submit`
Active player submits an answer.

**Client emits**:
```typescript
socket.emit('answer:submit', {
  type: 'title' | 'artist';
  value: string;  // Selected choice
  submittedAt: string;  // ISO 8601
});
```

**Server responds** (to sender):
```typescript
// Title correct
socket.emit('answer:correct', {
  type: 'title';
  pointsAwarded: number;
  artistChoices: string[];  // Next question
  answerTimer: number;
});

// Title wrong
socket.emit('answer:wrong', {
  type: 'title';
  correctAnswer: string;
  lockedOut: true;
});

// Artist correct
socket.emit('answer:correct', {
  type: 'artist';
  pointsAwarded: number;
  totalPoints: number;  // Title + Artist
});

// Artist wrong
socket.emit('answer:wrong', {
  type: 'artist';
  correctAnswer: string;
  lockedOut: true;
  keptPoints: number;  // From title
});
```

**Server broadcasts** (to all others):
```typescript
socket.broadcast.emit('answer:result', {
  playerId: string;
  playerName: string;
  type: 'title' | 'artist';
  isCorrect: boolean;
  pointsAwarded: number;
});
```

---

### `player:lockout`
Player is locked out of current song.

**Server broadcasts** (to all):
```typescript
socket.emit('player:lockedout', {
  playerId: string;
  playerName: string;
  reason: 'wrong_title' | 'wrong_artist' | 'timeout';
  canOthersBuzz: boolean;
});
```

---

### `buzz:unlock`
Buzz button unlocks for remaining players.

**Server broadcasts** (to non-locked players):
```typescript
socket.emit('buzz:unlocked', {
  previousPlayer: string;
  reason: 'wrong_answer' | 'timeout';
});
```

---

## 📊 Score Events

### `scores:update`
Real-time score update.

**Server broadcasts** (to all):
```typescript
socket.emit('scores:updated', {
  updates: {
    playerId: string;
    previousScore: number;
    newScore: number;
    pointsAdded: number;
  }[];
  leaderboard: {
    playerId: string;
    playerName: string;
    score: number;
    rank: number;
  }[];
});
```

---

### `scores:final`
Final scores at game end.

**Server broadcasts** (to all):
```typescript
socket.emit('scores:final', {
  sessionId: string;
  finalScores: FinalScore[];
  winner: {
    playerId: string;
    playerName: string;
    totalScore: number;
  };
  podium: FinalScore[];  // Top 3
});
```

---

## ⏱ Timer Events

### `timer:start`
Timer begins countdown.

**Server broadcasts** (to all):
```typescript
socket.emit('timer:started', {
  type: 'song' | 'answer';
  duration: number;  // Seconds
  startedAt: string;
});
```

---

### `timer:tick`
Timer update (sent every second).

**Server broadcasts** (to all):
```typescript
socket.emit('timer:tick', {
  type: 'song' | 'answer';
  remaining: number;  // Seconds
});
```

---

### `timer:expired`
Timer runs out.

**Server broadcasts** (to all):
```typescript
socket.emit('timer:expired', {
  type: 'song' | 'answer';
  action: 'song_end' | 'answer_timeout';
});
```

---

## 🎛 Master Control Events

### `master:skip`
Master skips current song.

**Client emits** (master only):
```typescript
socket.emit('master:skip');
```

**Server broadcasts** (to all):
```typescript
socket.emit('song:skipped', {
  skippedSongId: string;
  reason: 'master_skip';
});
```

---

### `master:volume`
Master adjusts volume (local only, not broadcasted).

**Client emits** (master only):
```typescript
socket.emit('master:volume', {
  level: number;  // 0-100
});
```

---

## ❌ Error Events

### `error`
General error event.

**Server emits** (to specific client):
```typescript
socket.emit('error', {
  code: string;
  message: string;
  details?: any;
});
```

**Error Codes**:
- `ROOM_FULL` - Cannot join, room at capacity
- `GAME_STARTED` - Cannot join, game in progress
- `INVALID_ACTION` - Action not allowed in current state
- `PERMISSION_DENIED` - Player tried master-only action
- `PLAYER_NOT_FOUND` - Player ID invalid
- `SONG_NOT_FOUND` - Song ID invalid
- `ALREADY_BUZZED` - Player already buzzed this song
- `LOCKED_OUT` - Player is locked out
- `TIMEOUT` - Answer submission too late

---

## 🔄 State Sync Events

### `state:sync`
Client requests full state sync (e.g., after reconnect).

**Client emits**:
```typescript
socket.emit('state:sync');
```

**Server responds**:
```typescript
socket.emit('state:synced', {
  room: Room;
  session?: GameSession;
  currentRound?: Round;
  currentSong?: RoundSong;
  players: Player[];
  playerState: PlayerState;  // For this specific player
});
```

---

## 📡 Event Flow Examples

### Example 1: Player Buzzes and Answers Correctly

```
[Player]                [Server]                [All Clients]
   │                       │                          │
   │─ player:buzz ────────>│                          │
   │                       │                          │
   │<─ buzz:accepted ──────│                          │
   │   {titleChoices}      │                          │
   │                       │─ buzz:locked ────────────>│
   │                       │   {playerId: "player1"}  │
   │                       │                          │
   │─ answer:submit ──────>│                          │
   │   {type: "title"}     │                          │
   │                       │                          │
   │<─ answer:correct ─────│                          │
   │   {artistChoices}     │                          │
   │                       │─ answer:result ──────────>│
   │                       │   {isCorrect: true}      │
   │                       │                          │
   │─ answer:submit ──────>│                          │
   │   {type: "artist"}    │                          │
   │                       │                          │
   │<─ answer:correct ─────│                          │
   │   {totalPoints: 2}    │                          │
   │                       │─ song:ended ─────────────>│
   │                       │   {correctPlayers: [...]}│
   │                       │                          │
   │                       │─ scores:updated ─────────>│
```

### Example 2: Wrong Answer, Rebuzz Allowed

```
[Player 1]              [Server]                [All Clients]
   │                       │                          │
   │─ player:buzz ────────>│                          │
   │<─ buzz:accepted ──────│                          │
   │                       │─ buzz:locked ────────────>│
   │                       │                          │
   │─ answer:submit ──────>│                          │
   │   {type: "title"}     │                          │
   │<─ answer:wrong ───────│                          │
   │   {lockedOut: true}   │                          │
   │                       │─ player:lockedout ───────>│
   │                       │   {playerId: "player1"}  │
   │                       │                          │
   │                       │─ buzz:unlocked ──────────>│
   │                       │   (to other players)     │
   │                       │                          │

[Player 2]                 │                          │
   │─ player:buzz ────────>│                          │
   │<─ buzz:accepted ──────│                          │
   │   {titleChoices}      │                          │
   │                       │─ buzz:locked ────────────>│
   │                       │   {playerId: "player2"}  │
```

---

## 🛡 Security & Rate Limiting

### Client Rate Limits
- **Buzz**: Max 1 per second
- **Answer Submit**: Must be within answer timer window
- **Reconnect**: Max 5 attempts, exponential backoff

### Server Validation
- All player actions validated against current game state
- Master-only actions checked via role
- Answer submissions checked for timing and validity

---

## 🧪 Testing Events

### Debug Mode Events
When `NODE_ENV=development`:

**Server broadcasts**:
```typescript
socket.emit('debug:state', {
  currentState: GameState;
  activeTimers: Timer[];
  lockedOutPlayers: string[];
});
```

---

**Last Updated**: 2024-11-09
**Version**: 1.0
