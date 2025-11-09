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

import type { Round, RoundSong, Answer, Song, ModeParams, MediaType } from '@blind-test/shared';
import { BaseModeHandler, type AnswerResult } from './types';
import { mediaRegistry } from '../media';

export class BuzzAndChoiceMode extends BaseModeHandler {
  type = 'buzz_and_choice' as const;
  name = 'Buzz + Multiple Choice';
  description = 'Race to buzz in, then identify title and artist from multiple choice options';

  defaultParams: ModeParams = {
    songDuration: 15,
    answerTimer: 5,
    numChoices: 4,
    pointsTitle: 1,
    pointsArtist: 1,
    penaltyEnabled: false,
    penaltyAmount: 0,
    allowRebuzz: true,
  };

  /**
   * Initialize song with multiple choice options
   */
  async startSong(song: RoundSong, allSongs: Song[], mediaType: MediaType): Promise<void> {
    await super.startSong(song, allSongs, mediaType);

    // Get the appropriate media handler
    const mediaHandler = mediaRegistry.get(mediaType);

    // Load media content
    const correctSong = song.song;
    const mediaContent = await mediaHandler.loadContent(correctSong);

    // Generate 3 wrong choices for title and artist
    const wrongTitles = mediaHandler.generateWrongChoices(mediaContent, allSongs, 3, 'title');
    const wrongArtists = mediaHandler.generateWrongChoices(mediaContent, allSongs, 3, 'artist');

    // Combine correct answer with wrong answers and shuffle
    song.titleChoices = this.shuffleArray([mediaContent.title, ...wrongTitles]);
    song.artistChoices = this.shuffleArray([mediaContent.artist || '', ...wrongArtists]);

    console.log(`[BuzzAndChoice] Generated choices for ${mediaType}: "${correctSong.title}"`);
  }

  /**
   * Handle player buzzing in
   */
  async handleBuzz(playerId: string, song: RoundSong): Promise<boolean> {
    // Check if player can buzz
    if (!this.canBuzz(playerId, song)) {
      console.log(`[BuzzAndChoice] Player ${playerId} cannot buzz (locked out or song not playing)`);
      return false;
    }

    // Check if someone else is already answering
    if (song.activePlayerId) {
      console.log(`[BuzzAndChoice] Player ${playerId} buzz rejected (${song.activePlayerId} is active)`);
      return false;
    }

    // Accept the buzz
    song.activePlayerId = playerId;
    song.status = 'answering';

    console.log(`[BuzzAndChoice] Player ${playerId} buzzed in!`);
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
   */
  shouldEndSong(song: RoundSong): boolean {
    // Song ends if finished status
    if (song.status === 'finished') {
      return true;
    }

    // TODO: Check if timer expired (needs timer implementation)
    // TODO: Check if all players locked out

    return false;
  }

  /**
   * Shuffle array (Fisher-Yates algorithm)
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
