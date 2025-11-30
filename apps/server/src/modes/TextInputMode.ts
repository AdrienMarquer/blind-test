/**
 * Text Input Mode
 *
 * Players type their answers.
 * System validates using fuzzy matching.
 *
 * Flow:
 * 1. Song plays
 * 2. Players type title and/or artist
 * 3. System validates with fuzzy matching (allow typos)
 * 4. Points awarded for each correct field
 * 5. No buzzing or lockouts
 */

import { DEFAULT_SONG_DURATION, type Round, type RoundSong, type Answer, type Song, type ModeParams, type MediaType } from '@blind-test/shared';
import { BaseModeHandler, type AnswerResult } from './types';

export class TextInputMode extends BaseModeHandler {
  type = 'text_input' as const;
  name = 'Text Input';
  description = 'Type your answers. Fuzzy matching allows for small typos.';

  defaultParams: ModeParams = {
    songDuration: DEFAULT_SONG_DURATION,
    answerTimer: 15,
    pointsTitle: 1,
    pointsArtist: 1,
    fuzzyMatch: true,
    levenshteinDistance: 2,
  };

  /**
   * No buzzing in text input mode
   */
  async handleBuzz(playerId: string, song: RoundSong, timestamp?: number): Promise<boolean> {
    return false;
  }

  /**
   * Handle typed answer - validate with fuzzy matching
   */
  async handleAnswer(answer: Answer, song: RoundSong): Promise<AnswerResult> {
    // Use song params if available (set by GameService), otherwise fall back to mode defaults
    const params = song.params ?? this.defaultParams;
    const isCorrect = this.validateAnswer(answer, song.song, params);

    // Calculate points based on the validated correctness
    let pointsAwarded = 0;
    if (isCorrect) {
      if (answer.type === 'title') {
        pointsAwarded = params.pointsTitle || 1;
      } else if (answer.type === 'artist') {
        pointsAwarded = params.pointsArtist || 1;
      }
    }

    return {
      isCorrect,
      pointsAwarded,
      shouldShowTitleChoices: false,
      lockOutPlayer: false, // No lockouts in text input mode
    };
  }

  /**
   * Validate answer using fuzzy matching
   */
  validateAnswer(answer: Answer, song: Song, params?: ModeParams): boolean {
    const fuzzyMatch = params?.fuzzyMatch ?? this.defaultParams.fuzzyMatch ?? true;
    const maxDistance = params?.levenshteinDistance ?? this.defaultParams.levenshteinDistance ?? 2;

    const userAnswer = answer.value.trim().toLowerCase();

    // Empty strings should never be valid
    if (userAnswer.length === 0) {
      return false;
    }

    if (answer.type === 'title') {
      const correctTitle = song.title.trim().toLowerCase();
      return this.matchStrings(userAnswer, correctTitle, fuzzyMatch, maxDistance);
    } else if (answer.type === 'artist') {
      const correctArtist = song.artist.trim().toLowerCase();
      return this.matchStrings(userAnswer, correctArtist, fuzzyMatch, maxDistance);
    }

    return false;
  }

  /**
   * Match strings with optional fuzzy matching
   */
  private matchStrings(userInput: string, correct: string, fuzzyMatch: boolean, maxDistance: number): boolean {
    // Exact match (case-insensitive)
    if (userInput === correct) {
      return true;
    }

    if (!fuzzyMatch) {
      return false;
    }

    // Fuzzy match using Levenshtein distance
    const distance = this.levenshteinDistance(userInput, correct);
    return distance <= maxDistance;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Calculate score based on answer correctness
   */
  calculateScore(answer: Answer, song: Song, params: ModeParams): number {
    if (!answer.isCorrect) {
      return 0;
    }

    if (answer.type === 'title') {
      return params.pointsTitle || 1;
    } else if (answer.type === 'artist') {
      return params.pointsArtist || 1;
    }

    return 0;
  }

  /**
   * No buzzing in text input mode
   */
  canBuzz(playerId: string, song: RoundSong): boolean {
    return false;
  }

  /**
   * Song ends when timer runs out (no early completion)
   */
  shouldEndSong(song: RoundSong, activePlayerCount: number): boolean {
    // Text input mode typically waits for timer
    // Song will end when timer expires
    return song.status === 'finished';
  }

  /**
   * Get buzz payload for WebSocket broadcast
   * Text input mode doesn't support buzzing
   */
  getBuzzPayload(song: RoundSong): Record<string, any> | null {
    this.modeLogger.warn('Buzz attempted in text input mode - rejecting', {
      songId: song.song.id
    });

    // Text input mode doesn't use buzzing at all
    return null;
  }

  /**
   * Text input mode doesn't support buzzing, so this is never called
   * Return false as default (won't be used)
   */
  shouldPauseOnBuzz(): boolean {
    return false;
  }

  /**
   * Text input mode uses automatic validation
   * Server compares player's text input to correct answer
   */
  requiresManualValidation(): boolean {
    return false;
  }
}
