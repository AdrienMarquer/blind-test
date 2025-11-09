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
import { TextInputMode } from './TextInputMode';

import { modeRegistry } from './ModeRegistry';

// Register all available modes
modeRegistry.register(new BuzzAndChoiceMode());
modeRegistry.register(new FastBuzzMode());
modeRegistry.register(new TextInputMode());

console.log('[Mode System] Initialized with', modeRegistry.getAvailableTypes().length, 'modes');
console.log('[Mode System] Available:', modeRegistry.getAvailableTypes().join(', '));

// Export the initialized registry
export { modeRegistry };
