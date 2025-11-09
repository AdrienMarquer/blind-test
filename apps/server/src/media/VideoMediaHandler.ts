/**
 * Video Media Handler (NOT IMPLEMENTED YET)
 *
 * Handles video content.
 * Players identify movie/TV show from video clip.
 *
 * Future: Will need Video entity type and storage.
 */

import { BaseMediaHandler } from './types';

export class VideoMediaHandler extends BaseMediaHandler {
  type = 'video' as const;
  name = 'Video/Movie Clip';
  description = 'Show video clips for identification';

  // TODO: Implement video-specific logic
  // - Load video files
  // - Generate choices based on genre/year
  // - Handle video playback timing

  // For now, throws error if used
  async loadContent(): Promise<any> {
    throw new Error('Video media type not implemented yet. Coming soon!');
  }
}
