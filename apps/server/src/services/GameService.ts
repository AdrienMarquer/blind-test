/**
 * Game Service - Game State Machine
 *
 * Manages game flow, state transitions, and coordinates between:
 * - Mode handlers (gameplay rules)
 * - Media handlers (content delivery)
 * - Repositories (data persistence)
 * - WebSocket (real-time communication)
 */

import type { GameSession, Round, RoundSong, Song, Answer } from '@blind-test/shared';
import { SYSTEM_DEFAULTS } from '@blind-test/shared';
import { gameSessionRepository, songRepository, playerRepository, roomRepository } from '../repositories';
import { modeRegistry } from '../modes';
import { broadcastToRoom } from '../websocket/handler';
import { gameStateManager } from './GameStateManager';
import { getSongDuration, getAnswerTimer, getAudioPlayback } from '../utils/params';
import { timerManager } from './TimerManager';
import { logger } from '../utils/logger';

const gameLogger = logger.child({ module: 'GameService' });

// Get public URL for audio streaming (use env var in production, fallback to localhost)
const getPublicUrl = () => {
  const publicUrl = process.env.PUBLIC_URL;
  if (publicUrl) return publicUrl.replace(/\/$/, ''); // Remove trailing slash
  return `http://localhost:${process.env.PORT || 3007}`;
};

export class GameService {

