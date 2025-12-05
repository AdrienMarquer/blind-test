/**
 * Room Management Routes
 * Handles room creation, listing, updates, deletion, and player management
 *
 * Route structure for Eden Treaty type inference:
 * - GET /api/rooms - list all rooms
 * - POST /api/rooms - create room
 * - GET /api/rooms/code/:code - find room by code
 * - GET /api/rooms/:roomId - get room by ID
 * - PATCH /api/rooms/:roomId - update room
 * - DELETE /api/rooms/:roomId - delete room
 * - POST /api/rooms/:roomId/players - add player
 * - GET /api/rooms/:roomId/players/:playerId - get player
 * - DELETE /api/rooms/:roomId/players/:playerId - remove player
 */

import { Elysia, t } from 'elysia';
import { roomRepository, playerRepository } from '../repositories';
import { ROOM_CONFIG } from '@blind-test/shared';
import type { Room } from '@blind-test/shared';
import { validateRoomName, validatePlayerName } from '@blind-test/shared';
import { logger } from '../utils/logger';
import { gameService } from '../services/GameService';
import { broadcastToRoom } from '../websocket/handler';

const apiLogger = logger.child({ module: 'API:Rooms' });

// In-memory store for master playing status during lobby (cleared when game starts)
// Maps roomId -> { playing: boolean, playerName: string | null }
export const masterPlayingStatus = new Map<string, { playing: boolean; playerName: string | null }>();

/**
 * Get master playing status for a room
 */
export function getMasterPlayingStatus(roomId: string): { playing: boolean; playerName: string | null } {
  return masterPlayingStatus.get(roomId) || { playing: false, playerName: null };
}

/**
 * Clear master playing status (called when game starts or room is deleted)
 */
export function clearMasterPlayingStatus(roomId: string): void {
  masterPlayingStatus.delete(roomId);
}

