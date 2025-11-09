/**
 * Drizzle ORM Schema for Blind Test
 * Based on DATABASE.md specification
 */

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
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
  status: text('status').notNull().default('lobby'), // 'lobby' | 'playing' | 'between_rounds' | 'finished'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
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
  connected: integer('connected', { mode: 'boolean' }).notNull().default(true),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),

  // Game state
  score: integer('score').notNull().default(0),
  roundScore: integer('round_score').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  isLockedOut: integer('is_locked_out', { mode: 'boolean' }).notNull().default(false),

  // Statistics (stored as JSON)
  stats: text('stats', { mode: 'json' }).notNull().default('{"totalAnswers":0,"correctAnswers":0,"wrongAnswers":0,"buzzCount":0,"averageAnswerTime":0}'),
});

// ============================================================================
// Songs Table
// ============================================================================

export const songs = sqliteTable('songs', {
  id: text('id').primaryKey(),
  filePath: text('file_path').notNull().unique(),
  fileName: text('file_name').notNull(),

  // Metadata (from ID3 tags)
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  album: text('album'),
  year: integer('year').notNull(), // Mandatory - Release year
  genre: text('genre'),
  duration: integer('duration').notNull(), // Full track length in seconds

  // Playback configuration
  clipStart: integer('clip_start').notNull().default(30), // Start time in seconds
  // Note: Clip duration comes from ModeParams.songDuration, not stored here

  // File info
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  fileSize: integer('file_size').notNull(), // Bytes
  format: text('format').notNull(), // 'mp3' | 'm4a' | 'wav' | 'flac'
});

// ============================================================================
// Game Sessions Table (Phase 2+)
// ============================================================================

export const gameSessions = sqliteTable('game_sessions', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  endedAt: integer('ended_at', { mode: 'timestamp' }),

  // State
  currentRoundIndex: integer('current_round_index').notNull().default(0),
  currentSongIndex: integer('current_song_index').notNull().default(0),
  status: text('status').notNull().default('waiting'), // 'waiting' | 'playing' | 'paused' | 'finished'
});

// ============================================================================
// Rounds Table (Phase 2+)
// ============================================================================

export const rounds = sqliteTable('rounds', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => gameSessions.id, { onDelete: 'cascade' }),
  index: integer('index').notNull(),
  modeType: text('mode_type').notNull(), // 'buzz_and_choice' | 'fast_buzz' | 'text_input' | 'timed_answer'
  mediaType: text('media_type').notNull(), // 'music' | 'picture' | 'video' | 'text_question'
  playlistId: text('playlist_id'),

  // Configuration (stored as JSON)
  params: text('params', { mode: 'json' }),

  // State
  status: text('status').notNull().default('pending'), // 'pending' | 'active' | 'finished'
  startedAt: integer('started_at', { mode: 'timestamp' }),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  currentSongIndex: integer('current_song_index').notNull().default(0),
});

// ============================================================================
// Playlists Table (Phase 2+)
// ============================================================================

export const playlists = sqliteTable('playlists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ============================================================================
// Playlist Songs Table (Many-to-Many)
// ============================================================================

export const playlistSongs = sqliteTable('playlist_songs', {
  id: text('id').primaryKey(),
  playlistId: text('playlist_id').notNull().references(() => playlists.id, { onDelete: 'cascade' }),
  songId: text('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
  order: integer('order').notNull(), // Position in playlist
});

// Type exports for use in repositories
export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Song = typeof songs.$inferSelect;
export type NewSong = typeof songs.$inferInsert;
export type GameSession = typeof gameSessions.$inferSelect;
export type NewGameSession = typeof gameSessions.$inferInsert;
export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;
export type Playlist = typeof playlists.$inferSelect;
export type NewPlaylist = typeof playlists.$inferInsert;
export type PlaylistSong = typeof playlistSongs.$inferSelect;
export type NewPlaylistSong = typeof playlistSongs.$inferInsert;
