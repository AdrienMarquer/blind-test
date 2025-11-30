/**
 * Fast Buzz Mode
 *
 * Players buzz and verbally answer.
 * Master manually validates answers.
 *
 * Flow:
 * 1. Song plays
 * 2. Players can buzz at any time
 * 3. First player to buzz gets to answer
 * 4. Master validates (correct/wrong)
 * 5. If wrong, other players can buzz
 * 6. Points awarded immediately
 */

import { DEFAULT_SONG_DURATION, type Round, type RoundSong, type Answer, type Song, type ModeParams, type MediaType } from '@blind-test/shared';
import { BaseModeHandler, type AnswerResult } from './types';

export class FastBuzzMode extends BaseModeHandler {
  type = 'fast_buzz' as const;
  name = 'Fast Buzz';
  description = 'Buzz in and answer verbally. Master validates manually.';

  defaultParams: ModeParams = {
    songDuration: DEFAULT_SONG_DURATION,
    answerTimer: 5,
    pointsTitle: 1,
    pointsArtist: 1,
    manualValidation: true,
  };

  /**
   * Handle player buzz - first to buzz gets to answer
   */
  async handleBuzz(playerId: string, song: RoundSong, timestamp?: number): Promise<boolean> {
    // Check if player can buzz
    if (!this.canBuzz(playerId, song)) {
      return false;
    }

    // Track buzz timestamp for race condition resolution
    if (!song.buzzTimestamps) {
      song.buzzTimestamps = new Map();
    }
    song.buzzTimestamps.set(playerId, timestamp || Date.now());

    // If no active player yet, this player gets to answer
    if (!song.activePlayerId) {
      song.activePlayerId = playerId;
      song.status = 'answering';
      return true;
    }

    // Race condition: check timestamps to determine true winner
    const currentPlayerTime = song.buzzTimestamps.get(song.activePlayerId) || Infinity;
    const thisPlayerTime = timestamp || Date.now();

    if (thisPlayerTime < currentPlayerTime) {
      // This player buzzed first - give them priority
      song.activePlayerId = playerId;
      song.status = 'answering';
      return true;
    }

    return false;
  }

  /**
   * Handle answer - master validates manually
   * Answer value should be 'correct' or 'wrong'
   */
  async handleAnswer(answer: Answer, song: RoundSong): Promise<AnswerResult> {
    const isCorrect = answer.value === 'correct';
    // Use song params if available (set by GameService), otherwise fall back to mode defaults
    const params = song.params ?? this.defaultParams;

    let pointsAwarded = 0;
    let lockOutPlayer = false;

    if (isCorrect) {
      // Correct answer - award points
      pointsAwarded = params.pointsTitle || 1;

      // Song is complete
      song.status = 'finished';
    } else {
      // Wrong answer - lock out player
      lockOutPlayer = true;

      // Apply penalty if enabled
      if (params.penaltyEnabled) {
        pointsAwarded = -(params.penaltyAmount || 0);
      }

      // Allow others to buzz
      song.activePlayerId = undefined;
      song.status = 'playing';
    }

    return {
      isCorrect,
      pointsAwarded,
      shouldShowTitleChoices: false,
      lockOutPlayer,
    };
  }

  /**
   * Validate answer (not used for manual validation)
   */
  validateAnswer(answer: Answer, song: Song): boolean {
    // Master validates manually, so always trust the answer value
    return answer.value === 'correct';
  }

  /**
   * Calculate score based on answer
   */
  calculateScore(answer: Answer, song: Song, params: ModeParams): number {
    if (answer.isCorrect) {
      return params.pointsTitle || 1;
    }

    // Apply penalty if wrong
    if (params.penaltyEnabled) {
      return -(params.penaltyAmount || 0);
    }

    return 0;
  }

  /**
   * Check if player can buzz
   */
  canBuzz(playerId: string, song: RoundSong): boolean {
    // Can't buzz if song is not playing
    if (song.status !== 'playing' && song.status !== 'answering') {
      return false;
    }

    // Can't buzz if locked out
    if (song.lockedOutPlayerIds.includes(playerId)) {
      return false;
    }

    // Can buzz if no one is currently answering
    return true;
  }

  /**
   * Check if song should end
   */
  shouldEndSong(song: RoundSong, activePlayerCount: number): boolean {
    // End if someone got it correct
    if (song.status === 'finished') {
      return true;
    }

    // End if all players are locked out
    if (song.lockedOutPlayerIds.length >= activePlayerCount) {
      return true;
    }

    return false;
  }

  /**
   * Get buzz payload for WebSocket broadcast
   * Fast buzz mode doesn't need questions - master validates manually
   */
  getBuzzPayload(song: RoundSong): Record<string, any> | null {
    this.modeLogger.debug('Creating buzz payload for fast buzz mode', {
      songId: song.song.id,
      songTitle: song.song.title
    });

    // Fast buzz mode doesn't include titleQuestion
    // The client will show a "waiting for master validation" message
    return {};
  }

  /**
   * Fast buzz mode pauses the timer when a player buzzes
   * The master validates manually, so the song timer should pause
   */
  shouldPauseOnBuzz(): boolean {
    return true;
  }

  /**
   * Fast buzz mode requires manual validation
   * Master must click correct/wrong to validate
   */
  requiresManualValidation(): boolean {
    return true;
  }
}
