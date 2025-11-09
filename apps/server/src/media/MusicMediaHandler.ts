/**
 * Music Media Handler
 *
 * Handles music/audio content.
 * This is the primary media type for blind test games.
 */

import { BaseMediaHandler } from './types';

export class MusicMediaHandler extends BaseMediaHandler {
  type = 'music' as const;
  name = 'Music/Audio';
  description = 'Play audio clips from music library';

  // Uses default implementations from BaseMediaHandler
  // - loadContent: Works perfectly for Song objects
  // - generateWrongChoices: Genre/year-based similarity
  // - validateMatch: Case-insensitive exact match
}
