# 🎵 Blind Test System

A **local blind test system** where players compete to guess songs in real-time. The system features a master server that controls music playback via Bluetooth speaker, while players join from their phones or tablets.

## 📋 Project Status

**Current Phase**: Technical Foundation Complete ✅

This implementation provides the core infrastructure:
- ✅ Room management (create, list, view)
- ✅ Player management (join, remove)
- ✅ Basic game state management (waiting, playing, finished)
- ✅ Real-time updates via polling
- ✅ Type-safe API communication
- ✅ Clean, responsive UI

**Future Enhancements**:
- 🎵 Music playback integration
- 🎯 Game rules and scoring logic
- 💾 Database persistence
- 🔌 WebSocket real-time updates
- 🎨 Advanced UI/UX features
- 📊 Statistics and leaderboards

## 🛠 Technical Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Runtime** | [Bun](https://bun.sh) | Fast JavaScript/TypeScript runtime and package manager |
| **Backend** | [Elysia](https://elysiajs.com) | High-performance web framework with built-in TypeScript support |
| **Frontend** | [SvelteKit](https://kit.svelte.dev) | Modern reactive framework with Svelte 5 |
| **Type Safety** | [Eden Treaty](https://elysiajs.com/eden/overview.html) | End-to-end type safety between frontend and backend |
| **Architecture** | Monorepo | Single repository with multiple packages |

## 🏗 Project Structure

```
blind-test/
├── apps/
│   ├── server/              # Backend API (Elysia)
│   │   ├── src/
│   │   │   └── index.ts     # Main server with all endpoints
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── client/              # Frontend (SvelteKit)
│       ├── src/
│       │   ├── lib/
│       │   │   └── api.ts   # Type-safe API client
│       │   ├── routes/
│       │   │   ├── +page.svelte           # Home page
│       │   │   └── room/[id]/+page.svelte # Room detail page
│       │   ├── app.html
│       │   └── app.d.ts
│       ├── package.json
│       ├── svelte.config.js
│       ├── vite.config.ts
│       └── tsconfig.json
│
├── package.json             # Root workspace configuration
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- **Bun**: v1.0.0 or higher ([install instructions](https://bun.sh))

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd blind-test

# Install all dependencies
bun install
```

### Development

#### Run Both Server and Client

```bash
bun run dev
```

This will start:
- Backend API on `http://localhost:3000`
- Frontend on `http://localhost:5173`

#### Run Server Only

```bash
bun run dev:server
```

The server will run on `http://localhost:3000` with hot reload enabled.

#### Run Client Only

```bash
bun run dev:client
```

The client will run on `http://localhost:5173` with hot reload enabled.

### Production Build

```bash
# Build all packages
bun run build

# Build server only
bun run build:server

# Build client only
bun run build:client
```

## 📡 API Endpoints

### Health Check
- `GET /` - Server health check

### Rooms
- `GET /api/rooms` - List all rooms
- `POST /api/rooms` - Create new room
  - Body: `{ name: string }`
- `GET /api/rooms/:id` - Get room details

### Players
- `POST /api/rooms/:id/players` - Add player to room
  - Body: `{ name: string }`
- `DELETE /api/rooms/:roomId/players/:playerId` - Remove player from room

### Game Control
- `POST /api/rooms/:id/start` - Start the game
  - Requires: minimum 2 players, room status must be "waiting"

## 🎮 How to Use

### 1. Create a Room

1. Navigate to `http://localhost:5173`
2. Enter a room name in the "Create New Room" section
3. Click "Create Room"

### 2. Join a Room

1. Click on a room from the list
2. Enter your player name
3. Click "Join"

### 3. Start the Game

1. Wait for at least 2 players to join
2. Click "Start Game" button
3. The game status will change to "playing"

### 4. Real-Time Updates

The room page automatically polls for updates every 2 seconds, so all players see:
- New players joining
- Players being removed
- Game status changes

## 🧩 Data Models

### Room
```typescript
interface Room {
  id: string;
  name: string;
  players: Player[];
  currentTrack?: string;
  status: "waiting" | "playing" | "finished";
}
```

### Player
```typescript
interface Player {
  id: string;
  name: string;
  score: number;
}
```

## 🔐 Type Safety

This project uses **Eden Treaty** to ensure complete type safety between the frontend and backend:

```typescript
// Backend (apps/server/src/index.ts)
export type App = typeof app;

// Frontend (apps/client/src/lib/api.ts)
import type { App } from '../../../server/src/index';
export const api = treaty<App>('http://localhost:3000');
```

All API calls are fully typed, providing:
- Autocomplete in your IDE
- Compile-time error checking
- Refactoring safety

## 🎨 UI Features

- **Responsive Design**: Works on desktop, tablet, and mobile
- **Status Badges**: Color-coded room status (waiting, playing, finished)
- **Real-time Updates**: Automatic polling every 2 seconds
- **Error Handling**: User-friendly error messages
- **Loading States**: Visual feedback during operations
- **Form Validation**: Input validation with disabled states

## 🔧 Development Features

- **Hot Reload**: Both server and client support hot reload
- **TypeScript Strict Mode**: Maximum type safety
- **Monorepo**: Easy management of multiple packages
- **Workspaces**: Shared dependencies across packages
- **Clean Console Logs**: Server logs all API operations

## 🎯 Future Enhancements

### Music Playback
- Integrate with local music library
- Support for Spotify/YouTube Music APIs
- Bluetooth speaker control

### Game Rules
- Configurable round structure
- Multiple game modes (artist guess, song title, etc.)
- Time limits for guesses
- Point system

### Real-Time Communication
- Replace polling with WebSockets
- Instant updates for all players
- Live chat during games

### Persistence
- Database integration (SQLite, PostgreSQL)
- Game history
- Player profiles and statistics

### UI/UX
- Animations and transitions
- Sound effects
- Dark mode
- Admin panel for game master

### Multiplayer Features
- Team mode
- Tournament brackets
- Spectator mode

## 🐛 Troubleshooting

### Server won't start
```bash
# Check if port 3000 is already in use
lsof -i :3000

# Kill the process if needed
kill -9 <PID>
```

### Client won't start
```bash
# Check if port 5173 is already in use
lsof -i :5173

# Kill the process if needed
kill -9 <PID>
```

### Type errors in frontend
```bash
# Sync SvelteKit types
cd apps/client
bunx svelte-kit sync
```

### Dependencies issues
```bash
# Clean install
rm -rf node_modules
rm -rf apps/*/node_modules
bun install
```

## 📝 License

This project is private and for personal use.

## 🤝 Contributing

This is a personal project. Feel free to fork and modify for your own use!

---

**Built with ❤️ using Bun, Elysia, and SvelteKit**
