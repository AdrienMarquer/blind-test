/**
 * Buzz + Multiple Choice Mode
 *
 * Players race to buzz in, then identify title and artist from choices.
 *
 * Flow:
 * 1. Song plays
 * 2. Players can buzz at any time
 * 3. First buzz locks in that player
 * 4. Show 4 title choices (5s timer)
 * 5. If correct → show 4 artist choices
 * 6. If wrong → player locked out, others can buzz
 * 7. Song ends when both correct or timer expires
 */

import { DEFAULT_SONG_DURATION, type Round, type RoundSong, type Answer, type Song, type ModeParams, type MediaType } from '@blind-test/shared';
import { BaseModeHandler, type AnswerResult } from './types';
import { answerGenerationService, AnswerGenerationService } from '../services/AnswerGenerationService';

export class BuzzAndChoiceMode extends BaseModeHandler {
  type = 'buzz_and_choice' as const;
  name = 'Buzz + Multiple Choice';
  description = 'Race to buzz in, then identify title and artist from multiple choice options';

  private answerService: AnswerGenerationService;

  constructor(answerService?: AnswerGenerationService) {
    super();
    // Allow dependency injection for testing, default to singleton
    this.answerService = answerService || answerGenerationService;
  }

  defaultParams: ModeParams = {
    songDuration: DEFAULT_SONG_DURATION,
    answerTimer: 5,
    numChoices: 4,
    pointsTitle: 1,
    pointsArtist: 1,
    penaltyEnabled: false,
    penaltyAmount: 0,
    allowRebuzz: true,
  };

  /**
   * Initialize song with multiple choice questions
   */
  async startSong(song: RoundSong, allSongs: Song[], mediaType: MediaType): Promise<void> {
    await super.startSong(song, allSongs, mediaType);

    const correctSong = song.song;

    this.modeLogger.debug('Generating MediaQuestions for song', {
      songId: correctSong.id,
      songTitle: correctSong.title,
      songArtist: correctSong.artist
    });

    try {
      // Generate title and artist questions upfront
      song.titleQuestion = await this.answerService.generateTitleQuestion(correctSong, mediaType);
      song.artistQuestion = await this.answerService.generateArtistQuestion(correctSong, mediaType);

      this.modeLogger.info('Generated MediaQuestions for buzz mode', {
        mediaType,
        songTitle: correctSong.title,
        songArtist: correctSong.artist || 'Unknown Artist',
        titleChoicesCount: song.titleQuestion.choices.length,
        artistChoicesCount: song.artistQuestion.choices.length
      });
    } catch (error) {
      this.modeLogger.error('CRITICAL: Failed to generate MediaQuestions', {
        error,
        songId: correctSong.id,
        songTitle: correctSong.title
      });
      throw error; // Let it fail - emergency fallbacks are in the service layer
    }
  }

  /**
   * Handle player buzzing in
   */
  async handleBuzz(playerId: string, song: RoundSong, buzzTimestamp?: number): Promise<boolean> {
    const timestamp = buzzTimestamp || Date.now();

    // Check if player can buzz
    if (!this.canBuzz(playerId, song)) {
      this.modeLogger.debug('Buzz rejected - player cannot buzz', { playerId, songIndex: song.index });
      return false;
    }

    // Check if someone else is already answering
    if (song.activePlayerId) {
      this.modeLogger.debug('Buzz rejected - another player active', { playerId, activePlayerId: song.activePlayerId });
      return false;
    }

    // Store buzz timestamp for this player (for race condition resolution)
    if (!song.buzzTimestamps) {
      song.buzzTimestamps = new Map();
    }

    // Check if another player buzzed first (race condition check)
    if (song.buzzTimestamps.size > 0) {
      // Someone else also buzzed - use timestamps to determine winner
      const otherBuzzes = Array.from(song.buzzTimestamps.entries());
      const earliestBuzz = otherBuzzes.sort((a, b) => a[1] - b[1])[0];

      if (earliestBuzz[1] < timestamp) {
        // Another player buzzed first
        this.modeLogger.debug('Buzz rejected - another player buzzed first', {
          playerId,
          winnerPlayerId: earliestBuzz[0],
          timeDiff: timestamp - earliestBuzz[1]
        });
        return false;
      }
    }

    // Record this buzz
    song.buzzTimestamps.set(playerId, timestamp);

    // Accept the buzz
    song.activePlayerId = playerId;
    song.status = 'answering';

    this.modeLogger.debug('Player buzzed in', { playerId, songIndex: song.index, timestamp });
    return true;
  }