  /**
   * Start a round - transition from lobby to playing
   */
  async startRound(roomId: string, sessionId: string, roundIndex: number): Promise<Round> {
    gameLogger.info('Starting round', { roomId, sessionId, roundIndex });

    // CRITICAL FIX: Check if session exists in memory first
    // to preserve round statuses from previous rounds.
    // If we fetch from DB, all rounds come back as 'pending' which causes
    // the game to cycle back to round 1 instead of advancing.
    let session = gameStateManager.getActiveSession(roomId);
    const isFirstRound = !session;

    if (!session) {
      // First round - fetch from database
      session = await gameSessionRepository.findById(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
    }

    const round = session.rounds[roundIndex];
    if (!round) {
      throw new Error(`Round ${roundIndex} not found in session ${sessionId}`);
    }

    // Get mode handler
    const modeHandler = modeRegistry.get(round.modeType);

    // Initialize round
    await modeHandler.startRound(round);

    // Load songs for the round
    const songs = await this.loadRoundSongs(round);
    round.songs = songs;
    round.status = 'active';
    round.startedAt = new Date();

    // Initialize scores map if not already set
    if (!round.scores) {
      round.scores = new Map<string, number>();
    }

    // Register or update in state manager
    if (isFirstRound) {
      // First round: register the full session
      gameStateManager.setActiveSession(roomId, session, round);
    } else {
      // Subsequent rounds: just update the current round without overwriting session
      gameStateManager.updateRound(roomId, round);
    }

    // Start first song
    await this.startSong(roomId, round, 0);

    // Get updated room to send with round:started event
    const updatedRoom = await roomRepository.findById(roomId);

    // Broadcast round started with updated room
    broadcastToRoom(roomId, {
      type: 'round:started',
      data: {
        room: updatedRoom,
        roundIndex: round.index,
        modeType: round.modeType,
        mediaType: round.mediaType,
        songCount: round.songs.length,
      },
    });

    return round;
  }

  /**
   * Load songs for a round using metadata filters or legacy playlist
   */
  private async loadRoundSongs(round: Round): Promise<RoundSong[]> {
    gameLogger.debug('Loading songs for round', { roundIndex: round.index });

    let songs: Song[] = [];

    if (round.songFilters && Object.keys(round.songFilters).length > 0) {
      gameLogger.debug('Using song filters', { roundIndex: round.index, filters: round.songFilters });

      // Handle explicit songIds
      if (round.songFilters.songIds && Array.isArray(round.songFilters.songIds)) {
        gameLogger.debug('Loading explicit songs', { roundIndex: round.index, count: round.songFilters.songIds.length });
        songs = await songRepository.findByIds(round.songFilters.songIds);
      }
      // Handle metadata filters
      else {
        songs = await songRepository.findByFilters(round.songFilters);
      }

      if (songs.length === 0) {
        throw new Error(`No songs found matching filters: ${JSON.stringify(round.songFilters)}`);
      }
    }
    // No filters provided
    else {
      throw new Error(`Round ${round.index} has no songFilters configured`);
    }

    gameLogger.info('Loaded songs for round', { roundIndex: round.index, songCount: songs.length });

    // Create RoundSong objects
    const roundSongs: RoundSong[] = songs.map((song, index) => ({
      songId: song.id,
      song: song,
      index,
      status: 'pending',
      lockedOutPlayerIds: [],
      answers: [],
    }));

    return roundSongs;
  }

  /**
   * Start a specific song in the round
   */
  async startSong(roomId: string, round: Round, songIndex: number): Promise<void> {
    gameLogger.info('Starting song', { roomId, roundIndex: round.index, songIndex });

    const song = round.songs[songIndex];
    if (!song) {
      throw new Error(`Song ${songIndex} not found in round ${round.index}`);
    }

    // Only skip loading screen for the very first song of the very first round
    // All other cases (between songs, between rounds) should show loading screen
    const isVeryFirstSong = songIndex === 0 && round.index === 0;

    if (!isVeryFirstSong) {
      // Show loading screen for: between songs, or first song of new rounds
      gameLogger.info('Broadcasting song:preparing event', {
        roomId,
        roundIndex: round.index,
        songIndex,
        genre: song.song.genre,
        year: song.song.year,
        reason: songIndex === 0 ? 'new_round_start' : 'between_songs'
      });

      broadcastToRoom(roomId, {
        type: 'song:preparing',
        data: {
          songIndex,
          genre: song.song.genre,
          year: song.song.year,
          countdown: 6, // 6 seconds countdown
        },
      });

      // Wait 6 seconds for the loading screen
      await new Promise(resolve => setTimeout(resolve, 6000));

      gameLogger.info('Loading screen complete, starting song playback', {
        roomId,
        songIndex
      });
    } else {
      gameLogger.info('Very first song of game - skipping loading screen for immediate start', {
        roomId,
        roundIndex: round.index,
        songIndex
      });
    }

    // Get mode and media handlers
    const modeHandler = modeRegistry.get(round.modeType);
    const allSongs = round.songs.map(rs => rs.song);

    // Initialize song (generate choices, etc.)
    // Note: BuzzAndChoiceMode handles its own answer generation internally
    await modeHandler.startSong(song, allSongs, round.mediaType);

    // Update song status
    song.status = 'playing';
    song.startedAt = new Date();
    round.currentSongIndex = songIndex;

    // Update state
    gameStateManager.updateRound(roomId, round);

    // Construct audio streaming URL
    const audioUrl = `${getPublicUrl()}/api/songs/${song.song.id}/stream`;

    // Start song duration timer - resolve parameters using inheritance chain
    const songDuration = getSongDuration(round, modeHandler);
    timerManager.startSongTimer(roomId, round, songIndex, songDuration, this.handleSongTimerExpired.bind(this));

    // Broadcast song started (includes song info for master)
    broadcastToRoom(roomId, {
      type: 'song:started',
      data: {
        songIndex,
        duration: songDuration,
        audioUrl,
        clipStart: song.song.clipStart,
        audioPlayback: getAudioPlayback(round, modeHandler),
        // Song info for master display (players should ignore these)
        songTitle: song.song.title,
        songArtist: song.song.artist,
      },
    });
  }

  /**
   * Callback when song timer expires
   */
  private async handleSongTimerExpired(roomId: string, round: Round, songIndex: number): Promise<void> {
    gameLogger.info('Song timer expired', { roomId, songIndex });

    // Check if song is still active
    const currentRound = gameStateManager.getCurrentRound(roomId);
    if (currentRound && currentRound.currentSongIndex === songIndex) {
      const song = currentRound.songs[songIndex];
      if (song && song.status !== 'finished') {
        // Check if song should end (may need activePlayerCount for locked-out check)
        const modeHandler = modeRegistry.get(currentRound.modeType);
        const activePlayerCount = await playerRepository.countConnected(roomId);

        if (modeHandler.shouldEndSong(song, activePlayerCount)) {
          // Timer expired - auto-end song
          await this.endSong(roomId, currentRound, songIndex);
        } else {
          // Song should continue (shouldn't happen with timer expiry, but safety check)
          gameLogger.warn('Song timer expired but shouldEndSong returned false', {
            roomId,
            songIndex,
            songStatus: song.status
          });
          await this.endSong(roomId, currentRound, songIndex);
        }
      }
    }
  }

  /**
   * Callback when answer timer expires
   */
  private async handleAnswerTimerExpired(roomId: string, round: Round, songIndex: number, playerId: string): Promise<void> {
    gameLogger.info('Answer timer expired', { roomId, songIndex, playerId });

    // Check if player is still answering
    const currentRound = gameStateManager.getCurrentRound(roomId);
    if (currentRound && currentRound.currentSongIndex === songIndex) {
      const song = currentRound.songs[songIndex];
      if (song && song.activePlayerId === playerId) {
        const modeHandler = modeRegistry.get(currentRound.modeType);

        // Check if player had already answered artist correctly
        // If so, they've won the song - title is just bonus points
        const artistAnswer = song.answers.find(a => a.playerId === playerId && a.type === 'artist');
        const artistWasCorrect = artistAnswer?.isCorrect || false;

        // Get player name for notifications
        const player = await playerRepository.findById(playerId);
        const playerName = player?.name || 'Unknown Player';

        if (artistWasCorrect) {
          // Artist was correct - player wins, title timeout just means no bonus
          gameLogger.info('Title timer expired but artist was correct - player wins', {
            roomId,
            playerId,
            playerName,
            artistPoints: artistAnswer?.pointsAwarded || 0
          });

          // Notify about title timeout (no bonus points)
          broadcastToRoom(roomId, {
            type: 'answer:result',
            data: {
              playerId,
              playerName,
              answerType: 'title' as const,
              isCorrect: false,
              pointsAwarded: 0,
              shouldShowTitleChoices: false,
              lockOutPlayer: false, // Not locked out - they won!
              message: 'Temps écoulé ! Tu gardes ton point artiste.',
            },
          });

          // End the song - this player won with artist points
          await this.endSong(roomId, currentRound, songIndex);
        } else {
          // Artist was wrong or not answered - lock out and let others buzz
          song.lockedOutPlayerIds.push(playerId);
          song.activePlayerId = undefined;
          song.status = 'playing';
          // Clear buzz timestamps so other players can buzz
          if (song.buzzTimestamps) {
            song.buzzTimestamps.clear();
          }

          gameStateManager.updateRound(roomId, currentRound);

          // Resume song timer if it was paused (for modes that pause on buzz)
          if (modeHandler.shouldPauseOnBuzz()) {
            timerManager.resumeSongTimer(roomId);
            gameLogger.debug('Song timer resumed after answer timeout', { roomId, playerId });
          }

          // Notify timeout
          broadcastToRoom(roomId, {
            type: 'answer:result',
            data: {
              playerId,
              playerName,
              answerType: 'title' as const,
              isCorrect: false,
              pointsAwarded: 0,
              shouldShowTitleChoices: false,
              lockOutPlayer: true,
            },
          });

          // Check if we should end song (all players locked out)
          const activePlayerCount = await playerRepository.countConnected(roomId);
          if (modeHandler.shouldEndSong(song, activePlayerCount)) {
            await this.endSong(roomId, currentRound, songIndex);
          }
        }
      }
    }
  }

  /**
   * Handle player buzz
   */
  async handleBuzz(roomId: string, songIndex: number, playerId: string, buzzTimestamp?: number): Promise<boolean> {
    const timestamp = buzzTimestamp || Date.now();
    gameLogger.debug('Player buzzed', { roomId, songIndex, playerId, timestamp });

    // Get current round
    const round = gameStateManager.getCurrentRound(roomId);
    if (!round) {
      gameLogger.error('No active round for buzz', { roomId });
      return false;
    }

    const song = round.songs[songIndex];
    if (!song) {
      gameLogger.error('Song not found for buzz', { roomId, songIndex });
      return false;
    }

    const modeHandler = modeRegistry.get(round.modeType);

    // Check if player can buzz
    if (!modeHandler.canBuzz(playerId, song)) {
      gameLogger.debug('Buzz rejected', { roomId, playerId, songIndex });
      return false;
    }

    // Handle the buzz with timestamp for race condition resolution
    const accepted = await modeHandler.handleBuzz(playerId, song, timestamp);

    if (accepted) {
      // Calculate answer timer (used for both timer start and broadcast)
      const answerTime = getAnswerTimer(round, modeHandler);

      // Pause song timer if mode requires it (player needs time to answer)
      if (modeHandler.shouldPauseOnBuzz()) {
        timerManager.pauseSongTimer(roomId);
        gameLogger.debug('Song timer paused for buzz', { roomId, playerId });
      }

      // Start answer timer for automatic validation modes (player has time limit to answer)
      // Manual validation modes (fast_buzz) don't need this - master validates when ready
      if (!modeHandler.requiresManualValidation()) {
        timerManager.startAnswerTimer(roomId, round, songIndex, playerId, answerTime, this.handleAnswerTimerExpired.bind(this));
        gameLogger.debug('Answer timer started (automatic validation)', { roomId, playerId, answerTime });
      }

      // Update state
      gameStateManager.updateRound(roomId, round);

      // Get player name for broadcast
      const player = await playerRepository.findById(playerId);
      const playerName = player?.name || 'Unknown Player';

      // Get mode-specific buzz payload from the mode handler
      const modePayload = modeHandler.getBuzzPayload(song);

      if (!modePayload) {
        gameLogger.error('Mode handler rejected buzz - payload could not be created', {
          roomId,
          playerId,
          songIndex,
          modeType: round.modeType,
          songId: song.song.id,
          songTitle: song.song.title
        });
        // Mode handler explicitly rejected this buzz
        return false;
      }

      gameLogger.info('Broadcasting buzz event', {
        roomId,
        playerId,
        playerName,
        songIndex,
        modeType: round.modeType,
        hasTitleQuestion: !!(modePayload.titleQuestion),
        correctSongTitle: song.song.title,
        correctSongArtist: song.song.artist || 'Unknown Artist'
      });

      // Broadcast buzz to all clients with mode-specific payload
      broadcastToRoom(roomId, {
        type: 'player:buzzed',
        data: {
          playerId,
          playerName,
          songIndex,
          modeType: round.modeType,
          manualValidation: modeHandler.requiresManualValidation(), // Mode determines if master validates
          answerTimer: answerTime, // Initial timer value so client displays correct countdown immediately
          ...modePayload, // Mode-specific data (e.g., titleQuestion)
        },
      });
    }

    return accepted;
  }

  /**
   * Handle player answer
   */
  async handleAnswer(roomId: string, playerId: string, answer: Answer): Promise<void> {
    gameLogger.debug('Player answered', { roomId, playerId, answerType: answer.type, value: answer.value });

    // Get current round and song
    const round = gameStateManager.getCurrentRound(roomId);
    if (!round) {
      throw new Error(`No active round for room ${roomId}`);
    }

    const song = round.songs[round.currentSongIndex];
    if (!song) {
      throw new Error(`No active song in round`);
    }

    const modeHandler = modeRegistry.get(round.modeType);

    // Clear answer timer (player answered in time)
    timerManager.clearAnswerTimer(roomId);

    // Validate and score the answer
    const result = await modeHandler.handleAnswer(answer, song);

    // Update answer with validation result
    answer.isCorrect = result.isCorrect;
    answer.pointsAwarded = result.pointsAwarded;

    // Store the answer
    song.answers.push(answer);

    // Handle lockout if player answered incorrectly
    if (result.lockOutPlayer) {
      const prevStatus = song.status;
      const prevActivePlayer = song.activePlayerId;

      if (!song.lockedOutPlayerIds.includes(playerId)) {
        song.lockedOutPlayerIds.push(playerId);
      }
      // Reset song state to allow others to buzz
      song.activePlayerId = undefined;
      song.status = 'playing';
      // CRITICAL: Clear buzz timestamps so other players can buzz
      // Without this, the race condition check would reject new buzzes
      if (song.buzzTimestamps) {
        song.buzzTimestamps.clear();
      }

      // Resume song timer if it was paused (for modes that pause on buzz)
      if (modeHandler.shouldPauseOnBuzz()) {
        const resumed = timerManager.resumeSongTimer(roomId);
        if (!resumed) {
          // Fallback broadcast to ensure clients resume playback even if timer was already active
          broadcastToRoom(roomId, {
            type: 'game:resumed',
            data: { timestamp: Date.now(), reason: 'lockout-fallback' }
          });
          gameLogger.warn('Fallback game:resumed broadcast after lockout - timer was not paused', {
            roomId,
            playerId
          });
        } else {
          gameLogger.debug('Song timer resumed after lockout', { roomId, playerId });
        }
      }

      gameLogger.info('Player locked out - SONG STATE RESET', {
        roomId,
        playerId,
        prevStatus,
        newStatus: song.status,
        prevActivePlayer,
        newActivePlayer: song.activePlayerId,
        lockedOutPlayerIds: song.lockedOutPlayerIds,
        buzzTimestampsCleared: true,
      });
    }

    gameStateManager.updateRound(roomId, round);

    // Update player score in database if points were awarded
    if (result.pointsAwarded !== 0) {
      try {
        const player = await playerRepository.findById(playerId);
        if (player) {
          const newScore = player.score + result.pointsAwarded;
          const newRoundScore = player.roundScore + result.pointsAwarded;
          await playerRepository.update(playerId, {
            score: newScore,
            roundScore: newRoundScore,
          });
          gameLogger.debug('Updated player score', {
            roomId,
            playerId,
            playerName: player.name,
            pointsAwarded: result.pointsAwarded,
            newScore,
          });

          // Broadcast score update in real-time to all clients
          broadcastToRoom(roomId, {
            type: 'score:updated',
            data: {
              playerId: player.id,
              playerName: player.name,
              score: newScore,
              pointsAwarded: result.pointsAwarded,
            },
          });
        }
      } catch (err) {
        gameLogger.error('Failed to update player score', err, { roomId, playerId });
        // Continue anyway - score will be calculated from answers
      }
    }

    // Get player name for broadcast
    const player = await playerRepository.findById(playerId);
    const playerName = player?.name || 'Unknown Player';

    // Send result to all players (includes player name for others to see who answered)
    broadcastToRoom(roomId, {
      type: 'answer:result',
      data: {
        playerId,
        playerName,
        answerType: answer.type,
        isCorrect: result.isCorrect,
        pointsAwarded: result.pointsAwarded,
        shouldShowTitleChoices: result.shouldShowTitleChoices,
        lockOutPlayer: result.lockOutPlayer,
      },
    });

    // Check if we should show second question (title question after artist answer)
    if (result.shouldShowTitleChoices) {
      if (!song.titleQuestion || !song.titleQuestion.choices || song.titleQuestion.choices.length === 0) {
        gameLogger.error('CRITICAL: Title question not available but shouldShowTitleChoices is true', {
          roomId,
          playerId,
          songId: song.song.id,
          songTitle: song.song.title
        });
        throw new Error('Title question should have been generated in startSong');
      }

      if (song.titleQuestion.choices.length !== 4) {
        gameLogger.warn('Title question choices count is not 4, game may be corrupted', {
          roomId,
          titleChoicesCount: song.titleQuestion.choices.length
        });
      }

      // Reset answer timer for title question (player gets fresh 6 seconds)
      const answerTime = getAnswerTimer(round, modeHandler);
      timerManager.startAnswerTimer(roomId, round, round.currentSongIndex, playerId, answerTime, this.handleAnswerTimerExpired.bind(this));

      gameLogger.info('Sending title question after correct artist', {
        roomId,
        playerId,
        playerName,
        choicesCount: song.titleQuestion.choices.length,
        correctTitle: song.song.title,
        answerTime
      });

      broadcastToRoom(roomId, {
        type: 'choices:title',
        data: {
          playerId,
          titleQuestion: song.titleQuestion, // Send title choices as titleQuestion
          answerTimer: answerTime, // Initial timer value for client display
        },
      });
    }

    // Check if song should end
    const activePlayerCount = await playerRepository.countConnected(roomId);
    const shouldEnd = modeHandler.shouldEndSong(song, activePlayerCount);

    gameLogger.debug('Checking if song should end', {
      roomId,
      songIndex: round.currentSongIndex,
      shouldEnd,
      answersCount: song.answers.length,
      titleCorrect: song.answers.some(a => a.type === 'title' && a.isCorrect),
      artistCorrect: song.answers.some(a => a.type === 'artist' && a.isCorrect),
      lockedOutCount: song.lockedOutPlayerIds.length,
      activePlayerCount,
      shouldPauseOnBuzz: modeHandler.shouldPauseOnBuzz()
    });

    // Handle pause/resume timer state for manual validation modes
    if (modeHandler.shouldPauseOnBuzz()) {
      if (shouldEnd) {
        // Correct answer - clear timer and set to 0
        timerManager.clearSongTimer(roomId);
        broadcastToRoom(roomId, {
          type: 'timer:song',
          data: { timeRemaining: 0 }
        });
        gameLogger.debug('Song timer cleared after correct answer', { roomId });
      } else if (!result.shouldShowTitleChoices) {
        // Resume timer only when gameplay resumes for all players (no bonus question flow)
        const resumed = timerManager.resumeSongTimer(roomId);
        if (!resumed) {
          broadcastToRoom(roomId, {
            type: 'game:resumed',
            data: { timestamp: Date.now(), reason: 'resume-fallback' }
          });
          gameLogger.warn('Fallback game:resumed broadcast - timer already running', { roomId });
        } else {
          gameLogger.debug('Song timer resumed after wrong answer', { roomId });
        }
      }
    }

    if (shouldEnd) {
      await this.endSong(roomId, round, round.currentSongIndex);
    }
  }

  /**
   * End a song
   */
  async endSong(roomId: string, round: Round, songIndex: number): Promise<void> {
    gameLogger.info('Ending song', { roomId, roundIndex: round.index, songIndex });

    // Clear any active timers
    timerManager.clearAllTimers(roomId);

    const song = round.songs[songIndex];
    const modeHandler = modeRegistry.get(round.modeType);

    // Finalize song
    await modeHandler.endSong(song);

    song.status = 'finished';
    song.endedAt = new Date();

    // Update state
    gameStateManager.updateRound(roomId, round);

    // Calculate winners for this song
    const winners = await this.calculateSongWinners(roomId, song);

    // Broadcast song ended with correct answer reveal and winners
    broadcastToRoom(roomId, {
      type: 'song:ended',
      data: {
        songIndex,
        correctTitle: song.song.title,
        correctArtist: song.song.artist,
        winners: winners.length > 0 ? winners : undefined,
      },
    });

    gameLogger.info('Showing correct answer for 5 seconds before next song', {
      roomId,
      songIndex,
      title: song.song.title,
      artist: song.song.artist
    });

    // Schedule next song after 5 seconds (non-blocking)
    // Don't await - return immediately to avoid blocking WebSocket handler
    setTimeout(async () => {
      // Fetch fresh round to check completion status with updated song statuses
      const currentRound = gameStateManager.getCurrentRound(roomId);
      if (!currentRound) {
        gameLogger.error('No current round found in timeout callback', { roomId, songIndex });
        return;
      }

      gameLogger.info('Checking round completion after song ended', {
        roomId,
        roundIndex: currentRound.index,
        songIndex,
        totalSongs: currentRound.songs.length,
        finishedSongs: currentRound.songs.filter(s => s.status === 'finished').length,
        songStatuses: currentRound.songs.map((s, i) => ({ index: i, status: s.status }))
      });

      // Check if round is complete
      if (modeHandler.isRoundComplete(currentRound)) {
        gameLogger.info('Round is complete, ending round', { roomId, roundIndex: currentRound.index });
        await this.endRound(roomId, currentRound);
      } else {
        // Start next song
        gameLogger.info('Round not complete, starting next song', {
          roomId,
          roundIndex: currentRound.index,
          nextSongIndex: songIndex + 1
        });
        await this.startSong(roomId, currentRound, songIndex + 1);
      }
    }, 5000);

    // Return immediately - don't block the WebSocket handler
  }

  /**
   * Calculate winners for a song based on correct answers
   */
  private async calculateSongWinners(
    roomId: string,
    song: RoundSong
  ): Promise<Array<{
    playerId: string;
    playerName: string;
    answersCorrect: ('title' | 'artist')[];
    pointsEarned: number;
    timeToAnswer: number;
  }>> {
    // Group correct answers by player
    const correctAnswersByPlayer = new Map<string, Answer[]>();

    for (const answer of song.answers) {
      if (answer.isCorrect) {
        const existing = correctAnswersByPlayer.get(answer.playerId) || [];
        existing.push(answer);
        correctAnswersByPlayer.set(answer.playerId, existing);
      }
    }

    // No winners if no correct answers
    if (correctAnswersByPlayer.size === 0) {
      return [];
    }

    // Build winner objects
    const winners = [];
    for (const [playerId, answers] of correctAnswersByPlayer.entries()) {
      const player = await playerRepository.findById(playerId);
      if (!player) continue;

      const pointsEarned = answers.reduce((sum, a) => sum + a.pointsAwarded, 0);
      const answersCorrect = answers.map(a => a.type);
      const timeToAnswer = Math.min(...answers.map(a => a.timeToAnswer));

      winners.push({
        playerId,
        playerName: player.name,
        answersCorrect,
        pointsEarned,
        timeToAnswer,
      });
    }

    // Sort by points (descending), then by time (ascending - faster is better)
    winners.sort((a, b) => {
      if (b.pointsEarned !== a.pointsEarned) {
        return b.pointsEarned - a.pointsEarned;
      }
      return a.timeToAnswer - b.timeToAnswer;
    });

    return winners;
  }

  /**
   * End a round
   */
  async endRound(roomId: string, round: Round): Promise<void> {
    gameLogger.info('Ending round', { roomId, roundIndex: round.index });

    // Clear any remaining timers
    timerManager.clearAllTimers(roomId);

    round.status = 'finished';
    round.endedAt = new Date();

    // Calculate and rank scores for this round
    const roundScores = await this.calculateRoundScores(roomId, round);

    // Update state
    gameStateManager.updateRound(roomId, round);

    // Broadcast round ended with ranked scores
    broadcastToRoom(roomId, {
      type: 'round:ended',
      data: {
        roundIndex: round.index,
        scores: roundScores.map(fs => ({
          playerId: fs.playerId,
          playerName: fs.playerName,
          score: fs.totalScore,
          rank: fs.rank,
        })),
      },
    });

    // Check if there are more rounds
    // IMPORTANT: Use in-memory state manager, NOT database repository
    // The database version has empty songs[] arrays - answers are only in memory
    const session = gameStateManager.getActiveSession(roomId);
    if (!session) {
      gameLogger.error('Session not found for round', { roomId, roundId: round.id });
      return;
    }

    const hasMoreRounds = round.index < session.rounds.length - 1;

    if (hasMoreRounds) {
      // More rounds to play - transition to between_rounds state
      gameLogger.info('More rounds remaining, transitioning to between_rounds', {
        roomId,
        currentRound: round.index,
        totalRounds: session.rounds.length
      });

      // Update room status to between_rounds
      await roomRepository.update(roomId, { status: 'between_rounds' });

      // Fetch updated room to send to clients
      const updatedRoom = await roomRepository.findById(roomId);
      if (!updatedRoom) {
        gameLogger.error('Room not found after status update', { roomId });
        return;
      }

      // Broadcast between rounds state with updated room
      broadcastToRoom(roomId, {
        type: 'round:between',
        data: {
          room: updatedRoom,
          completedRoundIndex: round.index,
          nextRoundIndex: round.index + 1,
          nextRoundMode: session.rounds[round.index + 1]?.modeType,
          nextRoundMedia: session.rounds[round.index + 1]?.mediaType,
          scores: roundScores.map(fs => ({
            playerId: fs.playerId,
            playerName: fs.playerName,
            score: fs.totalScore,
            rank: fs.rank,
          })),
        },
      });

      // Clean up current round from state manager
      gameStateManager.updateRound(roomId, round);
    } else {
      // No more rounds - game is complete
      gameLogger.info('All rounds complete, ending game', { roomId });

      // Calculate final scores across all rounds
      const finalScores = await this.calculateFinalScores(roomId, session);

      // Broadcast game ended with full rankings
      gameLogger.info('Broadcasting game:ended to all clients', {
        roomId,
        scoreCount: finalScores.length,
        players: finalScores.map(fs => ({ name: fs.playerName, score: fs.totalScore }))
      });

      broadcastToRoom(roomId, {
        type: 'game:ended',
        data: {
          finalScores,
        },
      });

      // Update room status to finished
      await roomRepository.update(roomId, { status: 'finished' });

      // Remove from state manager
      gameStateManager.removeSession(roomId);
    }
  }

  /**
   * Finish current round and prepare for next round (called by master)
   */
  async finishCurrentRound(roomId: string): Promise<void> {
    gameLogger.info('Finishing current round', { roomId });

    const round = gameStateManager.getCurrentRound(roomId);
    if (!round) {
      throw new Error(`No active round for room ${roomId}`);
    }

    await this.endRound(roomId, round);
  }

  /**
   * Start next round (called by master from between_rounds state)
   */
  async startNextRound(roomId: string): Promise<void> {
    gameLogger.info('Starting next round', { roomId });

    // Verify room is in between_rounds state
    const room = await roomRepository.findById(roomId);
    gameLogger.info('Room state check', {
      roomId,
      roomFound: !!room,
      roomStatus: room?.status
    });

    if (!room || room.status !== 'between_rounds') {
      gameLogger.error('Room not in between_rounds state', {
        roomId,
        roomFound: !!room,
        actualStatus: room?.status,
        expectedStatus: 'between_rounds'
      });
      throw new Error(`Room ${roomId} is not in between_rounds state (current: ${room?.status || 'not found'})`);
    }

    // Get current session
    const session = gameStateManager.getActiveSession(roomId);
    gameLogger.info('Session check', {
      roomId,
      sessionFound: !!session,
      sessionId: session?.id,
      roundsCount: session?.rounds.length
    });

    if (!session) {
      gameLogger.error('No active session found', { roomId });
      throw new Error(`No active session for room ${roomId}`);
    }

    // Find the next pending round
    const nextRound = session.rounds.find(r => r.status === 'pending');
    gameLogger.info('Next round search', {
      roomId,
      nextRoundFound: !!nextRound,
      nextRoundIndex: nextRound?.index,
      allRoundStatuses: session.rounds.map((r, i) => ({ index: i, status: r.status }))
    });

    if (!nextRound) {
      gameLogger.error('No pending rounds found', {
        roomId,
        roundStatuses: session.rounds.map((r, i) => ({ index: i, status: r.status }))
      });
      throw new Error(`No pending rounds found for room ${roomId}`);
    }

    gameLogger.info('Updating room status to playing', { roomId });
    // Update room status back to playing
    await roomRepository.update(roomId, { status: 'playing' });

    gameLogger.info('Resetting player scores', { roomId });
    // Reset player round scores
    const players = await playerRepository.findByRoom(roomId);
    for (const player of players) {
      if (player.role === 'player') {
        await playerRepository.update(player.id, { roundScore: 0, isLockedOut: false });
      }
    }

    gameLogger.info('Starting round', {
      roomId,
      sessionId: session.id,
      roundIndex: nextRound.index
    });
    // Start the round
    await this.startRound(roomId, session.id, nextRound.index);

    gameLogger.info('Next round started successfully', {
      roomId,
      roundIndex: nextRound.index
    });
  }

  /**
   * Calculate scores for a single round
   */
  private async calculateRoundScores(roomId: string, round: Round): Promise<import('@blind-test/shared').FinalScore[]> {
    const players = await playerRepository.findByRoom(roomId);

    // Calculate scores for each player
    const roundScores = players
      .filter(p => p.role === 'player') // Exclude master
      .map(player => {
        // Get player's answers from this round
        const playerAnswers = round.songs.flatMap(song =>
          song.answers.filter(a => a.playerId === player.id)
        );

        const correctAnswers = playerAnswers.filter(a => a.isCorrect).length;
        const wrongAnswers = playerAnswers.filter(a => !a.isCorrect).length;
        const roundScore = playerAnswers.reduce((sum, a) => sum + a.pointsAwarded, 0);

        // Calculate average answer time (for tiebreakers)
        const avgAnswerTime = playerAnswers.length > 0
          ? playerAnswers.reduce((sum, a) => sum + a.timeToAnswer, 0) / playerAnswers.length
          : 0;

        return {
          playerId: player.id,
          playerName: player.name,
          totalScore: roundScore,
          roundScores: [roundScore],
          correctAnswers,
          wrongAnswers,
          averageAnswerTime: avgAnswerTime,
          rank: 0, // Will be set after sorting
        };
      });

    // Sort by score (descending), then by average answer time (ascending - faster is better)
    roundScores.sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      // Tiebreaker: faster average answer time wins
      return a.averageAnswerTime - b.averageAnswerTime;
    });

