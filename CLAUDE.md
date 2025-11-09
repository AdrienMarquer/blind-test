# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **local blind test system** where players compete to guess songs in real-time. The master server controls music playback via Bluetooth speaker, while players join from their phones or tablets using a WebSocket-based real-time communication system.

## Tech Stack

- **Runtime**: Bun (JavaScript/TypeScript runtime and package manager)
- **Backend**: Elysia (high-performance web framework) + Native WebSockets
- **Frontend**: SvelteKit + Svelte 5 (modern reactive framework)
- **Type Safety**: Eden Treaty (end-to-end type safety between frontend and backend)
- **Architecture**: Monorepo with workspaces

## Development Commands

### Start Development Environment
```bash
# Run both server and client
bun run dev

# Run server only (localhost:3007)
bun run dev:server

# Run client only (localhost:5173)
bun run dev:client
```

### Build
```bash
# Build all packages
bun run build

# Build server only
bun run build:server

# Build client only
bun run build:client
```

### Type Checking (Client)
```bash
cd apps/client
bunx svelte-kit sync        # Sync SvelteKit types
bun run check               # Run svelte-check
```

## Architecture & Code Organization

### Monorepo Structure
```
blind-test/
├── apps/
│   ├── server/          # Backend API (Elysia + Socket.io)
│   │   └── src/
│   │       ├── index.ts         # Main server entry, all REST endpoints
│   │       ├── repositories/    # Data access layer (in-memory)
│   │       └── websocket/       # WebSocket event handlers
│   └── client/          # Frontend (SvelteKit)
│       └── src/
│           ├── lib/
│           │   ├── api.ts       # Eden Treaty type-safe client
│           │   └── socket.ts    # Socket.io client (if exists)
│           └── routes/
│               ├── +page.svelte               # Home page
│               └── room/[id]/+page.svelte    # Room detail page
└── packages/
    └── shared/          # Shared types and utilities
        └── src/
            ├── types.ts     # TypeScript interfaces (Room, Player, etc.)
            └── utils.ts     # Shared validation and utility functions
```

### Key Architecture Patterns

1. **Type-Safe API Communication**: The backend exports its type via `export type App = typeof app` in `apps/server/src/index.ts`. The frontend imports this type and creates a type-safe client using Eden Treaty in `apps/client/src/lib/api.ts`. This provides compile-time type checking for all API calls.

2. **Shared Package**: The `@blind-test/shared` workspace package contains all shared TypeScript types and utilities. Both server and client import from this package to ensure consistency.

3. **Repository Pattern**: The server uses repository classes (RoomRepository, PlayerRepository) for data access. Currently in-memory implementation using Maps. Future phases will migrate to SQLite then PostgreSQL.

4. **WebSocket Architecture**: Real-time communication uses native browser WebSockets with room-specific endpoints (`/ws/rooms/:roomId`). The server uses Elysia's built-in WebSocket support. Messages are JSON-formatted with a `type` field for event routing.

## Data Layer Details

### Current Phase: In-Memory Storage
- Data stored in TypeScript Maps within repository classes
- No persistence (data lost on server restart)
- Suitable for MVP development

### Future Phases
- **Phase 2**: SQLite persistence (see `docs/DATABASE.md`)
- **Phase 3**: PostgreSQL migration (schema designed to be compatible from start)

### Core Data Models
All TypeScript interfaces are defined in `packages/shared/src/types.ts`:
- **Room**: Game session container with players, status, QR code
- **Player**: Player profile with score, stats, connection state
- **GameSession**: Active game state (future implementation)
- **Round**: Round configuration and state (future)
- **Song**: Track metadata with clip configuration (future)
- **Mode**: Game mode definitions (future)

## Type Safety & Eden Treaty

When modifying REST API endpoints:

1. **Server**: Add/modify endpoints in `apps/server/src/index.ts`
2. **Type Export**: The server automatically exports its type at the bottom of `index.ts`
3. **Client**: The client automatically gets type updates through `apps/client/src/lib/api.ts`
4. **No Codegen**: Types flow automatically through TypeScript, no build step needed

