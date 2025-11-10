/**
 * Mode Registry
 *
 * Central registry for all game modes.
 * Manages mode registration and retrieval.
 */

import type { ModeType } from '@blind-test/shared';
import type { ModeHandler } from './types';
import { logger } from '../utils/logger';

const registryLogger = logger.child({ module: 'ModeRegistry' });

/**
 * Singleton registry for all game modes
 */
export class ModeRegistry {
  private static instance: ModeRegistry;
  private handlers = new Map<ModeType, ModeHandler>();

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): ModeRegistry {
    if (!ModeRegistry.instance) {
      ModeRegistry.instance = new ModeRegistry();
    }
    return ModeRegistry.instance;
  }

  /**
   * Register a mode handler
   */
  register(handler: ModeHandler): void {
    if (this.handlers.has(handler.type)) {
      registryLogger.warn('Overwriting existing mode handler', { modeType: handler.type });
    }

    this.handlers.set(handler.type, handler);
    registryLogger.debug('Registered mode', { modeType: handler.type, name: handler.name });
  }

  /**
   * Get a mode handler by type
   * Throws error if mode not found
   */
  get(type: ModeType): ModeHandler {
    const handler = this.handlers.get(type);

    if (!handler) {
      throw new Error(
        `Mode not implemented: ${type}. Available modes: ${Array.from(this.handlers.keys()).join(', ')}`
      );
    }

    return handler;
  }

  /**
   * Check if a mode is registered
   */
  has(type: ModeType): boolean {
    return this.handlers.has(type);
  }

  /**
   * Get all registered modes
   */
  getAll(): ModeHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Get all available mode types
   */
  getAvailableTypes(): ModeType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get metadata for all modes (for UI)
   */
  getMetadata(): Array<{ type: ModeType; name: string; description: string }> {
    return this.getAll().map(handler => ({
      type: handler.type,
      name: handler.name,
      description: handler.description,
    }));
  }
}

// Export singleton instance
export const modeRegistry = ModeRegistry.getInstance();
