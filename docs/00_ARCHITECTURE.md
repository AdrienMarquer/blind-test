# Blind Test - Technical Architecture

## 📐 System Overview

The Blind Test system follows a **client-server architecture** with real-time communication using WebSockets. The master device acts as both the server host and a privileged client, while players connect as standard clients.

```
┌─────────────────────────────────────────────────────────────┐
│                     Master Device (Laptop)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Backend    │  │   Frontend   │  │  Audio Playback  │  │
│  │   (Elysia)   │◄─┤  (SvelteKit) │  │  (Web Audio API) │  │
│  │   Port 3007  │  │  Port 5173   │  │   → Bluetooth    │  │
│  └──────┬───────┘  └──────────────┘  └──────────────────┘  │
│         │                                                    │
│         │  WebSocket + HTTP                                 │
└─────────┼────────────────────────────────────────────────────┘
          │
          │  Local Network (WiFi/LAN)
          │
    ┌─────┴─────┬─────────┬─────────┐
    │           │         │         │
┌───▼───┐  ┌───▼───┐ ┌───▼───┐ ┌───▼───┐
│Player │  │Player │ │Player │ │Player │
│   1   │  │   2   │ │   3   │ │  ...  │
│(Phone)│  │(Phone)│ │(Tablet)│ │ (8)  │
└───────┘  └───────┘ └───────┘ └───────┘
```

## 🏗 Layer Architecture

### Layer 1: Data Layer
**Location**: `apps/server/src/models/`

**Responsibilities**:
- Define TypeScript interfaces for all entities
- Implement data validation logic
- Handle parameter inheritance
- Manage in-memory storage (later: SQLite)

**Key Models**:
- `Room` - Game session container
- `Player` - Player profile and state
- `GameSession` - Active game state
- `Round` - Round configuration and state
- `Mode` - Mode definition and rules
- `Song` - Track metadata and state
- `Playlist` - Collection of songs
- `Answer` - Player answer submission
- `Score` - Scoring state and history

### Layer 2: Business Logic Layer
**Location**: `apps/server/src/services/`

**Responsibilities**:
- Implement game rules and state transitions
- Handle mode-specific logic
- Manage scoring calculations
- Orchestrate game flow
- Validate player actions

**Key Services**:
- `RoomService` - Room lifecycle management
- `GameService` - Game session orchestration
- `ModeService` - Mode execution engine
- `ScoringService` - Score calculation and tiebreakers
- `MusicService` - Playlist and track management
- `AnswerService` - Answer validation

### Layer 3: API Layer
**Location**: `apps/server/src/routes/`

**Responsibilities**:
- Expose REST endpoints
- Handle HTTP requests/responses
- Validate input data
- Return typed responses

**Route Groups**:
- `/api/rooms` - Room CRUD
- `/api/music` - Music library management
- `/api/playlists` - Playlist management
- `/api/game` - Game control endpoints

### Layer 4: WebSocket Layer
**Location**: `apps/server/src/websocket/`

**Responsibilities**:
- Manage real-time connections
- Broadcast events to clients
- Handle player actions (buzz, answer)
- Sync game state
- Manage connection lifecycle

**Socket Namespaces**:
- `/rooms/:roomId` - Room-specific communication

### Layer 5: Presentation Layer
**Location**: `apps/client/src/`

**Responsibilities**:
- Render UI for master and players
- Handle user interactions
- Display game state
- Play audio (master only)
- Show real-time updates

**Component Structure**:
```
src/
├── lib/
│   ├── api.ts              # Eden Treaty client
│   ├── socket.ts           # Socket.io client
│   ├── stores/             # Svelte stores for state
│   │   ├── room.ts
│   │   ├── game.ts
│   │   └── player.ts
│   └── components/
│       ├── Master/         # Master-specific components
│       ├── Player/         # Player-specific components
│       └── Shared/         # Shared components
└── routes/
    ├── +page.svelte                    # Home (create/join)
    ├── master/
    │   └── [roomId]/+page.svelte      # Master view
    └── player/
        └── [roomId]/+page.svelte      # Player view
```

## 🔄 Data Flow

### 1. Room Creation Flow
```
Master UI (Create Room)
    ↓
POST /api/rooms
    ↓
RoomService.createRoom()
    ↓
Generate room ID, QR code
    ↓
Store in memory/database
    ↓
Return room data + QR code
    ↓
Master UI displays lobby
```

### 2. Player Join Flow
```
Player scans QR code
    ↓
Navigate to /player/:roomId
    ↓
Enter player name
    ↓
WebSocket: emit 'player:join'
    ↓
Server validates and adds player
    ↓
Broadcast 'player:joined' to room
    ↓
All clients update player list
```

