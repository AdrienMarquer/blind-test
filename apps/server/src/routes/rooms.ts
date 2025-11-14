/**
 * Room Management Routes
 * Handles room creation, listing, updates, and deletion
 */

import { Elysia, t } from 'elysia';
import { roomRepository, playerRepository } from '../repositories';
import { ROOM_CONFIG } from '@blind-test/shared';
import type { Room } from '@blind-test/shared';
import { validateRoomName } from '@blind-test/shared';
import { logger } from '../utils/logger';
import { gameService } from '../services/GameService';

const apiLogger = logger.child({ module: 'API:Rooms' });

export const roomRoutes = new Elysia({ prefix: '/api/rooms' })
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

  // Find room by code
  .get('/code/:code', async ({ params: { code }, error }) => {
    const room = await roomRepository.findByCode(code.toUpperCase());

    if (!room) {
      apiLogger.warn('Room not found by code', { code });
      return error(404, { error: 'Room not found' });
    }

    // Populate players
    const players = await playerRepository.findByRoom(room.id);
    room.players = players;

    apiLogger.info('Found room by code', { code, roomId: room.id, roomName: room.name });
    return room;
  })

  // Create new room
  .post('/', async ({ body, error }) => {
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
      return error(500, { error: 'Failed to create room' });
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

  // Get room by ID
  .get('/:roomId', async ({ params: { roomId }, error }) => {
    const room = await roomRepository.findById(roomId);

    if (!room) {
      apiLogger.warn('Room not found', { roomId });
      return error(404, { error: 'Room not found' });
    }

    // Populate players
    const players = await playerRepository.findByRoom(roomId);
    room.players = players;

    apiLogger.info('Fetching room', { roomId, roomName: room.name });
    return room;
  })

  // Update room
  .patch('/:roomId', async ({ params: { roomId }, body, error }) => {
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
      apiLogger.info('Updated room', { roomId, roomName: updated.name });
      return updated;
    } catch (err) {
      apiLogger.error('Failed to update room', err, { roomId });
      return error(500, { error: 'Failed to update room' });
    }
  }, {
    body: t.Object({
      name: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
      maxPlayers: t.Optional(t.Number({ minimum: 2, maximum: 20 })),
    }),
  })

  // Delete room
  .delete('/:roomId', async ({ params: { roomId }, error }) => {
    const room = await roomRepository.findById(roomId);

    if (!room) {
      return error(404, { error: 'Room not found' });
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
      return new Response(null, { status: 204 });
    } catch (err) {
      apiLogger.error('Failed to delete room', err, { roomId });
      return error(500, { error: 'Failed to delete room' });
    }
  });
