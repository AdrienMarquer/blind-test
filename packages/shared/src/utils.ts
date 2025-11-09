/**
 * Blind Test - Utility Functions
 */

import type { ModeParams, Mode, Round } from './types';
import { SYSTEM_DEFAULTS } from './types';

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

  for (let i = 0; i < 4; i++) {
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
 * Generate a QR code data URL for room joining
 * For Phase 1, this is a placeholder that returns a simple data URL
 * In Phase 3, we'll integrate a proper QR code library
 *
 * @param roomCode - The 4-character room code
 * @param serverIp - The server IP address
 * @returns Data URL for QR code image
 */
export function generateQRCode(roomCode: string, serverIp: string): string {
  // Placeholder: Returns a simple data URL
  // TODO: Integrate QR code library in Phase 3
  const joinUrl = `http://${serverIp}:5173/room/${roomCode}`;
  return `data:text/plain;base64,${btoa(joinUrl)}`;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate room name
 * - Min length: 1 character
 * - Max length: 50 characters
 * - Allowed: alphanumeric, spaces, hyphens, underscores
 */
export function validateRoomName(name: string): boolean {
  if (!name || name.length < 1 || name.length > 50) {
    return false;
  }

  const validPattern = /^[a-zA-Z0-9\s\-_]+$/;
  return validPattern.test(name);
}

/**
 * Validate player name
 * - Min length: 1 character
 * - Max length: 20 characters
 * - Allowed: alphanumeric, spaces
 */
export function validatePlayerName(name: string): boolean {
  if (!name || name.length < 1 || name.length > 20) {
    return false;
  }

  const validPattern = /^[a-zA-Z0-9\s]+$/;
  return validPattern.test(name);
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
