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

import type { Round, RoundSong, Answer, Song, ModeParams } from '@blind-test/shared';
import { BaseModeHandler, type AnswerResult } from './types';

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
  async startSong(song: RoundSong, allSongs: Song[]): Promise<void> {
    await super.startSong(song, allSongs);

    // Generate multiple choice options
    const correctSong = song.song;

    // Generate 4 title choices (1 correct, 3 wrong)
    song.titleChoices = this.generateTitleChoices(correctSong, allSongs);

    // Generate 4 artist choices (1 correct, 3 wrong)
    song.artistChoices = this.generateArtistChoices(correctSong, allSongs);

    console.log(`[BuzzAndChoice] Generated choices for song "${correctSong.title}"`);
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
   * Generate 4 title choices (1 correct, 3 wrong from similar songs)
   */
  private generateTitleChoices(correctSong: Song, allSongs: Song[]): string[] {
    const choices = new Set<string>();

    // Add correct answer
    choices.add(correctSong.title);

    // Filter potential wrong answers (same genre/era preferred)
    const similarSongs = allSongs.filter(s =>
      s.id !== correctSong.id &&
      s.title !== correctSong.title &&
      (s.genre === correctSong.genre || Math.abs(s.year - correctSong.year) <= 5)
    );

    // Add wrong answers
    const wrongAnswers = this.selectRandomSongs(similarSongs, allSongs, 3);
    wrongAnswers.forEach(song => choices.add(song.title));

    // Convert to array and shuffle
    return this.shuffleArray(Array.from(choices)).slice(0, 4);
  }

  /**
   * Generate 4 artist choices (1 correct, 3 wrong from similar songs)
   */
  private generateArtistChoices(correctSong: Song, allSongs: Song[]): string[] {
    const choices = new Set<string>();

    // Add correct answer
    choices.add(correctSong.artist);

    // Filter potential wrong answers
    const similarSongs = allSongs.filter(s =>
      s.id !== correctSong.id &&
      s.artist !== correctSong.artist &&
      (s.genre === correctSong.genre || Math.abs(s.year - correctSong.year) <= 5)
    );

    // Add wrong answers
    const wrongAnswers = this.selectRandomSongs(similarSongs, allSongs, 3);
    wrongAnswers.forEach(song => choices.add(song.artist));

    // Convert to array and shuffle
    return this.shuffleArray(Array.from(choices)).slice(0, 4);
  }

  /**
   * Select random songs, preferring similar ones
   */
  private selectRandomSongs(similarSongs: Song[], allSongs: Song[], count: number): Song[] {
    const selected: Song[] = [];

    // Try to use similar songs first
    const shuffledSimilar = this.shuffleArray([...similarSongs]);
    selected.push(...shuffledSimilar.slice(0, count));

    // If not enough similar songs, add random ones
    if (selected.length < count) {
      const shuffledAll = this.shuffleArray([...allSongs]);
      const additional = shuffledAll.filter(s => !selected.some(sel => sel.id === s.id));
      selected.push(...additional.slice(0, count - selected.length));
    }

    return selected.slice(0, count);
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
