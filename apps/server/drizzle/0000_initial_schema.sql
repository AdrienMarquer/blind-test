-- Initial schema migration
-- Created: 2025-11-09

-- Rooms table
CREATE TABLE `rooms` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `code` text NOT NULL UNIQUE,
  `qr_code` text NOT NULL,
  `master_ip` text NOT NULL,
  `status` text DEFAULT 'lobby' NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  `max_players` integer DEFAULT 8 NOT NULL
);

-- Players table
CREATE TABLE `players` (
  `id` text PRIMARY KEY NOT NULL,
  `room_id` text NOT NULL,
  `name` text NOT NULL,
  `role` text DEFAULT 'player' NOT NULL,
  `connected` integer DEFAULT 1 NOT NULL,
  `joined_at` integer DEFAULT (unixepoch()) NOT NULL,
  `score` integer DEFAULT 0 NOT NULL,
  `round_score` integer DEFAULT 0 NOT NULL,
  `is_active` integer DEFAULT 0 NOT NULL,
  `is_locked_out` integer DEFAULT 0 NOT NULL,
  `stats` text DEFAULT '{"totalAnswers":0,"correctAnswers":0,"wrongAnswers":0,"buzzCount":0,"averageAnswerTime":0}' NOT NULL,
  FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);

-- Songs table
CREATE TABLE `songs` (
  `id` text PRIMARY KEY NOT NULL,
  `file_path` text NOT NULL UNIQUE,
  `file_name` text NOT NULL,
  `title` text NOT NULL,
  `artist` text NOT NULL,
  `album` text,
  `year` integer NOT NULL,
  `genre` text,
  `duration` integer NOT NULL,
  `clip_start` integer DEFAULT 30 NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `file_size` integer NOT NULL,
  `format` text NOT NULL
);

-- Game Sessions table (Phase 2+)
CREATE TABLE `game_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `room_id` text NOT NULL,
  `started_at` integer DEFAULT (unixepoch()) NOT NULL,
  `ended_at` integer,
  `current_round_index` integer DEFAULT 0 NOT NULL,
  `current_song_index` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'waiting' NOT NULL,
  FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);

-- Rounds table (Phase 2+)
CREATE TABLE `rounds` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `index` integer NOT NULL,
  `mode_type` text NOT NULL,
  `playlist_id` text,
  `params` text,
  `status` text DEFAULT 'pending' NOT NULL,
  `started_at` integer,
  `ended_at` integer,
  `current_song_index` integer DEFAULT 0 NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `game_sessions`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);

-- Playlists table (Phase 2+)
CREATE TABLE `playlists` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL
);

-- Playlist Songs junction table (Many-to-Many)
CREATE TABLE `playlist_songs` (
  `id` text PRIMARY KEY NOT NULL,
  `playlist_id` text NOT NULL,
  `song_id` text NOT NULL,
  `order` integer NOT NULL,
  FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX `players_room_id_idx` ON `players`(`room_id`);
CREATE INDEX `playlist_songs_playlist_id_idx` ON `playlist_songs`(`playlist_id`);
CREATE INDEX `playlist_songs_song_id_idx` ON `playlist_songs`(`song_id`);
