# Blind Test - REST API Specification

## 📡 API Overview

**Base URL**: `http://localhost:3007/api`

**Content Type**: `application/json`

**Authentication**: None (local network only)

---

## 🏠 Rooms API

### Create Room
Create a new game room and generate QR code.

```http
POST /api/rooms
```

**Request Body**:
```typescript
{
  name: string;        // Room name (max 50 chars)
  maxPlayers?: number; // Optional, default: 8
}
```

**Response** `201 Created`:
```typescript
{
  id: string;
  name: string;
  code: string;         // 6-char join code
  qrCode: string;       // Data URL for QR code image
  masterIp: string;     // Master device IP
  status: "lobby";
  createdAt: string;    // ISO 8601
  maxPlayers: number;
  players: [];
}
```

**Example**:
```bash
curl -X POST http://localhost:3007/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"name": "Friday Night Music"}'
```

---

### Get All Rooms
List all active rooms.

```http
GET /api/rooms
```

**Query Parameters**:
- `status` (optional): Filter by status (`lobby`, `playing`, `finished`)

**Response** `200 OK`:
```typescript
{
  rooms: Room[];
  total: number;
}
```

---

### Get Room by ID
Get detailed information about a specific room.

```http
GET /api/rooms/:id
```

**Response** `200 OK`:
```typescript
{
  id: string;
  name: string;
  code: string;
  qrCode: string;
  status: RoomStatus;
  players: Player[];
  session?: GameSession;
  config: GameConfig;
  createdAt: string;
  updatedAt: string;
}
```

**Error** `404 Not Found`:
```typescript
{
  error: "Room not found";
}
```

---

### Update Room
Update room configuration (lobby only).

```http
PATCH /api/rooms/:id
```

**Request Body**:
```typescript
{
  name?: string;
  maxPlayers?: number;
  config?: Partial<GameConfig>;
}
```

**Response** `200 OK`:
```typescript
{
  ...updatedRoom
}
```

**Error** `400 Bad Request`:
```typescript
{
  error: "Cannot update room while game is in progress";
}
```

---

### Delete Room
Delete a room (master only).

```http
DELETE /api/rooms/:id
```

**Response** `204 No Content`

---

## 👥 Players API

### Add Player to Room
Player joins a room.

```http
POST /api/rooms/:roomId/players
```

**Request Body**:
```typescript
{
  name: string;  // Display name (max 20 chars, unique in room)
}
```

**Response** `201 Created`:
```typescript
{
  id: string;
  roomId: string;
  name: string;
  role: "player";
  connected: true;
  joinedAt: string;
  score: 0;
  roundScore: 0;
  stats: PlayerStats;
}
```

**Errors**:
- `400 Bad Request`: Room full, game already started, or duplicate name
- `404 Not Found`: Room doesn't exist

---

### Remove Player from Room
Remove a player (master or self-removal).

```http
DELETE /api/rooms/:roomId/players/:playerId
```

**Response** `204 No Content`

**Errors**:
- `400 Bad Request`: Cannot remove player during active game
- `404 Not Found`: Player or room not found

---

### Get Player Info
Get player details.

```http
GET /api/rooms/:roomId/players/:playerId
```

**Response** `200 OK`:
```typescript
{
  id: string;
  name: string;
  score: number;
  roundScore: number;
  isActive: boolean;
  isLockedOut: boolean;
  stats: PlayerStats;
}
```

---

## 🎮 Game Control API

### Start Game
Master starts the game session.

```http
POST /api/game/:roomId/start
```

**Request Body**:
```typescript
{
  config?: GameConfig;  // Optional, uses defaults if not provided
}
```

**Response** `200 OK`:
```typescript
{
  sessionId: string;
  roomId: string;
  status: "playing";
  currentRoundIndex: 0;
  rounds: Round[];
}
```

**Errors**:
- `400 Bad Request`: Not enough players (minimum 2)
- `409 Conflict`: Game already started

---

### Pause Game
Master pauses the current game.

```http
POST /api/game/:roomId/pause
```

**Response** `200 OK`:
```typescript
{
  status: "paused";
  pausedAt: string;
}
```

---

### Resume Game
Master resumes a paused game.

```http
POST /api/game/:roomId/resume
```

**Response** `200 OK`:
```typescript
{
  status: "playing";
  resumedAt: string;
}
```

---

### Skip Song
Master skips the current song.

```http
POST /api/game/:roomId/skip
```

