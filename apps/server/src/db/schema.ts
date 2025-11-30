/**
 * Drizzle ORM Schema for Blind Test
 * Based on DATABASE.md specification
 * SQLite version
 */

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// Rooms Table
// ============================================================================

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  qrCode: text('qr_code').notNull(),
  masterIp: text('master_ip').notNull(),
  masterToken: text('master_token').notNull(), // Secret token for master authorization
  status: text('status').notNull().default('lobby'), // 'lobby' | 'playing' | 'between_rounds' | 'finished'
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  maxPlayers: integer('max_players').notNull().default(8),
});

// ============================================================================
// Players Table
// ============================================================================

export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  role: text('role').notNull().default('player'), // 'master' | 'player'
  token: text('token').notNull(), // Session token for this player
  connected: integer('connected', { mode: 'boolean' }).notNull().default(true),
  joinedAt: text('joined_at').notNull().default(sql`(datetime('now'))`),

  // Game state
  score: integer('score').notNull().default(0),
  roundScore: integer('round_score').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  isLockedOut: integer('is_locked_out', { mode: 'boolean' }).notNull().default(false),

  // Statistics (stored as JSON)
  stats: text('stats', { mode: 'json' }).notNull().default({"totalAnswers":0,"correctAnswers":0,"wrongAnswers":0,"buzzCount":0,"averageAnswerTime":0}),
}, (table) => ({
  roomIdIdx: index('players_room_id_idx').on(table.roomId),
}));

// ============================================================================
// Songs Table
// ============================================================================

export const songs = sqliteTable('songs', {
  id: text('id').primaryKey(),
  filePath: text('file_path').notNull().unique(),
  fileName: text('file_name').notNull(),

  // Metadata (from ID3 tags or Spotify)
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  album: text('album'),
  year: integer('year').notNull(), // Mandatory - Release year
  genre: text('genre'),
  duration: integer('duration').notNull(), // Full track length in seconds

  // Enhanced metadata for answer generation
  language: text('language'), // ISO 639-1 code (e.g., 'en', 'fr', 'es')
  niche: integer('niche', { mode: 'boolean' }).notNull().default(false), // Is this a niche/obscure song?

  // Source tracking
  spotifyId: text('spotify_id'), // Spotify track ID
  youtubeId: text('youtube_id'), // YouTube video ID
  albumArt: text('album_art'), // Spotify album cover URL
  source: text('source').notNull().default('upload'), // 'upload' | 'spotify-youtube' | 'manual'

  // Playback configuration
  clipStart: integer('clip_start').notNull().default(0), // Start time in seconds
  clipDuration: integer('clip_duration').notNull().default(60), // Stored clip length in seconds
  // Note: Actual playback duration during game comes from ModeParams.songDuration

  // File info
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  fileSize: integer('file_size').notNull(), // Bytes
  format: text('format').notNull(), // 'mp3' | 'm4a' | 'wav' | 'flac'
}, (table) => ({
  genreIdx: index('songs_genre_idx').on(table.genre),
  yearIdx: index('songs_year_idx').on(table.year),
  spotifyIdIdx: index('songs_spotify_id_idx').on(table.spotifyId),
  youtubeIdIdx: index('songs_youtube_id_idx').on(table.youtubeId),
}));

// ============================================================================
// Game Sessions Table (Phase 2+)
// ============================================================================

export const gameSessions = sqliteTable('game_sessions', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  startedAt: text('started_at').notNull().default(sql`(datetime('now'))`),
  endedAt: text('ended_at'),

  // State
  currentRoundIndex: integer('current_round_index').notNull().default(0),
  currentSongIndex: integer('current_song_index').notNull().default(0),
  status: text('status').notNull().default('waiting'), // 'waiting' | 'playing' | 'paused' | 'finished'
}, (table) => ({
  roomIdIdx: index('game_sessions_room_id_idx').on(table.roomId),
}));

// ============================================================================
// Rounds Table (Phase 2+)
// ============================================================================

export const rounds = sqliteTable('rounds', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => gameSessions.id, { onDelete: 'cascade' }),
  index: integer('index').notNull(),
  modeType: text('mode_type').notNull(), // 'buzz_and_choice' | 'fast_buzz' | 'text_input' | 'timed_answer'
  mediaType: text('media_type').notNull(), // 'music' | 'picture' | 'video' | 'text_question'

  // Metadata-based song filtering (stored as JSON)
  songFilters: text('song_filters', { mode: 'json' }),

  // Configuration (stored as JSON)
  params: text('params', { mode: 'json' }),

  // State
  status: text('status').notNull().default('pending'), // 'pending' | 'active' | 'finished'
  startedAt: text('started_at'),
  endedAt: text('ended_at'),
  currentSongIndex: integer('current_song_index').notNull().default(0),
}, (table) => ({
  sessionIdIdx: index('rounds_session_id_idx').on(table.sessionId),
}));

// ============================================================================
// Import Jobs Table
// ============================================================================

export const importJobs = sqliteTable('import_jobs', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // 'spotify_download' | 'youtube_download' | 'youtube_playlist'
  status: text('status').notNull(), // 'pending' | 'downloading' | 'processing' | 'completed' | 'failed' | 'cancelled'
  progress: integer('progress').notNull().default(0), // 0-100

  // Job-specific metadata (stored as JSON)
  metadata: text('metadata', { mode: 'json' }).notNull().default({}),

  // Error information
  error: text('error'),

  // Batch job tracking
  currentItem: integer('current_item'), // Current item being processed (for playlists)
  totalItems: integer('total_items'), // Total items to process (for playlists)

  // Timing
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),

  // Retry tracking
  retryCount: integer('retry_count').notNull().default(0),
}, (table) => ({
  statusIdx: index('import_jobs_status_idx').on(table.status),
}));
