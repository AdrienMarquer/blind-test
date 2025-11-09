/**
 * Text Question Media Handler (NOT IMPLEMENTED YET)
 *
 * Handles text-based trivia questions.
 * Pure quiz mode - no music/images required.
 *
 * Future: Will need Question entity type.
 */

import { BaseMediaHandler } from './types';

export class TextQuestionMediaHandler extends BaseMediaHandler {
  type = 'text_question' as const;
  name = 'Text Question/Trivia';
  description = 'Display text questions for trivia quiz';

  // TODO: Implement text question logic
  // - Load questions from database
  // - Generate wrong answers
  // - Handle question categories

  // For now, throws error if used
  async loadContent(): Promise<any> {
    throw new Error('Text question media type not implemented yet. Coming soon!');
  }
}