**Response** `200 OK`:
```typescript
{
  skippedSongId: string;
  nextSongId: string;
}
```

---

### End Game
Master manually ends the game.

```http
POST /api/game/:roomId/end
```

**Response** `200 OK`:
```typescript
{
  sessionId: string;
  status: "finished";
  endedAt: string;
  finalScores: FinalScore[];
}
```

---

### Get Game State
Get current game session state.

```http
GET /api/game/:roomId
```

**Response** `200 OK`:
```typescript
{
  sessionId: string;
  status: GameStatus;
  currentRoundIndex: number;
  currentSongIndex: number;
  currentRound: Round;
  currentSong: RoundSong;
  timeRemaining: number;  // Seconds
  players: Player[];
}
```

---

## 🎵 Music Library API

### Upload Music Files
Upload MP3 files to the music library.

```http
POST /api/music/upload
Content-Type: multipart/form-data
```

**Request**:
```typescript
FormData {
  files: File[];  // MP3, M4A, WAV, or FLAC files
}
```

**Response** `201 Created`:
```typescript
{
  uploaded: Song[];
  failed: {
    fileName: string;
    reason: string;
  }[];
}
```

**Errors**:
- `400 Bad Request`: Invalid file format or size exceeds limit
- `413 Payload Too Large`: File > 20MB

---

### Get Music Library
List all songs in the library.

```http
GET /api/music
```

**Query Parameters**:
- `search` (optional): Search by title/artist
- `genre` (optional): Filter by genre
- `limit` (optional): Limit results (default: 100)
- `offset` (optional): Pagination offset

**Response** `200 OK`:
```typescript
{
  songs: Song[];
  total: number;
  limit: number;
  offset: number;
}
```

---

### Get Song by ID
Get song details.

```http
GET /api/music/:songId
```

**Response** `200 OK`:
```typescript
{
  id: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  genre?: string;
  duration: number;
  clipStart: number;
  clipDuration: number;
  filePath: string;
  format: string;
}
```

---

### Update Song Metadata
Update song information or clip settings.

```http
PATCH /api/music/:songId
```

**Request Body**:
```typescript
{
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  clipStart?: number;    // Seconds
  clipDuration?: number; // Seconds
}
```

**Response** `200 OK`:
```typescript
{
  ...updatedSong
}
```

---

### Delete Song
Remove song from library.

```http
DELETE /api/music/:songId
```

**Response** `204 No Content`

**Note**: Cannot delete if song is in an active playlist.

---

### Stream Song
Stream audio file for playback.

```http
GET /api/music/:songId/stream
```

**Query Parameters**:
- `start` (optional): Start time in seconds

**Response**: Audio stream with appropriate headers

```http
HTTP/1.1 200 OK
Content-Type: audio/mpeg
Accept-Ranges: bytes
Content-Length: <file-size>
```

---

## 📋 Playlists API

### Create Playlist
Create a new playlist.

```http
POST /api/playlists
```

**Request Body**:
```typescript
{
  name: string;
  description?: string;
  songIds?: string[];  // Initial songs
}
```

**Response** `201 Created`:
```typescript
{
  id: string;
  name: string;
  description?: string;
  songIds: string[];
  songCount: number;
  totalDuration: number;
  createdAt: string;
}
```

---

### Get All Playlists
List all playlists.

```http
GET /api/playlists
```

**Response** `200 OK`:
```typescript
{
  playlists: Playlist[];
  total: number;
}
```

---

### Get Playlist by ID
Get playlist details with songs.

```http
GET /api/playlists/:playlistId
```

**Response** `200 OK`:
```typescript
{
  id: string;
  name: string;
  description?: string;
  songs: Song[];  // Full song objects, ordered
  songCount: number;
  totalDuration: number;
  createdAt: string;
  updatedAt: string;
}
```

---

### Update Playlist
Update playlist metadata or song order.

```http
PATCH /api/playlists/:playlistId
```

**Request Body**:
```typescript
{
  name?: string;
  description?: string;
  songIds?: string[];  // Reorder or modify songs
}
```

**Response** `200 OK`:
```typescript
{
  ...updatedPlaylist
}
```

---

### Add Songs to Playlist
Add one or more songs to a playlist.

```http
POST /api/playlists/:playlistId/songs
```

**Request Body**:
```typescript
{
  songIds: string[];
  position?: number;  // Insert position (default: end)
}
```

**Response** `200 OK`:
```typescript
{
  ...updatedPlaylist
}
```

---

