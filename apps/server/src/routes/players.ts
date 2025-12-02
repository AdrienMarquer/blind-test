/**
 * Player Management Routes
 * Handles adding, removing, and retrieving players
 */

import { Elysia, t } from 'elysia';
import { roomRepository, playerRepository } from '../repositories';
import { validatePlayerName } from '@blind-test/shared';
import { broadcastToRoom } from '../websocket/handler';
import { logger } from '../utils/logger';

const apiLogger = logger.child({ module: 'API:Players' });

export const playerRoutes = new Elysia({ prefix: '/api/rooms/:roomId/players' })
  // Add player to room
  .post('/', async ({ params: { roomId }, body, error }) => {
    const room = await roomRepository.findById(roomId);

    if (!room) {
      return error(404, { error: 'Room not found' });
    }

    if (room.status !== 'lobby') {
      return error(400, { error: 'Cannot join - game already in progress' });
    }

    if (!validatePlayerName(body.name)) {
      return error(400, { error: 'Pseudo invalide. Utilise 1-20 caractères (pas de < ou >).' });
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

      apiLogger.info('Added player to room', { roomId, playerId: player.id, playerName: player.name });

      // Broadcast player join event to all connected WebSocket clients
      broadcastToRoom(roomId, {
        type: 'player:joined',
        data: { player, room }
      });

      return player;
    } catch (err) {
      apiLogger.error('Failed to add player', err, { roomId });
      return error(500, { error: 'Failed to add player' });
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 1, maxLength: 20 }),
    }),
  })

  // Get player info
  .get('/:playerId', async ({ params: { roomId, playerId }, error }) => {
    const player = await playerRepository.findById(playerId);

    if (!player || player.roomId !== roomId) {
      return error(404, { error: 'Player not found' });
    }

    return player;
  })

  // Remove player from room
  .delete('/:playerId', async ({ params: { roomId, playerId }, error }) => {
    const player = await playerRepository.findById(playerId);

    if (!player || player.roomId !== roomId) {
      return error(404, { error: 'Player not found' });
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

      return new Response(null, { status: 204 });
    } catch (err) {
      apiLogger.error('Failed to remove player', err, { roomId, playerId });
      return error(500, { error: 'Failed to remove player' });
    }
  });
