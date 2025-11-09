/**
 * Fast Buzz Mode (NOT IMPLEMENTED YET)
 *
 * Players buzz and verbally answer.
 * Master manually validates answers.
 *
 * Flow:
 * 1. Song plays
 * 2. Players can buzz at any time
 * 3. Player verbally says answer
 * 4. Master validates (correct/wrong buttons)
 * 5. Points awarded immediately
 */

import type { Round, RoundSong, Answer, Song, ModeParams } from '@blind-test/shared';
import { BaseModeHandler, type AnswerResult } from './types';

export class FastBuzzMode extends BaseModeHandler {
  type = 'fast_buzz' as const;
  name = 'Fast Buzz';
  description = 'Buzz in and answer verbally. Master validates manually.';

  defaultParams: ModeParams = {
    songDuration: 15,
    answerTimer: 5,
    pointsTitle: 1,
    pointsArtist: 1,
    manualValidation: true,
  };

  async handleBuzz(playerId: string, song: RoundSong): Promise<boolean> {
    throw new Error('FastBuzzMode not implemented yet. Coming soon!');
  }

  async handleAnswer(answer: Answer, song: RoundSong): Promise<AnswerResult> {
    throw new Error('FastBuzzMode not implemented yet. Coming soon!');
  }

  validateAnswer(answer: Answer, song: Song): boolean {
    throw new Error('FastBuzzMode not implemented yet. Coming soon!');
  }

  calculateScore(answer: Answer, song: Song, params: ModeParams): number {
    throw new Error('FastBuzzMode not implemented yet. Coming soon!');
  }

  canBuzz(playerId: string, song: RoundSong): boolean {
    throw new Error('FastBuzzMode not implemented yet. Coming soon!');
  }

  shouldEndSong(song: RoundSong): boolean {
    throw new Error('FastBuzzMode not implemented yet. Coming soon!');
  }
}
