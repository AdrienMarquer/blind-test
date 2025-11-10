/**
 * Drizzle ORM Schema for Blind Test
 * Based on DATABASE.md specification
 * PostgreSQL version
 */

import { pgTable, text, integer, timestamp, boolean, json } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// Rooms Table
// ============================================================================

export const rooms = pgTable('rooms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  qrCode: text('qr_code').notNull(),
  masterIp: text('master_ip').notNull(),
  masterToken: text('master_token').notNull(), // Secret token for master authorization
  status: text('status').notNull().default('lobby'), // 'lobby' | 'playing' | 'between_rounds' | 'finished'
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  maxPlayers: integer('max_players').notNull().default(8),
});

// ============================================================================
// Players Table
// ============================================================================

export const players = pgTable('players', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  role: text('role').notNull().default('player'), // 'master' | 'player'
  token: text('token').notNull(), // Session token for this player
  connected: boolean('connected').notNull().default(true),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),

  // Game state
  score: integer('score').notNull().default(0),
  roundScore: integer('round_score').notNull().default(0),
  isActive: boolean('is_active').notNull().default(false),
  isLockedOut: boolean('is_locked_out').notNull().default(false),

  // Statistics (stored as JSON)
  stats: json('stats').notNull().default({"totalAnswers":0,"correctAnswers":0,"wrongAnswers":0,"buzzCount":0,"averageAnswerTime":0}),
});

// ============================================================================
// Songs Table
// ============================================================================

export const songs = pgTable('songs', {
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
  subgenre: text('subgenre'), // More specific genre (e.g., 'french-rap', 'synthwave')

  // Source tracking
  spotifyId: text('spotify_id'), // Spotify track ID
  youtubeId: text('youtube_id'), // YouTube video ID
  source: text('source').notNull().default('upload'), // 'upload' | 'spotify-youtube' | 'manual'

  // Playback configuration
  clipStart: integer('clip_start').notNull().default(30), // Start time in seconds
  clipDuration: integer('clip_duration').notNull().default(45), // Stored clip length in seconds
  // Note: Actual playback duration during game comes from ModeParams.songDuration

  // File info
  createdAt: timestamp('created_at').notNull().defaultNow(),
  fileSize: integer('file_size').notNull(), // Bytes
  format: text('format').notNull(), // 'mp3' | 'm4a' | 'wav' | 'flac'
});

// ============================================================================
// Game Sessions Table (Phase 2+)
// ============================================================================

export const gameSessions = pgTable('game_sessions', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  endedAt: timestamp('ended_at'),

  // State
  currentRoundIndex: integer('current_round_index').notNull().default(0),
  currentSongIndex: integer('current_song_index').notNull().default(0),
  status: text('status').notNull().default('waiting'), // 'waiting' | 'playing' | 'paused' | 'finished'
});

// ============================================================================
// Rounds Table (Phase 2+)
// ============================================================================

export const rounds = pgTable('rounds', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => gameSessions.id, { onDelete: 'cascade' }),
  index: integer('index').notNull(),
  modeType: text('mode_type').notNull(), // 'buzz_and_choice' | 'fast_buzz' | 'text_input' | 'timed_answer'
  mediaType: text('media_type').notNull(), // 'music' | 'picture' | 'video' | 'text_question'

  // Metadata-based song filtering (stored as JSON)
  songFilters: json('song_filters'),

  // Configuration (stored as JSON)
  params: json('params'),

  // State
  status: text('status').notNull().default('pending'), // 'pending' | 'active' | 'finished'
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  currentSongIndex: integer('current_song_index').notNull().default(0),
});
