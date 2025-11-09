# Bun Workspace Helper

You are a specialized skill for working with the Bun monorepo workspace in this blind test application.

## Workspace Structure

```
blind-test/
├── apps/
│   ├── server/          # Backend (Elysia + WebSockets) - Port 3007
│   └── client/          # Frontend (SvelteKit) - Port 5173
└── packages/
    └── shared/          # Shared types and utilities (@blind-test/shared)
```

## Key Commands

### Development
- `bun run dev` - Start both server and client
- `bun run dev:server` - Start server only (localhost:3007)
- `bun run dev:client` - Start client only (localhost:5173)

### Building
- `bun run build` - Build all packages
- `bun run build:server` - Build server only
- `bun run build:client` - Build client only

### Workspace-Specific Commands
```bash
# Run command in server workspace
cd apps/server && bun <command>

# Run command in client workspace
cd apps/client && bun <command>

# Install dependency in specific workspace
cd apps/server && bun add <package>
cd apps/client && bun add <package>
cd packages/shared && bun add <package>

# Type checking for client (SvelteKit)
cd apps/client && bunx svelte-kit sync && bun run check
```

## Workspace Dependencies

### Server (apps/server)
- `@elysiajs/eden` - Eden Treaty server setup
- Main file: `src/index.ts` (exports `export type App = typeof app`)
- WebSocket handlers: `src/websocket/`
- Repositories: `src/repositories/` (in-memory, async for future DB)

### Client (apps/client)
- `@elysiajs/eden` - Eden Treaty client
- Main API client: `src/lib/api.ts` (imports server App type)
- WebSocket store: `src/lib/stores/socket.svelte.ts`
- Routes: `src/routes/`

### Shared (packages/shared)
- Package name: `@blind-test/shared`
- Types: `src/types.ts` (Room, Player, GameSession, etc.)
- Utils: `src/utils.ts` (validation functions)

## Common Tasks

### Adding a New Shared Type
1. Add interface to `packages/shared/src/types.ts`
2. Export from `packages/shared/src/index.ts`
3. Import in server: `import type { TypeName } from '@blind-test/shared'`
4. Import in client: `import type { TypeName } from '@blind-test/shared'`
5. **NEVER use relative paths** - always use `@blind-test/shared`

### Adding a New REST Endpoint
1. Add endpoint in `apps/server/src/index.ts`
2. Use Elysia validation with `t.Object()` for request bodies
3. Eden Treaty automatically provides types to client
4. Client uses: `await api.api.your.endpoint.get()` (fully typed)

### Adding a New WebSocket Event
1. Define event payload type in `packages/shared/src/types.ts`
2. Implement handler in `apps/server/src/websocket/`
3. Use route pattern: `/ws/rooms/:roomId`
4. **Always define params schema**: `params: t.Object({ roomId: t.String() })`
5. Update client socket listeners

### Checking for Port Conflicts
```bash
# Server port (3007)
lsof -ti:3007 | xargs kill -9

# Client port (5173)
lsof -ti:5173 | xargs kill -9
```

## Important Conventions

1. **Import shared types** from `@blind-test/shared`, never relative paths
2. **Keep repository methods async** even though in-memory (prepares for DB)
3. **WebSocket endpoints** use `/ws/` prefix, REST uses `/api/`
4. **All WebSocket params** must have schema: `params: t.Object({...})`
5. **Song year is mandatory** in Song interface (not optional)

## Troubleshooting

### Type errors in client
```bash
cd apps/client
bunx svelte-kit sync  # Regenerate SvelteKit types
bun run check         # Run type checker
```

### Eden Treaty types not updating
1. Check `apps/server/src/index.ts` has `export type App = typeof app`
2. Restart TypeScript language server
3. Check `apps/client/src/lib/api.ts` imports the type correctly

### WebSocket connection issues
1. Check server is running on port 3007
2. Verify route pattern in server: `/ws/rooms/:roomId`
3. Check params schema is defined
4. Verify client WebSocket URL matches server endpoint

## Your Role

When helping with this workspace:

1. **Navigate efficiently** - Know which workspace each file belongs to
2. **Run commands in correct workspace** - Use `cd apps/server` or `cd apps/client` as needed
3. **Maintain type safety** - Always use `@blind-test/shared` for imports
4. **Follow conventions** - Async repos, WebSocket patterns, validation
5. **Check documentation** - Reference `docs/` files for specifications
6. **Provide workspace context** - Always mention which workspace you're working in

Remember: This is a type-safe, monorepo architecture. Changes in `packages/shared` affect both server and client. Eden Treaty provides automatic type flow from server to client for REST APIs.
