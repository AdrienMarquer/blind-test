/**
 * Buzz + Multiple Choice Mode
 *
 * Players race to buzz in, then identify artist and title from choices.
 *
 * Flow:
 * 1. Song plays
 * 2. Players can buzz at any time
 * 3. First buzz locks in that player
 * 4. Show 4 artist choices (5s timer)
 * 5. If correct → show 4 title choices
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

    // Artist answer (first question)
    if (answer.type === 'artist') {
      if (isCorrect) {
        // Correct artist → award points, show title choices
        return {
          isCorrect: true,
          pointsAwarded: this.defaultParams.pointsArtist!,
          shouldShowTitleChoices: true,
          lockOutPlayer: false,
          message: 'Correct artist! Now guess the title.',
        };
      } else {
        // Wrong artist → ALWAYS show title choices (title is optional)
        // Player will be locked out AFTER answering title question
        return {
          isCorrect: false,
          pointsAwarded: this.defaultParams.penaltyEnabled! ? this.defaultParams.penaltyAmount! : 0,
          shouldShowTitleChoices: true, // Show title choices even if artist is wrong
          lockOutPlayer: false, // Don't lock out yet - wait for title answer
          message: 'Wrong artist. You can still try the title question.',
        };
      }
    }

    // Title answer (second question - bonus point)
    if (answer.type === 'title') {
      // Check if player's artist answer was correct
      const artistAnswer = song.answers.find(a => a.playerId === answer.playerId && a.type === 'artist');
      const artistWasCorrect = artistAnswer?.isCorrect || false;

      if (isCorrect && artistWasCorrect) {
        // Correct title AND artist was correct → award bonus point, song ends
        return {
          isCorrect: true,
          pointsAwarded: this.defaultParams.pointsTitle!,
          shouldShowTitleChoices: false,
          lockOutPlayer: false,
          message: 'Correct title! Bonus point earned.',
        };
      } else if (isCorrect && !artistWasCorrect) {
        // Correct title but artist was wrong → no points for title, lock out
        return {
          isCorrect: true, // Title was technically correct
          pointsAwarded: 0, // But no points because artist was wrong
          shouldShowTitleChoices: false,
          lockOutPlayer: true,
          message: 'Correct title, but no bonus points since artist was wrong.',
        };
      } else if (!isCorrect && artistWasCorrect) {
        // Wrong title but artist was correct → lock out player (but keep artist points)
        return {
          isCorrect: false,
          pointsAwarded: 0,
          shouldShowTitleChoices: false,
          lockOutPlayer: true,
          message: 'Wrong title. You keep your artist point but are locked out.',
        };
      } else {
        // Wrong title AND artist was wrong → lock out player
        return {
          isCorrect: false,
          pointsAwarded: 0,
          shouldShowTitleChoices: false,
          lockOutPlayer: true,
          message: 'Wrong title. You are locked out.',
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
   *
   * Song ends when the active player has answered BOTH artist and title questions.
   * Title is optional bonus points, but player gets a chance to answer it.
   */
  shouldEndSong(song: RoundSong, activePlayerCount?: number): boolean {
    // Song ends if finished status
    if (song.status === 'finished') {
      return true;
    }

    // Check if the active player has answered BOTH artist and title
    if (song.activePlayerId) {
      const playerAnswers = song.answers.filter(a => a.playerId === song.activePlayerId);
      const hasArtistAnswer = playerAnswers.some(a => a.type === 'artist');
      const hasTitleAnswer = playerAnswers.some(a => a.type === 'title');

      // Only end if the active player has completed both questions
      if (hasArtistAnswer && hasTitleAnswer) {
        const artistCorrect = playerAnswers.find(a => a.type === 'artist')?.isCorrect;
        const titleCorrect = playerAnswers.find(a => a.type === 'title')?.isCorrect;

        this.modeLogger.debug('Active player completed both questions - ending song', {
          playerId: song.activePlayerId,
          artistCorrect,
          titleCorrect
        });
        return true;
      }
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
   * This mode requires artistQuestion to be available (artist first, then title)
   */
  getBuzzPayload(song: RoundSong): Record<string, any> | null {
    // Validate that artistQuestion exists (should have been generated in startSong)
    if (!song.artistQuestion || !song.artistQuestion.choices || song.artistQuestion.choices.length === 0) {
      this.modeLogger.error('Cannot create buzz payload - no artist question available', {
        songId: song.song.id,
        songTitle: song.song.title,
        hasArtistQuestion: !!song.artistQuestion
      });
      return null; // Reject the buzz
    }

    if (song.artistQuestion.choices.length !== 4) {
      this.modeLogger.warn('Artist question has incorrect number of choices', {
        songId: song.song.id,
        choicesCount: song.artistQuestion.choices.length
      });
    }

    this.modeLogger.debug('Creating buzz payload with artist question', {
      songId: song.song.id,
      artistChoicesCount: song.artistQuestion.choices.length
    });

    return {
      artistQuestion: song.artistQuestion // Send artist choices as artistQuestion
    };
  }

  /**
   * Buzz and choice mode pauses the timer on buzz
   * Players get automatic answer timer while song is paused
   */
  shouldPauseOnBuzz(): boolean {
    return true;
  }
}
