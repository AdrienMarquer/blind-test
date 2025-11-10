/**
 * Blind Test - Main Server
 * Elysia REST API + WebSockets
 */

import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';
import { runMigrations } from './db';
import { handleWebSocket, handleMessage, handleClose } from './websocket/handler';
import { logger } from './utils/logger';
import { existsSync } from 'fs';
import path from 'path';

// Import route modules
import { roomRoutes } from './routes/rooms';
import { playerRoutes } from './routes/players';
import { gameRoutes } from './routes/game';
import { songRoutes } from './routes/songs';
import { modeRoutes } from './routes/modes';
import { mediaRoutes } from './routes/media';

// Run database migrations
try {
  await runMigrations();
  logger.info('Database ready');
} catch (error) {
  logger.error('Database initialization failed', error);
  process.exit(1);
}

// Create child logger for WebSocket
const wsLogger = logger.child({ module: 'WebSocket' });

// Determine client build path
const clientBuildPath = path.join(process.cwd(), '../client/build');
const hasClientBuild = existsSync(clientBuildPath);

if (!hasClientBuild) {
  logger.warn('Client build not found', {
    path: clientBuildPath,
    message: 'Run `bun run build:client` to build the client for production'
  });
}

// Initialize Elysia app
const app = new Elysia()
  .use(cors())

  // Health check endpoint (for Docker/monitoring)
  .get('/health', () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  })

  // API routes (must come before static files to take precedence)
  .use(roomRoutes)
  .use(playerRoutes)
  .use(gameRoutes)
  .use(songRoutes)
  .use(modeRoutes)
  .use(mediaRoutes)

  // WebSocket endpoint for room connections
  .ws('/ws/rooms/:roomId', {
    params: t.Object({
      roomId: t.String()
    }),
    query: t.Object({
      token: t.Optional(t.String()),
      playerId: t.Optional(t.String())
    }),
    open(ws) {
      // Extract roomId from route params
      const roomId = ws.data?.params?.roomId;

      if (!roomId) {
        wsLogger.error('WebSocket connection missing roomId');
        ws.close();
        return;
      }

      // Store roomId and optional token/playerId in ws.data for access in message handlers
      ws.data.roomId = roomId;
      ws.data.token = ws.data?.query?.token;
      ws.data.playerId = ws.data?.query?.playerId;
      handleWebSocket(ws);
    },
    message(ws, message) {
      handleMessage(ws, typeof message === 'string' ? message : JSON.stringify(message));
    },
    close(ws) {
      handleClose(ws);
    }
  })

  // Serve static client files (SPA fallback)
  // This must come AFTER all API routes and WebSocket
  .use(hasClientBuild
    ? staticPlugin({
        assets: clientBuildPath,
        prefix: '/',
        // Enable SPA fallback - serve index.html for non-file routes
        alwaysStatic: false,
        // This allows the index.html to handle client-side routing
      })
    : (app) => app  // No-op if client not built
  )

  // Fallback for SPA routing - serve index.html for all non-API routes
  .get('*', ({ set }) => {
    if (!hasClientBuild) {
      set.status = 503;
      return {
        error: 'Client not built',
        message: 'Run `bun run build:client` to build the client'
      };
    }

    // Serve index.html for client-side routing
    return Bun.file(path.join(clientBuildPath, 'index.html'));
  });

// Start server
app.listen({
  port: 3007,
  hostname: '0.0.0.0'
});

logger.info(`Server started`, {
  http: `http://${app.server?.hostname}:${app.server?.port}`,
  ws: `ws://${app.server?.hostname}:${app.server?.port}`
});

// Export app type for Eden Treaty
export type App = typeof app;