    // Assign ranks
    roundScores.forEach((score, index) => {
      score.rank = index + 1;
    });

    gameLogger.debug('Round scores calculated', {
      roomId,
      roundIndex: round.index,
      scores: roundScores.map(s => ({ name: s.playerName, score: s.totalScore, rank: s.rank }))
    });

    return roundScores;
  }

  /**
   * Calculate final scores across all rounds with ranking
   */
  private async calculateFinalScores(roomId: string, session: GameSession): Promise<import('@blind-test/shared').FinalScore[]> {
    const players = await playerRepository.findByRoom(roomId);

    // Calculate scores for each player across all rounds
    const finalScores = players
      .filter(p => p.role === 'player') // Exclude master
      .map(player => {
        // Calculate score for each round
        const roundScores = session.rounds.map(round => {
          const roundAnswers = round.songs.flatMap(song =>
            song.answers.filter(a => a.playerId === player.id)
          );
          return roundAnswers.reduce((sum, a) => sum + a.pointsAwarded, 0);
        });

        // Get player's answers from ALL rounds
        const allPlayerAnswers = session.rounds.flatMap(round =>
          round.songs.flatMap(song =>
            song.answers.filter(a => a.playerId === player.id)
          )
        );

        const correctAnswers = allPlayerAnswers.filter(a => a.isCorrect).length;
        const wrongAnswers = allPlayerAnswers.filter(a => !a.isCorrect).length;
        const totalScore = allPlayerAnswers.reduce((sum, a) => sum + a.pointsAwarded, 0);

        // Calculate average answer time (for tiebreakers)
        const avgAnswerTime = allPlayerAnswers.length > 0
          ? allPlayerAnswers.reduce((sum, a) => sum + a.timeToAnswer, 0) / allPlayerAnswers.length
          : 0;

        return {
          playerId: player.id,
          playerName: player.name,
          totalScore,
          roundScores,
          correctAnswers,
          wrongAnswers,
          averageAnswerTime: avgAnswerTime,
          rank: 0, // Will be set after sorting
        };
      });

    // Sort by score (descending), then by average answer time (ascending - faster is better)
    finalScores.sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      // Tiebreaker: faster average answer time wins
      return a.averageAnswerTime - b.averageAnswerTime;
    });

    // Assign ranks
    finalScores.forEach((score, index) => {
      score.rank = index + 1;
    });

    gameLogger.info('Final scores calculated across all rounds', {
      roomId,
      roundCount: session.rounds.length,
      scores: finalScores.map(s => ({ name: s.playerName, score: s.totalScore, rank: s.rank }))
    });

    return finalScores;
  }

  /**
   * End game manually (master control)
   */
  async endGame(roomId: string): Promise<void> {
    gameLogger.info('Manually ending game', { roomId });

    // Clear all timers first
    timerManager.clearAllTimers(roomId);

    // Get current round
    const round = gameStateManager.getCurrentRound(roomId);
    if (!round) {
      gameLogger.warn('No active round to end', { roomId });

      // Just update room status to finished
      try {
        await roomRepository.update(roomId, { status: 'finished' });
      } catch (err) {
        gameLogger.error('Failed to update room status on game end', err, { roomId });
      }
      return;
    }

    // End the current round (which will trigger score calculation and cleanup)
    await this.endRound(roomId, round);

    // Update room status
    try {
      await roomRepository.update(roomId, { status: 'finished' });
    } catch (err) {
      gameLogger.error('Failed to update room status after round end', err, { roomId });
    }

    gameLogger.info('Game ended manually', { roomId });
  }

  /**
   * Get current round for a room (exposed for WebSocket handlers)
   */
  getCurrentRound(roomId: string): Round | null {
    return gameStateManager.getCurrentRound(roomId);
  }

  /**
   * Handle player disconnection during game
   * Cleans up any active timers for that player
   */
  async handlePlayerDisconnect(roomId: string, playerId: string): Promise<void> {
    gameLogger.info('Handling player disconnect', { roomId, playerId });

    // Check if this player has an active answer timer
    const activePlayerId = timerManager.getAnswerTimerPlayerId(roomId);
    if (activePlayerId === playerId) {
      // Player disconnected while answering - clear their timer and lock them out
      timerManager.clearAnswerTimer(roomId);

      const round = gameStateManager.getCurrentRound(roomId);
      if (round && round.currentSongIndex !== undefined) {
        const song = round.songs[round.currentSongIndex];
        if (song) {
          // Lock out disconnected player
          if (!song.lockedOutPlayerIds.includes(playerId)) {
            song.lockedOutPlayerIds.push(playerId);
          }
          // Clear active player
          song.activePlayerId = undefined;
          song.status = 'playing';
          // Clear buzz timestamps so other players can buzz
          if (song.buzzTimestamps) {
            song.buzzTimestamps.clear();
          }

          gameStateManager.updateRound(roomId, round);

          gameLogger.debug('Cleared answer timer for disconnected player', { roomId, playerId });

          // Check if song should end (all players locked out)
          const modeHandler = modeRegistry.get(round.modeType);
          const activePlayerCount = await playerRepository.countConnected(roomId);
          if (modeHandler.shouldEndSong(song, activePlayerCount)) {
            await this.endSong(roomId, round, round.currentSongIndex);
          }
        }
      }
    }
  }

}

// Export singleton instance
export const gameService = new GameService();
