CREATE TABLE `game_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`ended_at` text,
	`current_round_index` integer DEFAULT 0 NOT NULL,
	`current_song_index` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `game_sessions_room_id_idx` ON `game_sessions` (`room_id`);--> statement-breakpoint
CREATE TABLE `import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`error` text,
	`current_item` integer,
	`total_items` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`started_at` text,
	`completed_at` text,
	`retry_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `import_jobs_status_idx` ON `import_jobs` (`status`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'player' NOT NULL,
	`token` text NOT NULL,
	`connected` integer DEFAULT true NOT NULL,
	`joined_at` text DEFAULT (datetime('now')) NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`round_score` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`is_locked_out` integer DEFAULT false NOT NULL,
	`stats` text DEFAULT '{"totalAnswers":0,"correctAnswers":0,"wrongAnswers":0,"buzzCount":0,"averageAnswerTime":0}' NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `players_room_id_idx` ON `players` (`room_id`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`qr_code` text NOT NULL,
	`master_ip` text NOT NULL,
	`master_token` text NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`max_players` integer DEFAULT 8 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_code_unique` ON `rooms` (`code`);--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`index` integer NOT NULL,
	`mode_type` text NOT NULL,
	`media_type` text NOT NULL,
	`song_filters` text,
	`params` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`started_at` text,
	`ended_at` text,
	`current_song_index` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `game_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rounds_session_id_idx` ON `rounds` (`session_id`);--> statement-breakpoint
CREATE TABLE `songs` (
	`id` text PRIMARY KEY NOT NULL,
	`file_path` text NOT NULL,
	`file_name` text NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`album` text,
	`year` integer NOT NULL,
	`genre` text,
	`duration` integer NOT NULL,
	`language` text,
	`subgenre` text,
	`niche` integer DEFAULT false NOT NULL,
	`spotify_id` text,
	`youtube_id` text,
	`source` text DEFAULT 'upload' NOT NULL,
	`clip_start` integer DEFAULT 0 NOT NULL,
	`clip_duration` integer DEFAULT 60 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`file_size` integer NOT NULL,
	`format` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `songs_file_path_unique` ON `songs` (`file_path`);--> statement-breakpoint
CREATE INDEX `songs_genre_idx` ON `songs` (`genre`);--> statement-breakpoint
CREATE INDEX `songs_year_idx` ON `songs` (`year`);--> statement-breakpoint
CREATE INDEX `songs_spotify_id_idx` ON `songs` (`spotify_id`);--> statement-breakpoint
CREATE INDEX `songs_youtube_id_idx` ON `songs` (`youtube_id`);