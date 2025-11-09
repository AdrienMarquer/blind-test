/**
 * Blind Test - Main Server
 * Elysia REST API + WebSockets
 */

import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { roomRepository, playerRepository } from './repositories';
import { handleWebSocket, handleMessage, handleClose, broadcastToRoom } from './websocket/handler';
import { validateRoomName, validatePlayerName } from '@blind-test/shared';
import type { Room, Player } from '@blind-test/shared';

// Initialize Elysia app
const app = new Elysia()
  .use(cors())
  .get('/', () => {
    return {
      message: 'Blind Test API Server',
      status: 'running',
      version: '1.0.0',
      websocket: 'enabled',
    };
  })

  // ========================================================================
  // Room Endpoints
  // ========================================================================

  // Get all rooms
  .get('/api/rooms', async ({ query }) => {
    console.log('[GET /api/rooms] Fetching rooms');

    let rooms: Room[];

    if (query.status) {
      rooms = await roomRepository.findByStatus(query.status as Room['status']);
    } else {
      rooms = await roomRepository.findAll();
    }

    return {
      rooms,
      total: rooms.length,
    };
  }, {
    query: t.Optional(t.Object({
      status: t.Optional(t.String()),
    })),
  })

  // Create new room
  .post('/api/rooms', async ({ body, error }) => {
    // Validate room name
    if (!validateRoomName(body.name)) {
      return error(400, {
        error: 'Invalid room name. Must be 1-50 characters, alphanumeric, spaces, hyphens, underscores only.',
      });
    }

    try {
      const room = await roomRepository.create({
        name: body.name,
        maxPlayers: body.maxPlayers || 8,
        masterIp: 'localhost', // TODO: Extract from request in production
      });

      console.log(`[POST /api/rooms] Created room: ${room.name} (code: ${room.code})`);

      return room;
    } catch (err) {
      console.error('[POST /api/rooms] Error:', err);
      return error(500, { error: 'Failed to create room' });
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 1, maxLength: 50 }),
      maxPlayers: t.Optional(t.Number({ minimum: 2, maximum: 20 })),
    }),
  })

  // Get room by ID
  .get('/api/rooms/:roomId', async ({ params: { roomId }, error }) => {
    const room = await roomRepository.findById(roomId);

    if (!room) {
      console.log(`[GET /api/rooms/${roomId}] Room not found`);
      return error(404, { error: 'Room not found' });
    }

    // Populate players
    const players = await playerRepository.findByRoom(roomId);
    room.players = players;

    console.log(`[GET /api/rooms/${roomId}] Fetching room: ${room.name}`);
    return room;
  })

  // Update room
  .patch('/api/rooms/:roomId', async ({ params: { roomId }, body, error }) => {
    const room = await roomRepository.findById(roomId);

    if (!room) {
      return error(404, { error: 'Room not found' });
    }

    if (room.status !== 'lobby') {
      return error(400, { error: 'Cannot update room while game is in progress' });
    }

    if (body.name && !validateRoomName(body.name)) {
      return error(400, { error: 'Invalid room name' });
    }

    try {
      const updated = await roomRepository.update(roomId, body);
      console.log(`[PATCH /api/rooms/${roomId}] Updated room: ${updated.name}`);
      return updated;
    } catch (err) {
      console.error(`[PATCH /api/rooms/${roomId}] Error:`, err);
      return error(500, { error: 'Failed to update room' });
    }
  }, {
    body: t.Object({
      name: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
      maxPlayers: t.Optional(t.Number({ minimum: 2, maximum: 20 })),
    }),
  })

  // Delete room
  .delete('/api/rooms/:roomId', async ({ params: { roomId }, error }) => {
    const room = await roomRepository.findById(roomId);

    if (!room) {
      return error(404, { error: 'Room not found' });
    }

    try {
      // Delete all players first
      await playerRepository.deleteByRoom(roomId);
      // Delete room
      await roomRepository.delete(roomId);

      console.log(`[DELETE /api/rooms/${roomId}] Deleted room: ${room.name}`);
      return new Response(null, { status: 204 });
    } catch (err) {
      console.error(`[DELETE /api/rooms/${roomId}] Error:`, err);
      return error(500, { error: 'Failed to delete room' });
    }
  })

  // ========================================================================
  // Player Endpoints
  // ========================================================================

  // Add player to room
  .post('/api/rooms/:roomId/players', async ({ params: { roomId }, body, error }) => {
    const room = await roomRepository.findById(roomId);

    if (!room) {
      return error(404, { error: 'Room not found' });
    }

    if (room.status !== 'lobby') {
      return error(400, { error: 'Cannot join - game already in progress' });
    }

    if (!validatePlayerName(body.name)) {
      return error(400, { error: 'Invalid player name. Must be 1-20 characters, alphanumeric and spaces only.' });
    }

    // Check if room is full
    const playerCount = await playerRepository.countConnected(roomId);
    if (playerCount >= room.maxPlayers) {
      return error(400, { error: 'Room is full' });
    }

    // Check for duplicate name
    const existing = await playerRepository.findByRoomAndName(roomId, body.name);
    if (existing) {
      return error(400, { error: 'Name already taken in this room' });
    }

    try {
      const player = await playerRepository.create({
        roomId,
        name: body.name,
        role: 'player',
      });

      console.log(`[POST /api/rooms/${roomId}/players] Added player: ${player.name}`);

      // Broadcast player join event to all connected WebSocket clients
      broadcastToRoom(roomId, {
        type: 'player:joined',
        data: { player, room }
      });

      return player;
    } catch (err) {
      console.error(`[POST /api/rooms/${roomId}/players] Error:`, err);
      return error(500, { error: 'Failed to add player' });
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 1, maxLength: 20 }),
    }),
  })

  // Get player info
  .get('/api/rooms/:roomId/players/:playerId', async ({ params: { roomId, playerId }, error }) => {
    const player = await playerRepository.findById(playerId);

    if (!player || player.roomId !== roomId) {
      return error(404, { error: 'Player not found' });
    }

    return player;
  })

  // Remove player from room
  .delete('/api/rooms/:roomId/players/:playerId', async ({ params: { roomId, playerId }, error }) => {
    const player = await playerRepository.findById(playerId);

    if (!player || player.roomId !== roomId) {
      return error(404, { error: 'Player not found' });
    }

    try {
      await playerRepository.delete(playerId);
      console.log(`[DELETE /api/rooms/${roomId}/players/${playerId}] Removed player: ${player.name}`);

      // Broadcast player left event to all connected WebSocket clients
      const remainingPlayers = await playerRepository.countConnected(roomId);
      broadcastToRoom(roomId, {
        type: 'player:left',
        data: {
          playerId: player.id,
          playerName: player.name,
          remainingPlayers
        }
      });

      return new Response(null, { status: 204 });
    } catch (err) {
      console.error(`[DELETE /api/rooms/${roomId}/players/${playerId}] Error:`, err);
      return error(500, { error: 'Failed to remove player' });
    }
  })

  // ========================================================================
  // Game Control Endpoints (Stubs for future phases)
  // ========================================================================

  // Start game
  .post('/api/game/:roomId/start', async ({ params: { roomId }, error }) => {
    const room = await roomRepository.findById(roomId);

    if (!room) {
      return error(404, { error: 'Room not found' });
    }

    if (room.status !== 'lobby') {
      return error(409, { error: 'Game already started' });
    }

    const playerCount = await playerRepository.countConnected(roomId);
    if (playerCount < 2) {
      return error(400, { error: 'Need at least 2 players to start' });
    }

    try {
      // TODO: Implement game session creation in Phase 2
      const updated = await roomRepository.update(roomId, { status: 'playing' });
      console.log(`[POST /api/game/${roomId}/start] Game started for room: ${room.name}`);

      return {
        sessionId: 'placeholder', // Will be implemented in Phase 2
        roomId,
        status: updated.status,
        message: 'Game start will be fully implemented in Phase 2',
      };
    } catch (err) {
      console.error(`[POST /api/game/${roomId}/start] Error:`, err);
      return error(500, { error: 'Failed to start game' });
    }
  })

  // WebSocket endpoint for room connections
  .ws('/ws/rooms/:roomId', {
    params: t.Object({
      roomId: t.String()
    }),
    open(ws) {
      // Extract roomId from route params
      const roomId = ws.data?.params?.roomId;

      if (!roomId) {
        console.error('No roomId found in WebSocket connection');
        ws.close();
        return;
      }

      // Store roomId in ws.data for access in message handlers
      ws.data.roomId = roomId;
      handleWebSocket(ws);
    },
    message(ws, message) {
      handleMessage(ws, typeof message === 'string' ? message : JSON.stringify(message));
    },
    close(ws) {
      handleClose(ws);
    }
  })

  .listen(3007);

console.log(
  `🎵 Blind Test Server is running at http://${app.server?.hostname}:${app.server?.port}`
);
console.log(`📡 WebSocket server ready on ws://${app.server?.hostname}:${app.server?.port}`);

// Export app type for Eden Treaty
export type App = typeof app;
