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
import { gameSessionRepository, songRepository, playlistRepository } from '../repositories';
import { modeRegistry } from '../modes';
import { mediaRegistry } from '../media';
import { broadcastToRoom } from '../websocket/handler';
import { gameStateManager } from './GameStateManager';

export class GameService {
  /**
   * Start a round - transition from lobby to playing
   */
  async startRound(roomId: string, sessionId: string, roundIndex: number): Promise<Round> {
    console.log(`[GameService] Starting round ${roundIndex} for session ${sessionId}`);

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
   * Load songs for a round from the playlist
   */
  private async loadRoundSongs(round: Round): Promise<RoundSong[]> {
    console.log(`[GameService] Loading songs for round ${round.index}`);

    // Get playlist songs
    const playlist = await playlistRepository.findById(round.playlistId);
    if (!playlist) {
      throw new Error(`Playlist not found: ${round.playlistId}`);
    }

    // Load song details
    const songs: Song[] = [];
    for (const songId of playlist.songIds) {
      const song = await songRepository.findById(songId);
      if (song) {
        songs.push(song);
      }
    }

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
    console.log(`[GameService] Starting song ${songIndex} in round ${round.index}`);

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

    // Broadcast song started
    broadcastToRoom(roomId, {
      type: 'song:started',
      data: {
        songIndex,
        duration: round.params.songDuration || SYSTEM_DEFAULTS.songDuration,
        // Don't send the correct answer to clients!
        clipStart: song.song.clipStart,
      },
    });
  }

  /**
   * Handle player buzz
   */
  async handleBuzz(roomId: string, songIndex: number, playerId: string): Promise<boolean> {
    console.log(`[GameService] Player ${playerId} buzzed on song ${songIndex} in room ${roomId}`);

    // Get current round
    const round = gameStateManager.getCurrentRound(roomId);
    if (!round) {
      console.error(`[GameService] No active round for room ${roomId}`);
      return false;
    }

    const song = round.songs[songIndex];
    if (!song) {
      console.error(`[GameService] Song ${songIndex} not found`);
      return false;
    }

    const modeHandler = modeRegistry.get(round.modeType);

    // Check if player can buzz
    if (!modeHandler.canBuzz(playerId, song)) {
      console.log(`[GameService] Buzz rejected for player ${playerId}`);
      return false;
    }

    // Handle the buzz
    const accepted = await modeHandler.handleBuzz(playerId, song);

    if (accepted) {
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
    console.log(`[GameService] Player ${playerId} answered ${answer.type}: ${answer.value}`);

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

    // Validate and score the answer
    const result = await modeHandler.handleAnswer(answer, song);

    // Store the answer
    song.answers.push(answer);
    gameStateManager.updateRound(roomId, round);

    // Send result to the player
    broadcastToRoom(roomId, {
      type: 'answer:result',
      data: {
        playerId,
        answerType: answer.type,
        isCorrect: result.isCorrect,
        pointsAwarded: result.pointsAwarded,
        shouldShowArtistChoices: result.shouldShowArtistChoices,
        lockOutPlayer: result.lockOutPlayer,
      },
    });

    // Check if we should show artist choices
    if (result.shouldShowArtistChoices && song.artistChoices) {
      broadcastToRoom(roomId, {
        type: 'choices:artist',
        data: {
          playerId,
          artistChoices: song.artistChoices,
        },
      });
    }

    // Check if song should end
    if (modeHandler.shouldEndSong(song)) {
      await this.endSong(roomId, round, round.currentSongIndex);
    }
  }

  /**
   * End a song
   */
  async endSong(roomId: string, round: Round, songIndex: number): Promise<void> {
    console.log(`[GameService] Ending song ${songIndex} in round ${round.index}`);

    const song = round.songs[songIndex];
    const modeHandler = modeRegistry.get(round.modeType);

    // Finalize song
    await modeHandler.endSong(song);

    song.status = 'finished';
    song.endedAt = new Date();

    // Update state
    gameStateManager.updateRound(roomId, round);

    // Broadcast song ended
    broadcastToRoom(roomId, {
      type: 'song:ended',
      data: {
        songIndex,
        correctTitle: song.song.title,
        correctArtist: song.song.artist,
      },
    });

    // Check if round is complete
    if (modeHandler.isRoundComplete(round)) {
      await this.endRound(roomId, round);
    } else {
      // Start next song
      await this.startSong(roomId, round, songIndex + 1);
    }
  }

  /**
   * End a round
   */
  async endRound(roomId: string, round: Round): Promise<void> {
    console.log(`[GameService] Ending round ${round.index}`);

    round.status = 'finished';
    round.endedAt = new Date();

    // Calculate round scores
    // TODO: Implement scoring logic

    // Update state
    gameStateManager.updateRound(roomId, round);

    // Broadcast round ended
    broadcastToRoom(roomId, {
      type: 'round:ended',
      data: {
        roundIndex: round.index,
        scores: Array.from(round.scores.entries()).map(([playerId, score]) => ({
          playerId,
          score,
        })),
      },
    });

    // Remove from state manager
    gameStateManager.removeSession(roomId);
  }

}

// Export singleton instance
export const gameService = new GameService();
