/**
 * Mode System - Core Types and Interfaces
 *
 * Defines the contract for all game modes.
 * Each mode is a self-contained gameplay ruleset that defines:
 * - Player interactions (buzz, answer, guess)
 * - Validation logic
 * - Scoring rules
 * - Game flow (when songs/rounds end)
 */

import type { Round, RoundSong, Answer, Song, ModeType, ModeParams, MediaType } from '@blind-test/shared';

/**
 * Result of an answer validation
 */
export interface AnswerResult {
  isCorrect: boolean;
  pointsAwarded: number;
  message?: string;

  // Buzz + Choice specific
  shouldShowArtistChoices?: boolean; // If title correct, show artist choices
  lockOutPlayer?: boolean;           // If wrong, lock player out
}

/**
 * Mode Handler Interface
 *
 * Every mode must implement this interface.
 * The game engine will call these methods to execute the mode.
 */
export interface ModeHandler {
  // Metadata
  type: ModeType;
  name: string;
  description: string;
  defaultParams: ModeParams;

  // === Game Flow ===

  /**
   * Called when a round starts
   * Setup any round-specific state
   */
  startRound(round: Round): Promise<void>;

  /**
   * Called when a song starts playing
   * Initialize song-specific state (choices, timers, etc.)
   * @param mediaType - The media type for this round (music, picture, video, text_question)
   */
  startSong(song: RoundSong, allSongs: Song[], mediaType: MediaType): Promise<void>;

  /**
   * Called when a song ends
   * Calculate final scores, cleanup state
   */
  endSong(song: RoundSong): Promise<void>;

  // === Player Actions ===

  /**
   * Handle a player buzzing in
   * Returns true if buzz is accepted, false if rejected
   */
  handleBuzz(playerId: string, song: RoundSong): Promise<boolean>;

  /**
   * Handle a player submitting an answer
   * Returns the validation result with score
   */
  handleAnswer(answer: Answer, song: RoundSong): Promise<AnswerResult>;

  // === Validation & Scoring ===

  /**
   * Validate if an answer is correct
   * (Pure validation logic, no side effects)
   */
  validateAnswer(answer: Answer, song: Song): boolean;

  /**
   * Calculate points for an answer
   * (Based on correctness, speed, mode params)
   */
  calculateScore(answer: Answer, song: Song, params: ModeParams): number;

  // === State Checks ===

  /**
   * Check if a player can buzz for this song
   * (Not locked out, song is playing, etc.)
   */
  canBuzz(playerId: string, song: RoundSong): boolean;

  /**
   * Check if a round is complete
   * (All songs played, or other end conditions)
   */
  isRoundComplete(round: Round): boolean;

  /**
   * Check if a song should end
   * (Correct answer found, timer expired, all locked out)
   */
  shouldEndSong(song: RoundSong): boolean;
}

/**
 * Base class for mode handlers
 * Provides common functionality
 */
export abstract class BaseModeHandler implements ModeHandler {
  abstract type: ModeType;
  abstract name: string;
  abstract description: string;
  abstract defaultParams: ModeParams;

  // Default implementations (can be overridden)

  async startRound(round: Round): Promise<void> {
    console.log(`[${this.type}] Starting round ${round.index}`);
  }

  async startSong(song: RoundSong, allSongs: Song[], mediaType: MediaType): Promise<void> {
    console.log(`[${this.type}] Starting song ${song.index} with media type: ${mediaType}`);
  }

  async endSong(song: RoundSong): Promise<void> {
    console.log(`[${this.type}] Ending song ${song.index}`);
  }

  isRoundComplete(round: Round): boolean {
    // Default: round is complete when all songs are finished
    return round.songs.every(s => s.status === 'finished');
  }

  // Abstract methods (must be implemented by subclasses)
  abstract handleBuzz(playerId: string, song: RoundSong): Promise<boolean>;
  abstract handleAnswer(answer: Answer, song: RoundSong): Promise<AnswerResult>;
  abstract validateAnswer(answer: Answer, song: Song): boolean;
  abstract calculateScore(answer: Answer, song: Song, params: ModeParams): number;
  abstract canBuzz(playerId: string, song: RoundSong): boolean;
  abstract shouldEndSong(song: RoundSong): boolean;
}
