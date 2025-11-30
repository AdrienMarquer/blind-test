/**
 * Blind Test - Application Constants
 * Centralized magic numbers and configuration values
 */

// ============================================================================
// Room Configuration
// ============================================================================

export const ROOM_CONFIG = {
  CODE_LENGTH: 4,
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 50,
  DEFAULT_MAX_PLAYERS: 8,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 20,
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
// WebSocket Configuration
// ============================================================================

export const WEBSOCKET_CONFIG = {
  RECONNECT_TIMEOUT: 5000, // 5 seconds
  MAX_RECONNECT_ATTEMPTS: 5,
  PING_INTERVAL: 30000, // 30 seconds
} as const;

// ============================================================================
// Server Configuration
// ============================================================================

export const SERVER_CONFIG = {
  DEFAULT_PORT: 3007,
  CLIENT_PORT: 5173,
  UPLOAD_MAX_SIZE: 20 * 1024 * 1024, // 20MB in bytes
} as const;

// ============================================================================
// Audio Configuration
// ============================================================================

export const AUDIO_CONFIG = {
  FADE_DURATION: 500, // Fade in/out duration in milliseconds
  BUFFER_SIZE: 4096,
} as const;

// ============================================================================
// Validation Patterns
// ============================================================================

export const VALIDATION_PATTERNS = {
  ROOM_NAME: /^[a-zA-Z0-9\s\-_]+$/,
  PLAYER_NAME: new RegExp("^[\\p{L}0-9\\s'\\-]+$", 'u'),
  ROOM_CODE: /^[A-Z0-9]{4}$/,
} as const;

// ============================================================================
// File Upload
// ============================================================================

export const UPLOAD_CONFIG = {
  ALLOWED_AUDIO_FORMATS: ["mp3", "m4a", "wav", "flac"],
  ALLOWED_IMAGE_FORMATS: ["jpg", "jpeg", "png", "gif", "webp"],
  ALLOWED_VIDEO_FORMATS: ["mp4", "webm", "mov"],
  MAX_FILE_SIZE: 20 * 1024 * 1024, // 20MB
} as const;
