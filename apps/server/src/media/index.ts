/**
 * Media System - Entry Point
 *
 * Exports all media handlers and initializes the registry.
 * Import this module to access the media system.
 */

export * from './types';
export * from './MediaRegistry';

// Import media handlers
import { MusicMediaHandler } from './MusicMediaHandler';
import { PictureMediaHandler } from './PictureMediaHandler';
import { VideoMediaHandler } from './VideoMediaHandler';
import { TextQuestionMediaHandler } from './TextQuestionMediaHandler';

import { mediaRegistry } from './MediaRegistry';
import { logger } from '../utils/logger';

const mediaLogger = logger.child({ module: 'MediaSystem' });

// Register all available media types
mediaRegistry.register(new MusicMediaHandler());
mediaRegistry.register(new PictureMediaHandler());
mediaRegistry.register(new VideoMediaHandler());
mediaRegistry.register(new TextQuestionMediaHandler());

mediaLogger.info('Media system initialized', {
  count: mediaRegistry.getAvailableTypes().length,
  types: mediaRegistry.getAvailableTypes()
});

// Export the initialized registry
export { mediaRegistry };
