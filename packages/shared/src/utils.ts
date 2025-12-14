/**
 * Blind Test - Utility Functions
 */

import type { ModeParams, Mode, Round } from './types';
import { SYSTEM_DEFAULTS } from './types';
import { ROOM_CONFIG, PLAYER_CONFIG, VALIDATION_PATTERNS } from './constants';

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a random unique ID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Generate a 4-character room code (uppercase alphanumeric)
 * Format: XXXX (e.g., "A7B2", "QR4Z")
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';

  for (let i = 0; i < ROOM_CONFIG.CODE_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    code += chars[randomIndex];
  }

  return code;
}

// ============================================================================
// Parameter Inheritance
// ============================================================================

/**
 * Resolve a parameter value using simplified inheritance
 * Order: Round override → Mode default → System default
 *
 * @param paramName - The parameter to resolve
 * @param round - The current round
 * @param mode - The mode configuration
 * @returns The resolved parameter value
 */
export function resolveParam<T>(
  paramName: keyof ModeParams,
  round: Round,
  mode: Mode
): T {
  // 1. Round-level override (highest priority)
  if (round.params[paramName] !== undefined) {
    return round.params[paramName] as T;
  }

  // 2. Mode-level default
  if (mode.defaultParams[paramName] !== undefined) {
    return mode.defaultParams[paramName] as T;
  }

  // 3. System-level fallback
  return SYSTEM_DEFAULTS[paramName] as T;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate player name
 * Uses PLAYER_CONFIG constants for min/max length
 * Allowed: alphanumeric, spaces
 */
export function validatePlayerName(name: string): boolean {
  if (!name || name.length < PLAYER_CONFIG.NAME_MIN_LENGTH || name.length > PLAYER_CONFIG.NAME_MAX_LENGTH) {
    return false;
  }

  return VALIDATION_PATTERNS.PLAYER_NAME.test(name);
}

// ============================================================================
// Array Utilities
// ============================================================================

/**
 * Fisher-Yates shuffle algorithm - randomly shuffle an array
 * This modifies the array in place and returns it for convenience
 *
 * @param array - Array to shuffle (will be modified in place)
 * @returns The same array, shuffled
 */
export function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
