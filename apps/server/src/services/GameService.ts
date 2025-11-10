/**
 * Game Service - Game State Machine
 *
 * Manages game flow, state transitions, and coordinates between:
 * - Mode handlers (gameplay rules)
 * - Media handlers (content delivery)
 * - Repositories (data persistence)
 * - WebSocket (real-time communication)
 */

import type { GameSession, Round, RoundSong, Song, Player, MediaType, Answer } from '@blind-test/shared';
import { generateId, SYSTEM_DEFAULTS } from '@blind-test/shared';
import { gameSessionRepository, songRepository, playerRepository, roomRepository } from '../repositories';
import { modeRegistry } from '../modes';
import { mediaRegistry } from '../media';
import { broadcastToRoom } from '../websocket/handler';
import { gameStateManager } from './GameStateManager';
import { logger } from '../utils/logger';
import { answerGenerationService } from './AnswerGenerationService';

const gameLogger = logger.child({ module: 'GameService' });

export class GameService {
  // Timer tracking: roomId → { timerId, endTime, broadcastInterval }
  private songTimers = new Map<string, {
    timerId: NodeJS.Timeout;
    endTime: number;
    broadcastInterval?: NodeJS.Timeout;
  }>();
  private answerTimers = new Map<string, {
    timerId: NodeJS.Timeout;
    endTime: number;
    playerId: string;
    broadcastInterval?: NodeJS.Timeout;
  }>();

