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
      // Create game session
      const session = await gameSessionRepository.create({
        roomId,
      });

      // Prepare round configuration - properly typed song filters
      type SongFilterConfig = {
        genre?: string | string[];
        yearMin?: number;
        yearMax?: number;
        artistName?: string;
        songCount?: number;
        songIds?: string[];
      } | null;

      let songFilters: SongFilterConfig = null;
      let songCount = 0;

      // Priority 1: Use songFilters (metadata-based approach)
      if (body.songFilters) {
        apiLogger.debug('Using metadata filters for game start', { roomId, filters: body.songFilters });
        songFilters = body.songFilters;

        // Verify filters will return songs
        const testSongs = await songRepository.findByFilters(body.songFilters);
        if (testSongs.length === 0) {
          await gameSessionRepository.delete(session.id);
          return error(400, { error: 'No songs match the provided filters' });
        }
        songCount = testSongs.length;
      }
      // Priority 2: Use explicit songIds
      else if (body.songIds && body.songIds.length > 0) {
        apiLogger.debug('Using explicit songIds for game start', { roomId, songCount: body.songIds.length });
        // Store songIds as a filter
        songFilters = {
          songIds: body.songIds,
        };
        songCount = body.songIds.length;
      }
      // Priority 3: Random selection
      else {
        apiLogger.debug('Using random selection for game start', { roomId, songCount: body.songCount || 10 });
        songFilters = {
          songCount: body.songCount || 10,
        };

        const randomSongs = await songRepository.findByFilters(songFilters);
        if (randomSongs.length === 0) {
          await gameSessionRepository.delete(session.id);
          return error(400, { error: 'No songs available in the library' });
        }
        songCount = randomSongs.length;
      }

      // Create single round for now (Phase 3 will support multiple rounds)
      const roundId = generateId();
      await db.insert(schema.rounds).values({
        id: roundId,
        sessionId: session.id,
        index: 0,
        modeType: body.modeType || 'buzz_and_choice',
        mediaType: body.mediaType || 'music', // Default to music for MVP
        songFilters: songFilters ? JSON.stringify(songFilters) : null,
        params: body.params ? JSON.stringify(body.params) : null,
        status: 'pending',
        startedAt: null,
        endedAt: null,
        currentSongIndex: 0,
      });

      // Update room status
      const updated = await roomRepository.update(roomId, { status: 'playing' });
      apiLogger.info('Game started', { roomId, roomName: room.name, songCount });

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
        songCount,
        modeType: body.modeType || 'buzz_and_choice',
      };
    } catch (err) {
      apiLogger.error('Failed to start game', err, { roomId });
      return error(500, { error: 'Failed to start game' });
    }
  }, {
    body: t.Object({
      // Legacy playlist support
      playlistId: t.Optional(t.String()),
      songIds: t.Optional(t.Array(t.String())),

      // Metadata-based filtering (NEW - preferred approach)
      songFilters: t.Optional(t.Object({
        genre: t.Optional(t.Union([t.String(), t.Array(t.String())])),
        yearMin: t.Optional(t.Number()),
        yearMax: t.Optional(t.Number()),
        artistName: t.Optional(t.String()),
        songCount: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      })),

      // Quick filters (alternative to songFilters object)
      songCount: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      genre: t.Optional(t.Union([t.String(), t.Array(t.String())])),
      yearMin: t.Optional(t.Number()),
      yearMax: t.Optional(t.Number()),

      // Game configuration
      modeType: t.Optional(t.String()),
      mediaType: t.Optional(t.String()),
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
  });
