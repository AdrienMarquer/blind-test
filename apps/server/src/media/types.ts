/**
 * Media Handler System - Core Types
 *
 * Handles different content types (music, pictures, video, text).
 * Separates WHAT content is shown from HOW the game is played.
 */

import type { Song, MediaType } from '@blind-test/shared';

/**
 * Media Content Interface
 * Represents any type of content that can be used in a round
 */
export interface MediaContent {
  id: string;
  title: string;           // What to identify (song title, picture subject, etc.)
  artist?: string;         // Who created it (artist, photographer, etc.)
  filePath?: string;       // Path to file (music/image/video)
  text?: string;           // Text content for text questions
  metadata: Record<string, any>; // Additional metadata (year, genre, etc.)
}

/**
 * Media Handler Interface
 * Each media type has its own handler
 */
export interface MediaHandler {
  type: MediaType;
  name: string;
  description: string;

  /**
   * Load content for a round
   * Converts Song/Picture/Video to MediaContent
   */
  loadContent(item: Song): Promise<MediaContent>;

  /**
   * Generate wrong answer choices
   * Returns similar but incorrect options
   */
  generateWrongChoices(
    correct: MediaContent,
    allContent: Song[],
    count: number,
    type: 'title' | 'artist'
  ): string[];

  /**
   * Validate if two values match
   * Handles normalization, fuzzy matching, etc.
   */
  validateMatch(answer: string, correct: string): boolean;
}

/**
 * Base class for media handlers
 */
export abstract class BaseMediaHandler implements MediaHandler {
  abstract type: MediaType;
  abstract name: string;
  abstract description: string;

  /**
   * Default content loading (works for Song-based content)
   */
  async loadContent(item: Song): Promise<MediaContent> {
    return {
      id: item.id,
      title: item.title,
      artist: item.artist,
      filePath: item.filePath,
      metadata: {
        album: item.album,
        year: item.year,
        genre: item.genre,
        duration: item.duration,
      },
    };
  }

  /**
   * Default choice generation
   * Select from similar content (same genre/era)
   */
  generateWrongChoices(
    correct: MediaContent,
    allContent: Song[],
    count: number,
    type: 'title' | 'artist'
  ): string[] {
    const correctValue = type === 'title' ? correct.title : correct.artist || '';
    const choices = new Set<string>();

    // Filter similar content
    const similarContent = allContent.filter(item => {
      const value = type === 'title' ? item.title : item.artist;
      return (
        item.id !== correct.id &&
        value !== correctValue &&
        (item.genre === correct.metadata.genre ||
          Math.abs(item.year - correct.metadata.year) <= 5)
      );
    });

    // Add random similar choices
    const shuffled = this.shuffleArray([...similarContent]);
    for (const item of shuffled) {
      const value = type === 'title' ? item.title : item.artist;
      if (value && !choices.has(value)) {
        choices.add(value);
        if (choices.size >= count) break;
      }
    }

    // If not enough similar, add any different ones
    if (choices.size < count) {
      const allShuffled = this.shuffleArray([...allContent]);
      for (const item of allShuffled) {
        const value = type === 'title' ? item.title : item.artist;
        if (value && value !== correctValue && !choices.has(value)) {
          choices.add(value);
          if (choices.size >= count) break;
        }
      }
    }

    return Array.from(choices);
  }

  /**
   * Default validation (case-insensitive exact match)
   */
  validateMatch(answer: string, correct: string): boolean {
    return answer.toLowerCase().trim() === correct.toLowerCase().trim();
  }

  /**
   * Utility: Shuffle array (Fisher-Yates)
   */
  protected shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
