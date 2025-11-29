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
import { jobRoutes } from './routes/jobs';
import { jobWorker } from './services/JobWorker';
import { jobQueue } from './services/JobQueue';
import { broadcastJobEvent } from './websocket/handler';

// Run database migrations
try {
  await runMigrations();
  logger.info('Database ready');
} catch (error) {
  logger.error('Database initialization failed', error);
  process.exit(1);
}

// Set up job queue event broadcasting via WebSocket
jobQueue.on((event) => {
  const { type, job } = event;

  // Broadcast job events to all connected clients
  switch (type) {
    case 'job:progress':
      broadcastJobEvent({
        type: 'job:progress',
        data: {
          jobId: job.id,
          type: job.type,
          status: job.status,
          progress: job.progress,
          currentItem: job.currentItem,
          totalItems: job.totalItems,
        },
      });
      break;

    case 'job:completed':
      broadcastJobEvent({
        type: 'job:completed',
        data: {
          jobId: job.id,
          type: job.type,
          metadata: job.metadata,
        },
      });
      break;

    case 'job:failed':
      broadcastJobEvent({
        type: 'job:failed',
        data: {
          jobId: job.id,
          type: job.type,
          error: job.error || 'Unknown error',
        },
      });
      break;

    case 'job:cancelled':
      // Treat cancelled as failed for now
      broadcastJobEvent({
        type: 'job:failed',
        data: {
          jobId: job.id,
          type: job.type,
          error: 'Job cancelled',
        },
      });
      break;
  }
});

// Start job worker for background processing
jobWorker.start();
logger.info('Job worker started', jobWorker.getStatus());

// Create child logger for WebSocket
const wsLogger = logger.child({ module: 'WebSocket' });

// Determine client build path
const clientBuildPath = path.join(process.cwd(), '../client/build');
const hasClientBuild = existsSync(clientBuildPath);

// Initialize Elysia app
const app = new Elysia()
  // Global error handler
  .onError(({ code, error, set }) => {
    logger.error('Request error', { code, error: error.message, stack: error.stack });

    switch (code) {
      case 'VALIDATION':
        set.status = 400;
        return { error: 'Validation failed', details: error.message };
      case 'NOT_FOUND':
        set.status = 404;
        return { error: 'Resource not found' };
      case 'PARSE':
        set.status = 400;
        return { error: 'Invalid request format' };
      case 'UNKNOWN':
      default:
        set.status = 500;
        return { error: 'Internal server error' };
    }
  })
  .use(cors())

  // Health check endpoint (for Docker/monitoring)
  .get('/health', () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  })

  // Explicit root handler for SPA
  .get('/', async ({ set }) => {
    if (!hasClientBuild) {
      set.status = 503;
      return { error: 'Client not built' };
    }
    const indexPath = path.join(clientBuildPath, 'index.html');
    set.headers['content-type'] = 'text/html; charset=utf-8';
    return await Bun.file(indexPath).text();
  })

  // API routes (must come before static files to take precedence)
  .use(roomRoutes)
  .use(playerRoutes)
  .use(gameRoutes)
  .use(songRoutes)
  .use(modeRoutes)
  .use(mediaRoutes)
  .use(jobRoutes)

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
        indexHTML: true,  // Serve index.html for directory requests
      })
    : (app) => app  // No-op if client not built
  )

  // Fallback for SPA routing - serve index.html for non-file routes
  .get('*', async ({ set, path: reqPath }) => {
    if (!hasClientBuild) {
      set.status = 503;
      return {
        error: 'Client not built',
        message: 'Run `bun run build:client` to build the client'
      };
    }

    // Check if this is a request for a static file
    const filePath = path.join(clientBuildPath, reqPath);
    const file = Bun.file(filePath);

    if (await file.exists()) {
      // Serve the static file with correct MIME type
      const ext = path.extname(reqPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
      };
      set.headers['content-type'] = mimeTypes[ext] || 'application/octet-stream';
      return file;
    }

    // Serve index.html for client-side routing (SPA fallback)
    const indexPath = path.join(clientBuildPath, 'index.html');
    set.headers['content-type'] = 'text/html; charset=utf-8';
    return await Bun.file(indexPath).text();
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

// Graceful shutdown handlers
const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);

  try {
    // Stop job worker first to prevent new jobs
    jobWorker.stop();
    logger.info('Job worker stopped');

    // Close database connections
    const { closeDatabase } = await import('./db');
    await closeDatabase();

    // Stop server
    await app.stop();
    logger.info('Server stopped');

    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Export app type for Eden Treaty
export type App = typeof app;