  /**
   * Handle player submitting an answer
   */
  async handleAnswer(answer: Answer, song: RoundSong): Promise<AnswerResult> {
    const isCorrect = this.validateAnswer(answer, song.song);

    // Title answer
    if (answer.type === 'title') {
      if (isCorrect) {
        // Correct title → award points, show artist choices
        return {
          isCorrect: true,
          pointsAwarded: this.defaultParams.pointsTitle!,
          shouldShowArtistChoices: true,
          lockOutPlayer: false,
          message: 'Correct title! Now guess the artist.',
        };
      } else {
        // Wrong title → lock out player, allow others to buzz
        return {
          isCorrect: false,
          pointsAwarded: this.defaultParams.penaltyEnabled! ? this.defaultParams.penaltyAmount! : 0,
          shouldShowArtistChoices: false,
          lockOutPlayer: true,
          message: 'Wrong title. You are locked out.',
        };
      }
    }

    // Artist answer
    if (answer.type === 'artist') {
      if (isCorrect) {
        // Correct artist → award points, song ends
        return {
          isCorrect: true,
          pointsAwarded: this.defaultParams.pointsArtist!,
          shouldShowArtistChoices: false,
          lockOutPlayer: false,
          message: 'Correct artist! Song complete.',
        };
      } else {
        // Wrong artist → lock out player (but keep title points)
        return {
          isCorrect: false,
          pointsAwarded: 0,
          shouldShowArtistChoices: false,
          lockOutPlayer: true,
          message: 'Wrong artist. You keep your title point but are locked out.',
        };
      }
    }

    // Shouldn't reach here
    throw new Error(`Unknown answer type: ${answer.type}`);
  }

  /**
   * Validate if an answer is correct
   */
  validateAnswer(answer: Answer, song: Song): boolean {
    const normalizedAnswer = answer.value.toLowerCase().trim();

    if (answer.type === 'title') {
      const normalizedTitle = song.title.toLowerCase().trim();
      return normalizedAnswer === normalizedTitle;
    }

    if (answer.type === 'artist') {
      const normalizedArtist = song.artist.toLowerCase().trim();
      return normalizedAnswer === normalizedArtist;
    }

    return false;
  }

  /**
   * Calculate score for an answer
   */
  calculateScore(answer: Answer, song: Song, params: ModeParams): number {
    const isCorrect = this.validateAnswer(answer, song);

    if (!isCorrect) {
      // Wrong answer
      return params.penaltyEnabled ? (params.penaltyAmount || 0) : 0;
    }

    // Correct answer
    if (answer.type === 'title') {
      return params.pointsTitle || 1;
    }

    if (answer.type === 'artist') {
      return params.pointsArtist || 1;
    }

    return 0;
  }

  /**
   * Check if a player can buzz
   */
  canBuzz(playerId: string, song: RoundSong): boolean {
    // Can't buzz if song isn't playing
    if (song.status !== 'playing') {
      return false;
    }

    // Can't buzz if locked out
    if (song.lockedOutPlayerIds.includes(playerId)) {
      return false;
    }

    return true;
  }

  /**
   * Check if song should end
   *
   * Override to accept optional activePlayerCount for all-locked-out detection
   */
  shouldEndSong(song: RoundSong, activePlayerCount?: number): boolean {
    // Song ends if finished status
    if (song.status === 'finished') {
      return true;
    }

    // Check if someone answered both title and artist correctly
    const titleAnswer = song.answers.find(a => a.type === 'title' && a.isCorrect);
    const artistAnswer = song.answers.find(a => a.type === 'artist' && a.isCorrect);
    if (titleAnswer && artistAnswer) {
      return true;
    }

    // Check if all active players are locked out (nobody left to buzz)
    if (activePlayerCount !== undefined && song.lockedOutPlayerIds.length >= activePlayerCount) {
      this.modeLogger.debug('All players locked out - ending song', {
        lockedOut: song.lockedOutPlayerIds.length,
        active: activePlayerCount
      });
      return true;
    }

    // Timer expiry is handled by GameService

    return false;
  }

  /**
   * Get buzz payload for WebSocket broadcast
   * This mode requires titleQuestion to be available
   */
  getBuzzPayload(song: RoundSong): Record<string, any> | null {
    // Validate that titleQuestion exists (should have been generated in startSong)
    if (!song.titleQuestion || !song.titleQuestion.choices || song.titleQuestion.choices.length === 0) {
      this.modeLogger.error('Cannot create buzz payload - no title question available', {
        songId: song.song.id,
        songTitle: song.song.title,
        hasTitleQuestion: !!song.titleQuestion
      });
      return null; // Reject the buzz
    }

    if (song.titleQuestion.choices.length !== 4) {
      this.modeLogger.warn('Title question has incorrect number of choices', {
        songId: song.song.id,
        choicesCount: song.titleQuestion.choices.length
      });
    }

    this.modeLogger.debug('Creating buzz payload with title question', {
      songId: song.song.id,
      titleChoicesCount: song.titleQuestion.choices.length
    });

    return {
      titleQuestion: song.titleQuestion
    };
  }

  /**
   * Buzz and choice mode does NOT pause the timer on buzz
   * Players get automatic answer timer instead
   */
  shouldPauseOnBuzz(): boolean {
    return false;
  }
}
