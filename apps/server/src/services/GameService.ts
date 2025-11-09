/**
 * Game Service - Game State Machine
 *
 * Manages game flow, state transitions, and coordinates between:
 * - Mode handlers (gameplay rules)
 * - Media handlers (content delivery)
 * - Repositories (data persistence)
 * - WebSocket (real-time communication)
 */

import type { GameSession, Round, RoundSong, Song, Player, MediaType } from '@blind-test/shared';
import { generateId } from '@blind-test/shared';
import { gameSessionRepository, songRepository } from '../repositories';
import { modeRegistry } from '../modes';
import { mediaRegistry } from '../media';
import { broadcastToRoom } from '../websocket/handler';

export class GameService {
  /**
   * Start a round - transition from lobby to playing
   */
  async startRound(sessionId: string, roundIndex: number): Promise<Round> {
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

    // Start first song
    await this.startSong(round, 0);

    // Broadcast round started
    broadcastToRoom(session.roomId, {
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

    // Get all songs from playlist (implementation depends on playlist structure)
    // For now, load from songRepository based on playlistId
    const allSongs = await songRepository.findAll();

    // Create RoundSong objects
    const roundSongs: RoundSong[] = allSongs.slice(0, 10).map((song, index) => ({
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
  async startSong(round: Round, songIndex: number): Promise<void> {
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

    // Broadcast song started
    broadcastToRoom(round.sessionId, {
      type: 'song:started',
      data: {
        songIndex,
        duration: round.params.songDuration || 15,
        // Don't send the correct answer to clients!
        clipStart: song.song.clipStart,
      },
    });
  }

  /**
   * Handle player buzz
   */
  async handleBuzz(roundId: string, songIndex: number, playerId: string): Promise<boolean> {
    console.log(`[GameService] Player ${playerId} buzzed on song ${songIndex}`);

    // Get round (this would need repository implementation)
    // For now, this is a placeholder
    const round = await this.getRound(roundId);
    const song = round.songs[songIndex];
    const modeHandler = modeRegistry.get(round.modeType);

    // Check if player can buzz
    if (!modeHandler.canBuzz(playerId, song)) {
      console.log(`[GameService] Buzz rejected for player ${playerId}`);
      return false;
    }

    // Handle the buzz
    const accepted = await modeHandler.handleBuzz(playerId, song);

    if (accepted) {
      // Broadcast buzz to all clients
      broadcastToRoom(round.sessionId, {
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
   * End a song
   */
  async endSong(round: Round, songIndex: number): Promise<void> {
    console.log(`[GameService] Ending song ${songIndex} in round ${round.index}`);

    const song = round.songs[songIndex];
    const modeHandler = modeRegistry.get(round.modeType);

    // Finalize song
    await modeHandler.endSong(song);

    song.status = 'finished';
    song.endedAt = new Date();

    // Broadcast song ended
    broadcastToRoom(round.sessionId, {
      type: 'song:ended',
      data: {
        songIndex,
        correctTitle: song.song.title,
        correctArtist: song.song.artist,
      },
    });

    // Check if round is complete
    if (modeHandler.isRoundComplete(round)) {
      await this.endRound(round);
    } else {
      // Start next song
      await this.startSong(round, songIndex + 1);
    }
  }

  /**
   * End a round
   */
  async endRound(round: Round): Promise<void> {
    console.log(`[GameService] Ending round ${round.index}`);

    round.status = 'finished';
    round.endedAt = new Date();

    // Calculate round scores
    // TODO: Implement scoring logic

    // Broadcast round ended
    broadcastToRoom(round.sessionId, {
      type: 'round:ended',
      data: {
        roundIndex: round.index,
        scores: Array.from(round.scores.entries()).map(([playerId, score]) => ({
          playerId,
          score,
        })),
      },
    });
  }

  /**
   * Placeholder: Get round by ID
   * TODO: Implement proper round repository
   */
  private async getRound(roundId: string): Promise<Round> {
    // This is a placeholder - need to implement RoundRepository
    throw new Error('Not implemented yet - need RoundRepository');
  }
}

// Export singleton instance
export const gameService = new GameService();