Example:
```typescript
// Server: apps/server/src/index.ts
.get('/api/rooms/:id', async ({ params: { id }, error }) => {
  // implementation
})

// Client: apps/client/src/routes/room/[id]/+page.svelte
import { api } from '$lib/api';
const { data } = await api.api.rooms[roomId].get();
// 'data' is fully typed with autocomplete
```

## Important Design Decisions

### Parameter Inheritance System
Game parameters (like song duration, answer timer) follow a simplified inheritance model:
- **Round-level**: Highest priority (round-specific overrides)
- **Mode-level**: Mode defaults
- **System-level**: Global fallback defaults

See `docs/DATABASE.md` for the resolution logic.

### Song Clip Duration
Songs define WHERE to start playing (`clipStart` in seconds), but NOT how long to play. Playback duration is controlled by `ModeParams.songDuration` which can be set at mode or round level. This separates content curation from gameplay rules.

### WebSocket-Only Real-Time Updates
The system uses WebSockets exclusively for real-time communication. No HTTP polling fallback. See `docs/WEBSOCKETS.md` for complete event specification.

## Documentation Files

Comprehensive technical documentation in `docs/`:
- **00_ARCHITECTURE.md**: Complete system architecture, layers, data flow
- **API.md**: Full REST API specification with examples
- **WEBSOCKETS.md**: WebSocket events specification
- **DATABASE.md**: Data models, schema, inheritance system
- **GAME_STATE.md**: Game state machine and transitions (future)
- **UI_SPEC.md**: UI/UX specifications (future)

When implementing features, **always consult the relevant documentation first** to understand the design decisions and planned architecture.

## Working with This Codebase

### Adding a New REST Endpoint
1. Add the endpoint in `apps/server/src/index.ts`
2. Use Elysia's validation with `t.Object()` for request bodies
3. Return typed responses - types automatically flow to client
4. Add console.log statements for debugging (see existing patterns)
5. Test with the client - autocomplete should work immediately

### Adding a New WebSocket Event
1. Define event payload types in `packages/shared/src/types.ts`
2. Implement handler in `apps/server/src/websocket/`
3. Update client socket listeners accordingly
4. Reference `docs/WEBSOCKETS.md` for event naming conventions

### Modifying Data Models
1. Update TypeScript interfaces in `packages/shared/src/types.ts`
2. Update repository implementations in `apps/server/src/repositories/`
3. Consider future database migration - keep schema PostgreSQL-compatible
4. Update relevant documentation in `docs/`

### Adding Validation
Validation utilities live in `packages/shared/src/utils.ts`:
- `validateRoomName(name: string)`: Room name validation
- `validatePlayerName(name: string)`: Player name validation
- Add new validators here to keep them shared and testable

## Current Implementation Status

**Completed (Phase 1)**:
- Room management (create, list, view, delete)
- Player management (join, remove)
- Basic game state management (lobby, playing, finished)
- Real-time WebSocket infrastructure
- Type-safe API communication
- Clean, responsive UI

**Not Yet Implemented**:
- Music playback integration (Phase 2)
- Game modes and scoring logic (Phase 2)
- Database persistence (Phase 2: SQLite, Phase 3: PostgreSQL)
- Full WebSocket event handlers for gameplay (Phase 2)
- Music library upload UI (future - currently place MP3s in `apps/server/uploads/`)

## Common Pitfalls

1. **Port Conflicts**: Server runs on 3007, client on 5173. If startup fails, check if ports are in use.
2. **Type Imports**: Always import shared types from `@blind-test/shared`, not from relative paths.
3. **WebSocket Routes**: WebSocket endpoints use `/ws/` prefix (e.g., `/ws/rooms/:roomId`) to distinguish from REST API routes (`/api/`).
4. **Repository Methods**: All repository methods are async even though in-memory. This prepares for database migration.
5. **Year Field**: Song `year` is mandatory (not optional) - required for music identification.
6. **WebSocket Params**: Always define params schema in WebSocket routes using `params: t.Object({...})` for route parameters to be accessible.

## File Watching & Hot Reload

Both server and client support hot reload during development:
- **Server**: Uses `bun run --watch` to restart on file changes
- **Client**: Vite's HMR updates the browser automatically

When making changes, watch the terminal output for compilation errors.
