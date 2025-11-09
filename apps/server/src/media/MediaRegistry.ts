/**
 * Media Registry
 *
 * Central registry for all media types.
 * Manages media handler registration and retrieval.
 */

import type { MediaType } from '@blind-test/shared';
import type { MediaHandler } from './types';

/**
 * Singleton registry for all media handlers
 */
export class MediaRegistry {
  private static instance: MediaRegistry;
  private handlers = new Map<MediaType, MediaHandler>();

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): MediaRegistry {
    if (!MediaRegistry.instance) {
      MediaRegistry.instance = new MediaRegistry();
    }
    return MediaRegistry.instance;
  }

  /**
   * Register a media handler
   */
  register(handler: MediaHandler): void {
    if (this.handlers.has(handler.type)) {
      console.warn(`[MediaRegistry] Overwriting existing handler for media: ${handler.type}`);
    }

    this.handlers.set(handler.type, handler);
    console.log(`[MediaRegistry] Registered media: ${handler.type} (${handler.name})`);
  }

  /**
   * Get a media handler by type
   * Throws error if media not found
   */
  get(type: MediaType): MediaHandler {
    const handler = this.handlers.get(type);

    if (!handler) {
      throw new Error(
        `Media type not implemented: ${type}. Available types: ${Array.from(this.handlers.keys()).join(', ')}`
      );
    }

    return handler;
  }

  /**
   * Check if a media type is registered
   */
  has(type: MediaType): boolean {
    return this.handlers.has(type);
  }

  /**
   * Get all registered media handlers
   */
  getAll(): MediaHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Get all available media types
   */
  getAvailableTypes(): MediaType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get metadata for all media types (for UI)
   */
  getMetadata(): Array<{ type: MediaType; name: string; description: string }> {
    return this.getAll().map(handler => ({
      type: handler.type,
      name: handler.name,
      description: handler.description,
    }));
  }
}

// Export singleton instance
export const mediaRegistry = MediaRegistry.getInstance();
