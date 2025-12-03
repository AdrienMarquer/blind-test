/**
 * Mode System - Entry Point
 *
 * Exports all mode handlers and initializes the registry.
 * Import this module to access the mode system.
 */

export * from './types';
export * from './ModeRegistry';

// Import mode handlers
import { BuzzAndChoiceMode } from './BuzzAndChoiceMode';
import { FastBuzzMode } from './FastBuzzMode';

import { modeRegistry } from './ModeRegistry';
import { logger } from '../utils/logger';

const modeLogger = logger.child({ module: 'ModeSystem' });

// Register all available modes
modeRegistry.register(new BuzzAndChoiceMode());
modeRegistry.register(new FastBuzzMode());

modeLogger.info('Mode system initialized', {
  count: modeRegistry.getAvailableTypes().length,
  modes: modeRegistry.getAvailableTypes()
});

// Export the initialized registry
export { modeRegistry };