### 3. Game Start Flow
```
Master clicks "Start Game"
    ↓
POST /api/game/:roomId/start
    ↓
GameService.startGame()
    ↓
Load first round configuration
    ↓
Initialize mode instance
    ↓
WebSocket: broadcast 'game:started'
    ↓
Start first round
    ↓
WebSocket: broadcast 'round:started'
    ↓
Load first song from playlist
    ↓
WebSocket: broadcast 'song:started'
    ↓
Master plays audio
    ↓
Players see "Waiting to buzz" UI
```

### 4. Buzz + Answer Flow (Buzz + Choice Mode)
```
Song playing, player clicks BUZZ
    ↓
WebSocket: emit 'player:buzzed'
    ↓
Server checks if first buzz
    ↓
Lock player as active
    ↓
Broadcast 'buzz:locked' to all
    ↓
Show title options to active player
    ↓
Start answer timer (5s)
    ↓
Player selects title
    ↓
WebSocket: emit 'answer:submitted' {type: 'title', value: 'X'}
    ↓
Server validates answer
    ↓
If CORRECT:
    ├─ Award +1 point
    ├─ Show artist options
    └─ Wait for artist answer
If WRONG:
    ├─ Lock out player
    ├─ Broadcast 'player:locked_out'
    └─ Allow others to buzz
    ↓
If artist correct → Song ends
If all locked out → Song ends
If timer expires → Song ends
```

### 5. Song End Flow
```
Song end condition met
    ↓
GameService.endSong()
    ↓
Calculate final scores for song
    ↓
Broadcast 'song:ended' with scores
    ↓
Check if more songs in round
    ↓
If YES:
    ├─ Load next song
    └─ Broadcast 'song:started'
If NO:
    ├─ End round
    └─ Broadcast 'round:ended' with scoreboard
```

## 🗄 State Management

### Server State
**In-Memory (Development)**:
```typescript
const rooms = new Map<string, Room>();
const activeSessions = new Map<string, GameSession>();
const musicLibrary = new Map<string, Song>();
const playlists = new Map<string, Playlist>();
```

**SQLite (Production)**:
- Persistent storage for rooms, playlists, music library
- Game history and statistics
- Player profiles

### Client State (Svelte Stores)

**Room Store** (`$room`):
```typescript
{
  id: string;
  name: string;
  players: Player[];
  status: 'lobby' | 'playing' | 'between_rounds' | 'finished';
  currentRound?: number;
  totalRounds: number;
}
```

**Game Store** (`$game`):
```typescript
{
  sessionId: string;
  currentSong?: Song;
  currentMode: Mode;
  timeRemaining: number;
  songProgress: number;
  playerStates: Map<string, PlayerState>;
}
```

**Player Store** (`$player`):
```typescript
{
  id: string;
  name: string;
  role: 'master' | 'player';
  score: number;
  roundScore: number;
  isActive: boolean;
  isLockedOut: boolean;
}
```

## 🔐 Security Considerations

### Network Security
- **Local Network Only**: No external access required
- **CORS**: Restrict to local network IPs
- **WebSocket Origin**: Validate connection origin

### Input Validation
- **Room Names**: Max 50 chars, no special characters
- **Player Names**: Max 20 chars, unique within room
- **File Uploads**: MP3 only, max 20MB per file

### Rate Limiting
- **Buzz Actions**: Max 1 buzz per second per player
- **Answer Submissions**: Must be within answer timer window
- **Room Creation**: Max 5 rooms per IP per hour

## 📊 Performance Considerations

### Scalability Targets
- **Concurrent Rooms**: 10 rooms (80 players total)
- **WebSocket Connections**: 100 simultaneous
- **Music Library**: Up to 1000 songs
- **Database**: SQLite (< 100MB)

### Optimization Strategies
1. **Lazy Loading**: Load songs on-demand
2. **Caching**: Cache song metadata in memory
3. **Connection Pooling**: Reuse database connections
4. **Debouncing**: Throttle UI updates (100ms)
5. **Audio Preloading**: Preload next song during current song

## 🌐 Network Architecture

### Master Device Requirements
- **WiFi**: Must broadcast SSID for players to connect
- **Ports**: 3007 (HTTP/WS), 5173 (dev only)
- **Firewall**: Allow incoming connections on port 3007

### QR Code Format
```
http://<master-ip>:3007/player/<room-id>
```

