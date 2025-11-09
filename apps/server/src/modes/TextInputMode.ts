/**
 * Text Input Mode (NOT IMPLEMENTED YET)
 *
 * Players type their answers.
 * System validates using fuzzy matching.
 *
 * Flow:
 * 1. Song plays
 * 2. Players type title and artist
 * 3. System validates with fuzzy matching (allow typos)
 * 4. Points awarded for each correct field
 * 5. No buzzing or lockouts
 */

import type { Round, RoundSong, Answer, Song, ModeParams } from '@blind-test/shared';
import { BaseModeHandler, type AnswerResult } from './types';

export class TextInputMode extends BaseModeHandler {
  type = 'text_input' as const;
  name = 'Text Input';
  description = 'Type your answers. Fuzzy matching allows for small typos.';

  defaultParams: ModeParams = {
    songDuration: 20,
    answerTimer: 10,
    pointsTitle: 1,
    pointsArtist: 1,
    fuzzyMatch: true,
    levenshteinDistance: 2,
  };

  async handleBuzz(playerId: string, song: RoundSong): Promise<boolean> {
    throw new Error('TextInputMode not implemented yet. Coming soon!');
  }

  async handleAnswer(answer: Answer, song: RoundSong): Promise<AnswerResult> {
    throw new Error('TextInputMode not implemented yet. Coming soon!');
  }

  validateAnswer(answer: Answer, song: Song): boolean {
    throw new Error('TextInputMode not implemented yet. Coming soon!');
  }

  calculateScore(answer: Answer, song: Song, params: ModeParams): number {
    throw new Error('TextInputMode not implemented yet. Coming soon!');
  }

  canBuzz(playerId: string, song: RoundSong): boolean {
    // No buzzing in text input mode
    return false;
  }

  shouldEndSong(song: RoundSong): boolean {
    throw new Error('TextInputMode not implemented yet. Coming soon!');
  }
}