  /**
   * Start a round - transition from lobby to playing
   */
  async startRound(roomId: string, sessionId: string, roundIndex: number): Promise<Round> {
    gameLogger.info('Starting round', { roomId, sessionId, roundIndex });

    const session = await gameSessionRepository.findById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
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

    // Register in state manager
    gameStateManager.setActiveSession(roomId, session, round);

    // Start first song
    await this.startSong(roomId, round, 0);

    // Broadcast round started
    broadcastToRoom(roomId, {
      type: 'round:started',
      data: {
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

    // Get mode and media handlers
    const modeHandler = modeRegistry.get(round.modeType);
    const allSongs = round.songs.map(rs => rs.song);

    // Initialize song (generate choices, etc.)
    await modeHandler.startSong(song, allSongs, round.mediaType);

    // Update song status
    song.status = 'playing';
    song.startedAt = new Date();
    round.currentSongIndex = songIndex;

    // Update state
    gameStateManager.updateRound(roomId, round);

    // Construct audio streaming URL
    const audioUrl = `http://localhost:3007/api/songs/${song.song.id}/stream`;

    // Generate answer choices for multiple choice modes
    let answerChoices;
    if (round.modeType === 'buzz_and_choice' || round.modeType === 'timed_answer') {
      try {
        answerChoices = await answerGenerationService.generateAnswerChoices(song.song);
        gameLogger.debug('Generated answer choices', { count: answerChoices.length });
      } catch (error) {
        gameLogger.error('Failed to generate answer choices', error);
        // Continue without choices if generation fails
      }
    }

    // Start song duration timer
    const songDuration = round.params.songDuration || SYSTEM_DEFAULTS.songDuration;
    this.startSongTimer(roomId, round, songIndex, songDuration);

    // Broadcast song started (includes song info for master)
    broadcastToRoom(roomId, {
      type: 'song:started',
      data: {
        songIndex,
        duration: songDuration,
        audioUrl,
        clipStart: song.song.clipStart,
        audioPlayback: round.params.audioPlayback || SYSTEM_DEFAULTS.audioPlayback,
        answerChoices,
        // Song info for master display (players should ignore these)
        songTitle: song.song.title,
        songArtist: song.song.artist,
      },
    });
  }

  /**
   * Start timer for song duration
   */
  private startSongTimer(roomId: string, round: Round, songIndex: number, durationSeconds: number): void {
    // Clear any existing timer
    this.clearSongTimer(roomId);

    const endTime = Date.now() + (durationSeconds * 1000);

    const timerId = setTimeout(async () => {
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

      // Clean up timer
      this.songTimers.delete(roomId);
    }, durationSeconds * 1000);

    // Broadcast countdown every second
    const broadcastInterval = setInterval(() => {
      const timeRemaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      broadcastToRoom(roomId, {
        type: 'timer:song',
        data: { timeRemaining },
      });

      // Stop broadcasting when timer reaches 0
      if (timeRemaining <= 0) {
        const timer = this.songTimers.get(roomId);
        if (timer?.broadcastInterval) {
          clearInterval(timer.broadcastInterval);
        }
      }
    }, 1000);

    this.songTimers.set(roomId, { timerId, endTime, broadcastInterval });
    gameLogger.debug('Song timer started', { roomId, songIndex, durationSeconds });
  }

  /**
   * Clear song timer for a room
   */
  private clearSongTimer(roomId: string): void {
    const timer = this.songTimers.get(roomId);
    if (timer) {
      clearTimeout(timer.timerId);
      if (timer.broadcastInterval) {
        clearInterval(timer.broadcastInterval);
      }
      this.songTimers.delete(roomId);
      gameLogger.debug('Song timer cleared', { roomId });
    }
  }

  /**
   * Start timer for answer submission
   */
  private startAnswerTimer(roomId: string, round: Round, songIndex: number, playerId: string, timerSeconds: number): void {
    // Clear any existing answer timer
    this.clearAnswerTimer(roomId);

    const endTime = Date.now() + (timerSeconds * 1000);

    const timerId = setTimeout(async () => {
      gameLogger.info('Answer timer expired', { roomId, songIndex, playerId });

      // Check if player is still answering
      const currentRound = gameStateManager.getCurrentRound(roomId);
      if (currentRound && currentRound.currentSongIndex === songIndex) {
        const song = currentRound.songs[songIndex];
        if (song && song.activePlayerId === playerId) {
          // Timer expired - lock out player and reset for others to buzz
          song.lockedOutPlayerIds.push(playerId);
          song.activePlayerId = undefined;
          song.status = 'playing';

          gameStateManager.updateRound(roomId, currentRound);

          // Notify timeout
          broadcastToRoom(roomId, {
            type: 'answer:result',
            data: {
              playerId,
              answerType: 'title',
              isCorrect: false,
              pointsAwarded: 0,
              shouldShowArtistChoices: false,
              lockOutPlayer: true,
            },
          });

          // Check if we should end song (all players locked out)
          const activePlayerCount = await playerRepository.countConnected(roomId);
          const modeHandler = modeRegistry.get(currentRound.modeType);
          if (modeHandler.shouldEndSong(song, activePlayerCount)) {
            await this.endSong(roomId, currentRound, songIndex);
          }
        }
      }

      // Clean up timer
      this.answerTimers.delete(roomId);
    }, timerSeconds * 1000);

    // Broadcast countdown every second
    const broadcastInterval = setInterval(() => {
      const timeRemaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      broadcastToRoom(roomId, {
        type: 'timer:answer',
        data: { playerId, timeRemaining },
      });

      // Stop broadcasting when timer reaches 0
      if (timeRemaining <= 0) {
        const timer = this.answerTimers.get(roomId);
        if (timer?.broadcastInterval) {
          clearInterval(timer.broadcastInterval);
        }
      }
    }, 1000);

    this.answerTimers.set(roomId, { timerId, endTime, playerId, broadcastInterval });
    gameLogger.debug('Answer timer started', { roomId, playerId, timerSeconds });
  }

  /**
   * Clear answer timer for a room
   */
  private clearAnswerTimer(roomId: string): void {
    const timer = this.answerTimers.get(roomId);
    if (timer) {
      clearTimeout(timer.timerId);
      if (timer.broadcastInterval) {
        clearInterval(timer.broadcastInterval);
      }
      this.answerTimers.delete(roomId);
      gameLogger.debug('Answer timer cleared', { roomId });
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
      // Start answer timer
      const answerTime = round.params.answerTimer || SYSTEM_DEFAULTS.answerTimer;
      this.startAnswerTimer(roomId, round, songIndex, playerId, answerTime);

      // Update state
      gameStateManager.updateRound(roomId, round);

      // Broadcast buzz to all clients
      broadcastToRoom(roomId, {
        type: 'player:buzzed',
        data: {
          playerId,
          songIndex,
          titleChoices: song.titleChoices,
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
    this.clearAnswerTimer(roomId);

    // Validate and score the answer
    const result = await modeHandler.handleAnswer(answer, song);

    // Update answer with validation result
    answer.isCorrect = result.isCorrect;
    answer.pointsAwarded = result.pointsAwarded;

    // Store the answer
    song.answers.push(answer);

    // Handle lockout if player answered incorrectly
    if (result.lockOutPlayer) {
      if (!song.lockedOutPlayerIds.includes(playerId)) {
        song.lockedOutPlayerIds.push(playerId);
      }
      // Reset song state to allow others to buzz
      song.activePlayerId = undefined;
      song.status = 'playing';
      gameLogger.debug('Player locked out after wrong answer', {
        roomId,
        playerId,
        lockedOutCount: song.lockedOutPlayerIds.length
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
        shouldShowArtistChoices: result.shouldShowArtistChoices,
        lockOutPlayer: result.lockOutPlayer,
      },
    });

    // Check if we should show artist choices
    if (result.shouldShowArtistChoices) {
      if (!song.artistChoices || song.artistChoices.length === 0) {
        gameLogger.error('Artist choices not available but shouldShowArtistChoices is true', {
          roomId,
          playerId,
          songId: song.song.id,
          songTitle: song.song.title
        });
        // Generate emergency artist choices if they're missing
        song.artistChoices = [song.song.artist, 'Unknown Artist 1', 'Unknown Artist 2', 'Unknown Artist 3'];
      }

      gameLogger.debug('Sending artist choices', {
        roomId,
        playerId,
        playerName,
        choicesCount: song.artistChoices.length
      });

      broadcastToRoom(roomId, {
        type: 'choices:artist',
        data: {
          playerId,
          artistChoices: song.artistChoices,
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
      activePlayerCount
    });

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
    this.clearSongTimer(roomId);
    this.clearAnswerTimer(roomId);

    const song = round.songs[songIndex];
    const modeHandler = modeRegistry.get(round.modeType);

    // Finalize song
    await modeHandler.endSong(song);

    song.status = 'finished';
    song.endedAt = new Date();

    // Update state
    gameStateManager.updateRound(roomId, round);

    // Broadcast song ended with correct answer reveal
    broadcastToRoom(roomId, {
      type: 'song:ended',
      data: {
        songIndex,
        correctTitle: song.song.title,
        correctArtist: song.song.artist,
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
      // Check if round is complete
      if (modeHandler.isRoundComplete(round)) {
        await this.endRound(roomId, round);
      } else {
        // Start next song
        await this.startSong(roomId, round, songIndex + 1);
      }
    }, 5000);

    // Return immediately - don't block the WebSocket handler
  }

  /**
   * End a round
   */
  async endRound(roomId: string, round: Round): Promise<void> {
    gameLogger.info('Ending round', { roomId, roundIndex: round.index });

    // Clear any remaining timers
    this.clearSongTimer(roomId);
    this.clearAnswerTimer(roomId);

    round.status = 'finished';
    round.endedAt = new Date();

    // Calculate and rank final scores
    const finalScores = await this.calculateFinalScores(roomId, round);

    // Update state
    gameStateManager.updateRound(roomId, round);

    // Broadcast round ended with ranked scores
    broadcastToRoom(roomId, {
      type: 'round:ended',
      data: {
        roundIndex: round.index,
        scores: finalScores.map(fs => ({
          playerId: fs.playerId,
          score: fs.totalScore,
        })),
      },
    });

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

    // Remove from state manager
    gameStateManager.removeSession(roomId);
  }

  /**
   * Calculate final scores with ranking
   */
  private async calculateFinalScores(roomId: string, round: Round): Promise<import('@blind-test/shared').FinalScore[]> {
    const players = await playerRepository.findByRoom(roomId);

    // Calculate scores for each player
    const finalScores = players
      .filter(p => p.role === 'player') // Exclude master
      .map(player => {
        // Get player's answers from all songs
        const playerAnswers = round.songs.flatMap(song =>
          song.answers.filter(a => a.playerId === player.id)
        );

        const correctAnswers = playerAnswers.filter(a => a.isCorrect).length;
        const wrongAnswers = playerAnswers.filter(a => !a.isCorrect).length;
        const totalScore = playerAnswers.reduce((sum, a) => sum + a.pointsAwarded, 0);

        // Calculate average answer time (for tiebreakers)
        const avgAnswerTime = playerAnswers.length > 0
          ? playerAnswers.reduce((sum, a) => sum + a.timeToAnswer, 0) / playerAnswers.length
          : 0;

        return {
          playerId: player.id,
          playerName: player.name,
          totalScore,
          roundScores: [totalScore], // Single round for now
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

    gameLogger.info('Final scores calculated', {
      roomId,
      roundIndex: round.index,
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
    this.clearSongTimer(roomId);
    this.clearAnswerTimer(roomId);

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
    const answerTimer = this.answerTimers.get(roomId);
    if (answerTimer && answerTimer.playerId === playerId) {
      // Player disconnected while answering - clear their timer and lock them out
      this.clearAnswerTimer(roomId);

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