### Remove Song from Playlist
Remove a song from a playlist.

```http
DELETE /api/playlists/:playlistId/songs/:songId
```

**Response** `204 No Content`

---

### Delete Playlist
Delete a playlist.

```http
DELETE /api/playlists/:playlistId
```

**Response** `204 No Content`

**Note**: Cannot delete if playlist is used in an active game.

---

## 📊 Statistics API

### Get Player Statistics
Get detailed player statistics.

```http
GET /api/stats/players/:playerId
```

**Response** `200 OK`:
```typescript
{
  playerId: string;
  playerName: string;
  totalGames: number;
  totalScore: number;
  averageScore: number;
  totalAnswers: number;
  correctAnswers: number;
  accuracy: number;  // Percentage
  averageAnswerTime: number;  // Milliseconds
  favoriteGenre?: string;
  bestRound: {
    sessionId: string;
    score: number;
    date: string;
  };
}
```

---

### Get Game History
Get past game sessions.

```http
GET /api/stats/history
```

**Query Parameters**:
- `limit` (optional): Number of games (default: 20)
- `offset` (optional): Pagination

**Response** `200 OK`:
```typescript
{
  sessions: {
    id: string;
    roomName: string;
    startedAt: string;
    endedAt: string;
    playerCount: number;
    winner: string;
    finalScores: FinalScore[];
  }[];
  total: number;
}
```

---

## ⚙️ Configuration API

### Get System Info
Get server information.

```http
GET /api/system
```

**Response** `200 OK`:
```typescript
{
  version: string;
  serverIp: string;
  port: number;
  musicLibrarySize: number;  // Bytes
  totalSongs: number;
  totalPlaylists: number;
  activeRooms: number;
  uptime: number;  // Seconds
}
```

---

### Get Available Modes
List all available game modes.

```http
GET /api/modes
```

**Response** `200 OK`:
```typescript
{
  modes: {
    type: ModeType;
    name: string;
    description: string;
    defaultParams: ModeParams;
    available: boolean;  // Future modes may be false
  }[];
}
```

---

## 🚨 Error Responses

### Standard Error Format
```typescript
{
  error: string;           // Human-readable error message
  code?: string;           // Error code (e.g., "ROOM_FULL")
  details?: any;           // Additional error context
  timestamp: string;       // ISO 8601
}
```

### HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| `200` | OK | Successful GET/PATCH |
| `201` | Created | Successful POST creating resource |
| `204` | No Content | Successful DELETE |
| `400` | Bad Request | Invalid input data |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | State conflict (e.g., game already started) |
| `413` | Payload Too Large | File upload too large |
| `422` | Unprocessable Entity | Validation failed |
| `500` | Internal Server Error | Server error |

---

## 🔐 Validation Rules

### Room Name
- Min length: 1 character
- Max length: 50 characters
- Allowed: alphanumeric, spaces, hyphens, underscores

### Player Name
- Min length: 1 character
- Max length: 20 characters
- Must be unique within room
- Allowed: alphanumeric, spaces

### File Upload
- Max size: 20MB per file
- Formats: MP3, M4A, WAV, FLAC
- Must have valid audio metadata

### Playlist Name
- Min length: 1 character
- Max length: 100 characters

---

## 📝 Examples

### Complete Game Flow Example

```bash
# 1. Create room
curl -X POST http://localhost:3007/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"name":"Friday Game"}'
# Response: { id: "abc123", code: "XYZ789", qrCode: "data:image/png;base64,..." }

# 2. Player joins
curl -X POST http://localhost:3007/api/rooms/abc123/players \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice"}'
# Response: { id: "player1", name: "Alice", ... }

# 3. Another player joins
curl -X POST http://localhost:3007/api/rooms/abc123/players \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob"}'
# Response: { id: "player2", name: "Bob", ... }

# 4. Master starts game
curl -X POST http://localhost:3007/api/game/abc123/start \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "numRounds": 2,
      "playlistId": "playlist1",
      "defaultParams": {
        "songDuration": 15,
        "answerTimer": 5
      }
    }
  }'
# Response: { sessionId: "session1", status: "playing", ... }

# 5. Get current game state
curl http://localhost:3007/api/game/abc123
# Response: { currentRound: {...}, currentSong: {...}, players: [...] }

# 6. End game
curl -X POST http://localhost:3007/api/game/abc123/end
# Response: { finalScores: [...] }
```

---

**Last Updated**: 2024-11-09
**Version**: 1.0
