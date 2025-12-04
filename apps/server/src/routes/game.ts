/**
 * Game Control Routes
 * Handles game start, pause, end, and round management
 *
 * Route structure for Eden Treaty type inference:
 * - POST /api/game/:roomId/start - start game
 * - POST /api/game/:roomId/end - end game
 * - POST /api/game/:roomId/next-round - start next round
 */

import { Elysia, t } from 'elysia';
import { roomRepository, playerRepository, songRepository, gameSessionRepository } from '../repositories';
import { generateId } from '@blind-test/shared';
import { db, schema } from '../db';
import { broadcastToRoom } from '../websocket/handler';
import { gameService } from '../services/GameService';
import { logger } from '../utils/logger';
import { clearMasterPlayingStatus } from './rooms';

const apiLogger = logger.child({ module: 'API:Game' });

export const gameRoutes = new Elysia({ prefix: '/api/game' })
  // ============================================
  // Game routes (nested under /:roomId)
  // ============================================
  .group('/:roomId', (app) => app
    // Start game
    .post('/start', async ({ params: { roomId }, body, set }) => {
    const room = await roomRepository.findById(roomId);

    if (!room) {
      set.status = 404;
      return { error: 'Room not found' };
    }

    if (room.status !== 'lobby') {
      set.status = 409;
      return { error: 'Game already started' };
    }

    // If master is playing, they count as a player
    const masterPlaying = !!body.masterPlayerName;
    const playerCount = await playerRepository.countConnected(roomId);
    const effectivePlayerCount = playerCount + (masterPlaying ? 1 : 0);

    if (effectivePlayerCount < 2) {
      set.status = 400;
      return { error: 'Need at least 2 players to start' };
    }

    try {
      // Validate rounds array is provided
      if (!body.rounds || body.rounds.length === 0) {
        set.status = 400;
        return { error: 'At least one round is required. Use the round configuration system.' };
      }

      // If master is playing, validate all rounds use buzz_and_choice mode
      if (masterPlaying) {
        for (let i = 0; i < body.rounds.length; i++) {
          if (body.rounds[i].modeType !== 'buzz_and_choice') {
            set.status = 400;
            return {
              error: `Round ${i + 1} uses "${body.rounds[i].modeType}" mode which requires manual validation. When hosting and playing, only "buzz_and_choice" mode is allowed.`
            };
          }
        }
      }

      // Validate maximum 5 rounds
      if (body.rounds.length > 5) {
        set.status = 400;
        return { error: 'Maximum 5 rounds allowed' };
      }

      // Validate song count per round (max 30)
      for (let i = 0; i < body.rounds.length; i++) {
        const round = body.rounds[i];
        if (round.songFilters?.songCount && round.songFilters.songCount > 30) {
          set.status = 400;
          return { error: `Round ${i + 1}: Maximum 30 songs per round allowed` };
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
            set.status = 400;
            return { error: `No songs match filters for round ${i + 1}` };
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

      // If master is playing, create their player record (or reuse existing)
      let masterPlayerId: string | null = room.masterPlayerId || null;
      if (masterPlaying && body.masterPlayerName) {
        // Check if master player already exists (e.g., from previous game)
        if (masterPlayerId) {
          const existingMasterPlayer = await playerRepository.findById(masterPlayerId);
          if (existingMasterPlayer) {
            // Reuse existing master player, just update the name if needed
            if (existingMasterPlayer.name !== body.masterPlayerName) {
              await playerRepository.update(masterPlayerId, { name: body.masterPlayerName });
            }
            apiLogger.info('Reusing existing master player', {
              roomId,
              masterPlayerId,
              masterPlayerName: body.masterPlayerName
            });
          } else {
            // Master player ID set but player doesn't exist - create new one
            masterPlayerId = null;
          }
        }

        // Create new master player if needed
        if (!masterPlayerId) {
          const masterPlayer = await playerRepository.create({
            roomId,
            name: body.masterPlayerName,
            role: 'player', // Master plays as a regular player
          });
          masterPlayerId = masterPlayer.id;

          // Set the master player ID on the room
          await roomRepository.setMasterPlayerId(roomId, masterPlayerId);

          apiLogger.info('Master joined as player', {
            roomId,
            masterPlayerId,
            masterPlayerName: body.masterPlayerName
          });
        }
      } else if (!masterPlaying && room.masterPlayerId) {
        // Master was playing before but not anymore - clear the master player
        await roomRepository.setMasterPlayerId(roomId, null);
        // Optionally remove the master player record
        await playerRepository.delete(room.masterPlayerId);
        masterPlayerId = null;
        apiLogger.info('Master stopped playing, removed master player', { roomId });
      }

      // Update room status
      const updated = await roomRepository.update(roomId, { status: 'playing' });
      apiLogger.info('Game started', { roomId, roomName: room.name, roundCount: rounds.length });

      // Clear the in-memory master playing status (no longer needed once game starts)
      clearMasterPlayingStatus(roomId);

      // Broadcast game start FIRST - before startRound
      // This ensures clients have masterPlayerId set before the game interface renders
      const startedSession = await gameSessionRepository.findById(session.id);

      // Get updated players list (includes master player if they're playing)
      const updatedPlayers = await playerRepository.findByRoom(roomId);
      apiLogger.info('Broadcasting game:started with players', {
        roomId,
        playerCount: updatedPlayers.length,
        playerNames: updatedPlayers.map(p => ({ name: p.name, role: p.role, id: p.id })),
        masterPlayerId
      });

      broadcastToRoom(roomId, {
        type: 'game:started',
        data: {
          room: updated,
          session: startedSession || session,
          players: updatedPlayers,
        }
      });

      // Start the first round (broadcasts round:started and song:started)
      try {
        await gameService.startRound(roomId, session.id, 0);
        apiLogger.info('Round started successfully', { roomId, roundIndex: 0 });
      } catch (roundError) {
        apiLogger.error('Failed to start round', roundError, { roomId });
        // Continue anyway - game is created, round start can be retried
      }

      return {
        sessionId: session.id,
        roomId,
        status: updated.status,
        roundCount: rounds.length,
        masterPlayerId: masterPlayerId || undefined,
        message: `Game started with ${rounds.length} round${rounds.length > 1 ? 's' : ''}${masterPlaying ? ' (master playing)' : ''}`,
      };
    } catch (err) {
      apiLogger.error('Failed to start game', err, { roomId });
      set.status = 500;
      return { error: 'Failed to start game' };
    }
  }, {
    body: t.Object({
      // Master playing as a participant (optional)
      masterPlayerName: t.Optional(t.String({ minLength: 1, maxLength: 20 })),
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
  .post('/end', async ({ params: { roomId }, set }) => {
    const room = await roomRepository.findById(roomId);

    if (!room) {
      set.status = 404;
      return { error: 'Room not found' };
    }

    if (room.status !== 'playing') {
      set.status = 409;
      return { error: 'No active game to end' };
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
      set.status = 500;
      return { error: 'Failed to end game' };
    }
  })

  // Start next round (from between_rounds state)
  .post('/next-round', async ({ params: { roomId }, set }) => {
    const room = await roomRepository.findById(roomId);

    if (!room) {
      set.status = 404;
      return { error: 'Room not found' };
    }

    if (room.status !== 'between_rounds') {
      set.status = 409;
      return { error: 'Room is not in between_rounds state' };
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
      set.status = 500;
      return { error: 'Failed to start next round' };
    }
  })
  );
