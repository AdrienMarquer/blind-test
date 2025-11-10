CREATE TABLE "game_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"current_round_index" integer DEFAULT 0 NOT NULL,
	"current_song_index" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'player' NOT NULL,
	"token" text NOT NULL,
	"connected" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"round_score" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"is_locked_out" boolean DEFAULT false NOT NULL,
	"stats" json DEFAULT '{"totalAnswers":0,"correctAnswers":0,"wrongAnswers":0,"buzzCount":0,"averageAnswerTime":0}'::json NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"qr_code" text NOT NULL,
	"master_ip" text NOT NULL,
	"master_token" text NOT NULL,
	"status" text DEFAULT 'lobby' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"max_players" integer DEFAULT 8 NOT NULL,
	CONSTRAINT "rooms_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"index" integer NOT NULL,
	"mode_type" text NOT NULL,
	"media_type" text NOT NULL,
	"song_filters" json,
	"params" json,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp,
	"current_song_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" text PRIMARY KEY NOT NULL,
	"file_path" text NOT NULL,
	"file_name" text NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"album" text,
	"year" integer NOT NULL,
	"genre" text,
	"duration" integer NOT NULL,
	"language" text,
	"subgenre" text,
	"spotify_id" text,
	"youtube_id" text,
	"source" text DEFAULT 'upload' NOT NULL,
	"clip_start" integer DEFAULT 30 NOT NULL,
	"clip_duration" integer DEFAULT 45 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"file_size" integer NOT NULL,
	"format" text NOT NULL,
	CONSTRAINT "songs_file_path_unique" UNIQUE("file_path")
);
--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;