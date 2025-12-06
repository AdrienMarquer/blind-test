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

/**
 * Resolve all parameters for a round, merging mode and round-specific params
 *
 * @param round - The current round
 * @param mode - The mode configuration
 * @returns Complete ModeParams with all values resolved
 */
export function resolveAllParams(round: Round, mode: Mode): Required<ModeParams> {
  const keys = Object.keys(SYSTEM_DEFAULTS) as Array<keyof ModeParams>;

  return keys.reduce((params, key) => {
    params[key] = resolveParam(key, round, mode);
    return params;
  }, {} as Required<ModeParams>);
}

// ============================================================================
// QR Code Generation
// ============================================================================

/**
 * Generate a room join URL
 * Note: Actual QR code image generation happens server-side
 *
 * @param roomId - The room UUID
 * @param serverIp - The server IP address
 * @param port - The client port (default: 5173)
 * @returns Join URL for the room
 */
export function generateRoomJoinURL(roomId: string, serverIp: string, port: number = 5173): string {
  return `http://${serverIp}:${port}/room/${roomId}`;
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
// Time Utilities
// ============================================================================

/**
 * Calculate time remaining from a start time and duration
 *
 * @param startedAt - Start timestamp
 * @param duration - Duration in seconds
 * @returns Remaining time in seconds (0 if expired)
 */
export function calculateTimeRemaining(startedAt: Date, duration: number): number {
  const elapsed = (Date.now() - startedAt.getTime()) / 1000;
  const remaining = Math.max(0, duration - elapsed);
  return Math.floor(remaining);
}

/**
 * Calculate answer time in milliseconds
 *
 * @param buzzedAt - When the player buzzed
 * @param answeredAt - When the answer was submitted
 * @returns Time in milliseconds
 */
export function calculateAnswerTime(buzzedAt: Date, answeredAt: Date): number {
  return answeredAt.getTime() - buzzedAt.getTime();
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
