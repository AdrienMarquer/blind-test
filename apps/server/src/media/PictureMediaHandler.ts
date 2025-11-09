/**
 * Picture Media Handler (NOT IMPLEMENTED YET)
 *
 * Handles image/picture content.
 * Players identify what's in the picture.
 *
 * Future: Will need Picture entity type and storage.
 * For now, reuses Song entity with image files.
 */

import { BaseMediaHandler } from './types';

export class PictureMediaHandler extends BaseMediaHandler {
  type = 'picture' as const;
  name = 'Picture/Image';
  description = 'Show images for identification';

  // TODO: Implement picture-specific logic
  // - Load image files
  // - Generate choices based on image tags/categories
  // - Handle image display timing

  // For now, uses default Song-based implementation
  // When implementing: replace Song with Picture entity
}
