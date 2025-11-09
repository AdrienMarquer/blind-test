/**
 * Picture Round Mode (NOT IMPLEMENTED YET)
 *
 * Show images instead of playing music.
 * Players identify what's in the picture.
 *
 * Flow:
 * 1. Image displayed for duration
 * 2. Players buzz and answer
 * 3. Validation and scoring similar to Buzz + Choice
 *
 * Note: This mode extends the quiz concept beyond music.
 * Demonstrates the extensibility of the mode system.
 */

import type { Round, RoundSong, Answer, Song, ModeParams } from '@blind-test/shared';
import { BaseModeHandler, type AnswerResult } from './types';

export class PictureRoundMode extends BaseModeHandler {
  type = 'picture_round' as const;
  name = 'Picture Round';
  description = 'Identify images. Extends quiz beyond music.';

  defaultParams: ModeParams = {
    songDuration: 10, // Display duration
    answerTimer: 5,
    numChoices: 4,
    pointsTitle: 1,
  };

  async handleBuzz(playerId: string, song: RoundSong): Promise<boolean> {
    throw new Error('PictureRoundMode not implemented yet. Coming soon!');
  }

  async handleAnswer(answer: Answer, song: RoundSong): Promise<AnswerResult> {
    throw new Error('PictureRoundMode not implemented yet. Coming soon!');
  }

  validateAnswer(answer: Answer, song: Song): boolean {
    throw new Error('PictureRoundMode not implemented yet. Coming soon!');
  }

  calculateScore(answer: Answer, song: Song, params: ModeParams): number {
    throw new Error('PictureRoundMode not implemented yet. Coming soon!');
  }

  canBuzz(playerId: string, song: RoundSong): boolean {
    throw new Error('PictureRoundMode not implemented yet. Coming soon!');
  }

  shouldEndSong(song: RoundSong): boolean {
    throw new Error('PictureRoundMode not implemented yet. Coming soon!');
  }
}
