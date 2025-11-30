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
import { logger } from '../utils/logger';

/**
 * Result of an answer validation
 */
export interface AnswerResult {
  isCorrect: boolean;
  pointsAwarded: number;
  message?: string;

  // Buzz + Choice specific
  shouldShowTitleChoices?: boolean; // If artist answered, show title choices
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
   * @param buzzTimestamp - Client-side timestamp for race condition resolution
   */
  handleBuzz(playerId: string, song: RoundSong, buzzTimestamp?: number): Promise<boolean>;

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
   * @param activePlayerCount - Optional count of active players for all-locked-out detection
   */
  shouldEndSong(song: RoundSong, activePlayerCount?: number): boolean;

  /**
   * Get the payload to include in the player:buzzed WebSocket event
   * Each mode can customize what data clients receive when a player buzzes
   * Returns null if the buzz should be rejected (e.g., missing required data)
   * @param song - The current song
   * @returns Payload object to merge into the buzz event, or null to reject
   */
  getBuzzPayload(song: RoundSong): Record<string, any> | null;

  /**
   * Determine if the song timer should pause when a player buzzes
   * This allows modes to control their own timer behavior:
   * - Manual validation modes (FastBuzz): return true to pause timer
   * - Automatic validation modes (BuzzAndChoice, TextInput): return false to keep timer running
   *
   * @returns true if song timer should pause on buzz, false otherwise
   */
  shouldPauseOnBuzz(): boolean;

  /**
   * Determine if the mode requires the master to manually validate answers
   * - FastBuzz: returns true (master clicks correct/wrong)
   * - BuzzAndChoice: returns false (player clicks choice, server validates automatically)
   * - TextInput: returns false (server compares answer automatically)
   *
   * @returns true if master must validate answers, false for automatic validation
   */
  requiresManualValidation(): boolean;
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

  protected get modeLogger() {
    return logger.child({ module: `Mode:${this.type}` });
  }

  async startRound(round: Round): Promise<void> {
    this.modeLogger.debug('Starting round', { roundIndex: round.index });
  }

  async startSong(song: RoundSong, allSongs: Song[], mediaType: MediaType): Promise<void> {
    this.modeLogger.debug('Starting song', { songIndex: song.index, mediaType });
  }

  async endSong(song: RoundSong): Promise<void> {
    this.modeLogger.debug('Ending song', { songIndex: song.index });
  }

  isRoundComplete(round: Round): boolean {
    // Default: round is complete when all songs are finished
    return round.songs.every(s => s.status === 'finished');
  }

  /**
   * NOTE: Parameter resolution for game flow (songDuration, answerTimer, manualValidation)
   * is handled by GameService using ParameterResolver, which properly implements the
   * inheritance chain: round.params → mode.defaultParams → SYSTEM_DEFAULTS
   *
   * Mode handlers should use this.defaultParams for their internal logic.
   * Round-level parameter overrides are applied by GameService before calling mode methods.
   */

  // Abstract methods (must be implemented by subclasses)
  abstract handleBuzz(playerId: string, song: RoundSong, buzzTimestamp?: number): Promise<boolean>;
  abstract handleAnswer(answer: Answer, song: RoundSong): Promise<AnswerResult>;
  abstract validateAnswer(answer: Answer, song: Song): boolean;
  abstract calculateScore(answer: Answer, song: Song, params: ModeParams): number;
  abstract canBuzz(playerId: string, song: RoundSong): boolean;
  abstract shouldEndSong(song: RoundSong, activePlayerCount?: number): boolean;
  abstract getBuzzPayload(song: RoundSong): Record<string, any> | null;
  abstract shouldPauseOnBuzz(): boolean;
  abstract requiresManualValidation(): boolean;
}
