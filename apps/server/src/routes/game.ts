/**
 * Game Control Routes
 * Handles game start, pause, end, and round management
 */

import { Elysia, t } from 'elysia';
import { roomRepository, playerRepository, songRepository, gameSessionRepository } from '../repositories';
import { generateId } from '@blind-test/shared';
import { db, schema } from '../db';
import { broadcastToRoom } from '../websocket/handler';
import { gameService } from '../services/GameService';
import { logger } from '../utils/logger';

const apiLogger = logger.child({ module: 'API:Game' });

export const gameRoutes = new Elysia({ prefix: '/api/game/:roomId' })
  // Start game
  .post('/start', async ({ params: { roomId }, body, error }) => {
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
      // Validate rounds array is provided
      if (!body.rounds || body.rounds.length === 0) {
        return error(400, { error: 'At least one round is required. Use the round configuration system.' });
      }

      // Validate maximum 5 rounds
      if (body.rounds.length > 5) {
        return error(400, { error: 'Maximum 5 rounds allowed' });
      }

      // Validate song count per round (max 30)
      for (let i = 0; i < body.rounds.length; i++) {
        const round = body.rounds[i];
        if (round.songFilters?.songCount && round.songFilters.songCount > 30) {
          return error(400, { error: `Round ${i + 1}: Maximum 30 songs per round allowed` });
        }
      }

      // Create game session
      const session = await gameSessionRepository.create({
        roomId,
      });

      const rounds = body.rounds;

      apiLogger.info('🎮 Creating game with rounds configuration', {
        roomId,
        totalRounds: rounds.length,
        rounds: rounds.map((r: any, i: number) => ({
          index: i,
          mode: r.modeType,
          media: r.mediaType,
          songCount: r.songFilters?.songCount,
          songFilters: r.songFilters
        }))
      });

      // Create all rounds
      for (let i = 0; i < rounds.length; i++) {
        const roundConfig = rounds[i];
        const roundId = generateId();

        // Verify filters will return songs if provided
        if (roundConfig.songFilters) {
          const testSongs = await songRepository.findByFilters(roundConfig.songFilters);
          apiLogger.debug('Song filter test', {
            roundIndex: i,
            filters: roundConfig.songFilters,
            matchedSongs: testSongs.length
          });
          if (testSongs.length === 0) {
            await gameSessionRepository.delete(session.id);
            return error(400, { error: `No songs match filters for round ${i + 1}` });
          }
        }

        await db.insert(schema.rounds).values({
          id: roundId,
          sessionId: session.id,
          index: i,
          modeType: roundConfig.modeType,
          mediaType: roundConfig.mediaType,
          songFilters: roundConfig.songFilters || null,
          params: roundConfig.params || null,
          status: 'pending',
          startedAt: null,
          endedAt: null,
          currentSongIndex: 0,
        });

        apiLogger.debug('Round created', {
          roundId,
          roundIndex: i,
          modeType: roundConfig.modeType,
          songCount: roundConfig.songFilters?.songCount
        });
      }

      // Update room status
      const updated = await roomRepository.update(roomId, { status: 'playing' });
      apiLogger.info('Game started', { roomId, roomName: room.name, roundCount: rounds.length });

      // Start the first round
      try {
        await gameService.startRound(roomId, session.id, 0);
        apiLogger.info('Round started successfully', { roomId, roundIndex: 0 });
      } catch (roundError) {
        apiLogger.error('Failed to start round', roundError, { roomId });
        // Continue anyway - game is created, round start can be retried
      }

      // Broadcast game start to all connected WebSocket clients
      broadcastToRoom(roomId, {
        type: 'game:started',
        data: {
          room: updated,
          session: await gameSessionRepository.findById(session.id),
        }
      });

      return {
        sessionId: session.id,
        roomId,
        status: updated.status,
        roundCount: rounds.length,
        message: `Game started with ${rounds.length} round${rounds.length > 1 ? 's' : ''}`,
      };
    } catch (err) {
      apiLogger.error('Failed to start game', err, { roomId });
      return error(500, { error: 'Failed to start game' });
    }
  }, {
    body: t.Object({
      // Multi-round configuration (REQUIRED, max 5 rounds)
      rounds: t.Array(t.Object({
        modeType: t.String(),
        mediaType: t.String(),
        songFilters: t.Optional(t.Object({
          genre: t.Optional(t.Union([t.String(), t.Array(t.String())])),
          yearMin: t.Optional(t.Number()),
          yearMax: t.Optional(t.Number()),
          artistName: t.Optional(t.String()),
          songCount: t.Optional(t.Number({ minimum: 1, maximum: 30 })),
          songIds: t.Optional(t.Array(t.String())),
        })),
        params: t.Optional(t.Object({
          // Universal parameters
          songDuration: t.Optional(t.Number()),
          answerTimer: t.Optional(t.Number()),
          audioPlayback: t.Optional(t.Union([t.Literal('master'), t.Literal('players'), t.Literal('all')])),

          // Buzz + Choice specific
          numChoices: t.Optional(t.Number()),
          pointsTitle: t.Optional(t.Number()),
          pointsArtist: t.Optional(t.Number()),
          penaltyEnabled: t.Optional(t.Boolean()),
          penaltyAmount: t.Optional(t.Number()),
          allowRebuzz: t.Optional(t.Boolean()),

          // Fast Buzz specific
          manualValidation: t.Optional(t.Boolean()),

          // Text Input specific
          fuzzyMatch: t.Optional(t.Boolean()),
          levenshteinDistance: t.Optional(t.Number()),
        })),
      })),
    }),
  })

  // End game manually
  .post('/end', async ({ params: { roomId }, error }) => {
    const room = await roomRepository.findById(roomId);

    if (!room) {
      return error(404, { error: 'Room not found' });
    }

    if (room.status !== 'playing') {
      return error(409, { error: 'No active game to end' });
    }

    try {
      // Force end the current game
      await gameService.endGame(roomId);

      apiLogger.info('Game ended manually', { roomId, roomName: room.name });

      return {
        roomId,
        status: 'finished',
        message: 'Game ended successfully',
      };
    } catch (err) {
      apiLogger.error('Failed to end game', err, { roomId });
      return error(500, { error: 'Failed to end game' });
    }
  })

  // Start next round (from between_rounds state)
  .post('/next-round', async ({ params: { roomId }, error }) => {
    const room = await roomRepository.findById(roomId);

    if (!room) {
      return error(404, { error: 'Room not found' });
    }

    if (room.status !== 'between_rounds') {
      return error(409, { error: 'Room is not in between_rounds state' });
    }

    try {
      await gameService.startNextRound(roomId);

      apiLogger.info('Started next round', { roomId, roomName: room.name });

      return {
        roomId,
        status: 'playing',
        message: 'Next round started successfully',
      };
    } catch (err) {
      apiLogger.error('Failed to start next round', err, { roomId });
      return error(500, { error: 'Failed to start next round' });
    }
  });