export const roomRoutes = new Elysia({ prefix: '/api/rooms' })
  // ============================================
  // Collection routes (no roomId)
  // ============================================

  // Get all rooms
  .get('/', async ({ query }) => {
    apiLogger.info('Fetching rooms');

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
  .post('/', async ({ body, set }) => {
    try {
      const room = await roomRepository.create({
        name: body.name,
        maxPlayers: body.maxPlayers || ROOM_CONFIG.DEFAULT_MAX_PLAYERS,
        masterIp: 'localhost', // TODO: Extract from request in production
      });

      apiLogger.info('Room created', { roomId: room.id, name: room.name, code: room.code });

      return room;
    } catch (err) {
      apiLogger.error('Failed to create room', err);
      set.status = 500;
      return { error: 'Failed to create room' };
    }
  }, {
    body: t.Object({
      name: t.String({
        minLength: ROOM_CONFIG.NAME_MIN_LENGTH,
        maxLength: ROOM_CONFIG.NAME_MAX_LENGTH,
        pattern: '^[a-zA-Z0-9\\s\\-_]+$',
        error: 'Invalid room name. Must be 1-50 characters, alphanumeric, spaces, hyphens, underscores only.'
      }),
      maxPlayers: t.Optional(t.Number({
        minimum: ROOM_CONFIG.MIN_PLAYERS,
        maximum: ROOM_CONFIG.MAX_PLAYERS
      })),
    }),
  })

  // Find room by code
  .get('/code/:code', async ({ params: { code }, set }) => {
    const room = await roomRepository.findByCode(code.toUpperCase());

    if (!room) {
      apiLogger.warn('Room not found by code', { code });
      set.status = 404;
      return { error: 'Room not found' };
    }

    // Populate players
    const players = await playerRepository.findByRoom(room.id);
    room.players = players;

    apiLogger.info('Found room by code', { code, roomId: room.id, roomName: room.name });
    return room;
  })

  // ============================================
  // Individual room routes (with roomId)
  // ============================================
  .group('/:roomId', (app) => app
    // Get room by ID
    .get('/', async ({ params: { roomId }, set }) => {
      const room = await roomRepository.findById(roomId);

      if (!room) {
        apiLogger.warn('Room not found', { roomId });
        set.status = 404;
        return { error: 'Room not found' };
      }

      // Populate players
      const players = await playerRepository.findByRoom(roomId);
      room.players = players;

      apiLogger.info('Fetching room', { roomId, roomName: room.name });
      return room;
    })

    // Update room
    .patch('/', async ({ params: { roomId }, body, set }) => {
      const room = await roomRepository.findById(roomId);

      if (!room) {
        set.status = 404;
        return { error: 'Room not found' };
      }

      if (room.status !== 'lobby') {
        set.status = 400;
        return { error: 'Cannot update room while game is in progress' };
      }

      if (body.name && !validateRoomName(body.name)) {
        set.status = 400;
        return { error: 'Invalid room name' };
      }

      try {
        const updated = await roomRepository.update(roomId, body);
        apiLogger.info('Updated room', { roomId, roomName: updated.name });
        return updated;
      } catch (err) {
        apiLogger.error('Failed to update room', err, { roomId });
        set.status = 500;
        return { error: 'Failed to update room' };
      }
    }, {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
        maxPlayers: t.Optional(t.Number({ minimum: 2, maximum: 20 })),
      }),
    })

    // Delete room
    .delete('/', async ({ params: { roomId }, set }) => {
      const room = await roomRepository.findById(roomId);

      if (!room) {
        set.status = 404;
        return { error: 'Room not found' };
      }

      try {
        // If game is active, end it first to clean up timers and state
        if (room.status === 'playing') {
          apiLogger.info('Ending active game before deleting room', { roomId });
          await gameService.endGame(roomId);
        }

        // Delete all players first
        await playerRepository.deleteByRoom(roomId);
        // Delete room
        await roomRepository.delete(roomId);

        apiLogger.info('Deleted room', { roomId, roomName: room.name });
        set.status = 204;
        return;
      } catch (err) {
        apiLogger.error('Failed to delete room', err, { roomId });
        set.status = 500;
        return { error: 'Failed to delete room' };
      }
    })

    // ============================================
    // Master playing status (for lobby preview)
    // ============================================

    // Set master playing status
    .post('/master-playing', async ({ params: { roomId }, body, set }) => {
      const room = await roomRepository.findById(roomId);

      if (!room) {
        set.status = 404;
        return { error: 'Room not found' };
      }

      if (room.status !== 'lobby') {
        set.status = 400;
        return { error: 'Cannot change master playing status after game started' };
      }

      // Store master playing status
      const status: { playing: boolean; playerName: string | null } = {
        playing: body.playing,
        playerName: body.playing ? (body.playerName ?? null) : null
      };
      masterPlayingStatus.set(roomId, status);

      apiLogger.info('Master playing status updated', { roomId, ...status });

      // Broadcast to all players in the room
      broadcastToRoom(roomId, {
        type: 'master:playing',
        data: status
      });

      return status;
    }, {
      body: t.Object({
        playing: t.Boolean(),
        playerName: t.Optional(t.String({ maxLength: 20 })),
      }),
    })

    // Get master playing status
    .get('/master-playing', async ({ params: { roomId }, set }) => {
      const room = await roomRepository.findById(roomId);

      if (!room) {
        set.status = 404;
        return { error: 'Room not found' };
      }

      return getMasterPlayingStatus(roomId);
    })

    // ============================================
    // Player routes (nested under /:roomId/players)
    // ============================================
    .group('/players', (app) => app
      // Add player to room
      .post('/', async ({ params: { roomId }, body, set }) => {
        const room = await roomRepository.findById(roomId);

        if (!room) {
          set.status = 404;
          return { error: 'Room not found' };
        }

        if (room.status !== 'lobby') {
          set.status = 400;
          return { error: 'Cannot join - game already in progress' };
        }

        if (!validatePlayerName(body.name)) {
          set.status = 400;
          return { error: 'Pseudo invalide. Utilise 1-20 caractères (pas de < ou >).' };
        }

        // Check if room is full
        const playerCount = await playerRepository.countConnected(roomId);
        if (playerCount >= room.maxPlayers) {
          set.status = 400;
          return { error: 'Room is full' };
        }

        // Check for duplicate name
        const existing = await playerRepository.findByRoomAndName(roomId, body.name);
        if (existing) {
          set.status = 400;
          return { error: 'Name already taken in this room' };
        }

        try {
          const player = await playerRepository.create({
            roomId,
            name: body.name,
            role: 'player',
          });

          apiLogger.info('Added player to room', { roomId, playerId: player.id, playerName: player.name });

          // Broadcast player join event to all connected WebSocket clients
          broadcastToRoom(roomId, {
            type: 'player:joined',
            data: { player, room }
          });

          return player;
        } catch (err) {
          apiLogger.error('Failed to add player', err, { roomId });
          set.status = 500;
          return { error: 'Failed to add player' };
        }
      }, {
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 20 }),
        }),
      })

      // Get player info
      .get('/:playerId', async ({ params: { roomId, playerId }, set }) => {
        const player = await playerRepository.findById(playerId);

        if (!player || player.roomId !== roomId) {
          set.status = 404;
          return { error: 'Player not found' };
        }

        return player;
      })

      // Remove player from room
      .delete('/:playerId', async ({ params: { roomId, playerId }, set }) => {
        const player = await playerRepository.findById(playerId);

        if (!player || player.roomId !== roomId) {
          set.status = 404;
          return { error: 'Player not found' };
        }

        try {
          await playerRepository.delete(playerId);
          apiLogger.info('Removed player from room', { roomId, playerId, playerName: player.name });

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

          set.status = 204;
          return;
        } catch (err) {
          apiLogger.error('Failed to remove player', err, { roomId, playerId });
          set.status = 500;
          return { error: 'Failed to remove player' };
        }
      })
    )
  );