### IP Discovery
```typescript
// Server detects local IP on startup
const localIP = getLocalNetworkIP(); // e.g., 192.168.1.100
const qrCodeURL = `http://${localIP}:3007/player/${roomId}`;
```

## 🔧 Technology Stack Details

### Backend
- **Runtime**: Bun 1.3+
- **Framework**: Elysia 1.0+
- **WebSocket**: Socket.io 4.x
- **Database**: better-sqlite3
- **Validation**: Elysia's built-in `t` validator
- **File Processing**: music-metadata, formidable

### Frontend
- **Framework**: SvelteKit 2.0 + Svelte 5
- **WebSocket Client**: socket.io-client
- **QR Code**: qrcode library
- **Audio**: Web Audio API (master), Howler.js (fallback)
- **Styling**: Scoped CSS + CSS variables

### Development Tools
- **Type Safety**: TypeScript strict mode
- **Linting**: ESLint
- **Formatting**: Prettier
- **Testing**: Bun's built-in test runner (future)

## 📁 File Structure

```
blind-test/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts              # Entry point
│   │   │   ├── models/               # Data models
│   │   │   │   ├── Room.ts
│   │   │   │   ├── Player.ts
│   │   │   │   ├── GameSession.ts
│   │   │   │   ├── Round.ts
│   │   │   │   ├── Mode.ts
│   │   │   │   ├── Song.ts
│   │   │   │   └── Playlist.ts
│   │   │   ├── services/             # Business logic
│   │   │   │   ├── RoomService.ts
│   │   │   │   ├── GameService.ts
│   │   │   │   ├── ModeService.ts
│   │   │   │   ├── ScoringService.ts
│   │   │   │   ├── MusicService.ts
│   │   │   │   └── AnswerService.ts
│   │   │   ├── routes/               # API routes
│   │   │   │   ├── rooms.ts
│   │   │   │   ├── music.ts
│   │   │   │   ├── playlists.ts
│   │   │   │   └── game.ts
│   │   │   ├── websocket/            # WebSocket handlers
│   │   │   │   ├── index.ts
│   │   │   │   ├── events.ts
│   │   │   │   └── handlers/
│   │   │   │       ├── buzz.ts
│   │   │   │       ├── answer.ts
│   │   │   │       └── player.ts
│   │   │   ├── modes/                # Mode implementations
│   │   │   │   ├── BaseMode.ts
│   │   │   │   ├── BuzzAndChoiceMode.ts
│   │   │   │   └── index.ts
│   │   │   ├── utils/                # Utilities
│   │   │   │   ├── id.ts
│   │   │   │   ├── network.ts
│   │   │   │   ├── validation.ts
│   │   │   │   └── time.ts
│   │   │   └── database/             # Database
│   │   │       ├── schema.ts
│   │   │       ├── migrations/
│   │   │       └── seed.ts
│   │   ├── uploads/                  # MP3 files
│   │   └── database.sqlite           # SQLite file
│   │
│   └── client/
│       ├── src/
│       │   ├── lib/
│       │   │   ├── api.ts
│       │   │   ├── socket.ts
│       │   │   ├── stores/
│       │   │   │   ├── room.ts
│       │   │   │   ├── game.ts
│       │   │   │   └── player.ts
│       │   │   ├── components/
│       │   │   │   ├── Master/
│       │   │   │   │   ├── Lobby.svelte
│       │   │   │   │   ├── GameView.svelte
│       │   │   │   │   ├── PlayerList.svelte
│       │   │   │   │   ├── MasterControls.svelte
│       │   │   │   │   └── Scoreboard.svelte
│       │   │   │   ├── Player/
│       │   │   │   │   ├── WaitingView.svelte
│       │   │   │   │   ├── BuzzButton.svelte
│       │   │   │   │   ├── ChoiceButtons.svelte
│       │   │   │   │   └── PlayerScoreboard.svelte
│       │   │   │   └── Shared/
│       │   │   │       ├── QRCode.svelte
│       │   │   │       ├── Timer.svelte
│       │   │   │       └── StatusBadge.svelte
│       │   │   └── audio/
│       │   │       └── AudioPlayer.ts
│       │   └── routes/
│       │       ├── +page.svelte           # Home
│       │       ├── master/
│       │       │   └── [roomId]/
│       │       │       └── +page.svelte   # Master view
│       │       └── player/
│       │           └── [roomId]/
│       │               └── +page.svelte   # Player view
│       └── static/
│           └── sounds/                    # Sound effects
│
├── docs/                                  # Documentation
│   ├── PROJECT_DESCRIPTION.md
│   ├── ARCHITECTURE.md                    # This file
│   ├── DATABASE.md
│   ├── API.md
│   ├── WEBSOCKETS.md
│   ├── GAME_STATE.md
│   └── UI_SPEC.md
│
└── package.json
```

## 🚀 Deployment

### Development
```bash
bun install
bun run dev          # Runs both server and client
```

### Production (Local)
```bash
bun run build        # Build both apps
bun run start:server # Start production server
```

### Environment Variables
```bash
# Server (.env)
PORT=3007
NODE_ENV=development
DATABASE_PATH=./database.sqlite
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=20971520  # 20MB
```

---

**Last Updated**: 2024-11-09
**Version**: 1.0
