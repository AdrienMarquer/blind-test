/**
 * Blind Test - Application Constants
 * Centralized magic numbers and configuration values
 */

// ============================================================================
// Room Configuration
// ============================================================================

export const ROOM_CONFIG = {
  CODE_LENGTH: 4,
  DEFAULT_MAX_PLAYERS: 32,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 32,
} as const;

// ============================================================================
// Player Configuration
// ============================================================================

export const PLAYER_CONFIG = {
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 20,
} as const;

// ============================================================================
// Song Configuration
// ============================================================================

export const SONG_CONFIG = {
  DEFAULT_CLIP_START: 0, // Default start time in seconds
  DEFAULT_CLIP_DURATION: 60, // Default clip duration in seconds
  MAX_CLIP_DURATION: 180, // Maximum clip duration in seconds (3 minutes)
} as const;

// ============================================================================
// Validation Patterns
// ============================================================================

export const VALIDATION_PATTERNS = {
  // Allow any printable characters except control chars and angle brackets (XSS prevention)
  PLAYER_NAME: /^[^\x00-\x1F<>]+$/u,
  ROOM_CODE: /^[A-Z0-9]{4}$/,
} as const;

