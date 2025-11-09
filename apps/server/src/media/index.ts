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

// Register all available media types
mediaRegistry.register(new MusicMediaHandler());
mediaRegistry.register(new PictureMediaHandler());
mediaRegistry.register(new VideoMediaHandler());
mediaRegistry.register(new TextQuestionMediaHandler());

console.log('[Media System] Initialized with', mediaRegistry.getAvailableTypes().length, 'media types');
console.log('[Media System] Available:', mediaRegistry.getAvailableTypes().join(', '));

// Export the initialized registry
export { mediaRegistry };
