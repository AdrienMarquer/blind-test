CREATE TABLE `artist_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`artist_id` text NOT NULL,
	`related_artist_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artist_relations_artist_id_idx` ON `artist_relations` (`artist_id`);--> statement-breakpoint
CREATE INDEX `artist_relations_related_artist_id_idx` ON `artist_relations` (`related_artist_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `artist_relations_unique` ON `artist_relations` (`artist_id`,`related_artist_id`);--> statement-breakpoint
CREATE TABLE `artists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`spotify_id` text,
	`genres` text,
	`popularity` integer,
	`image_url` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artists_spotify_id_unique` ON `artists` (`spotify_id`);--> statement-breakpoint
CREATE INDEX `artists_spotify_id_idx` ON `artists` (`spotify_id`);--> statement-breakpoint
CREATE INDEX `artists_name_idx` ON `artists` (`name`);--> statement-breakpoint
ALTER TABLE `songs` ADD `artist_id` text;--> statement-breakpoint
CREATE INDEX `songs_artist_id_idx` ON `songs` (`artist_id`);