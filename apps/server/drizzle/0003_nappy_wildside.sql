CREATE INDEX "game_sessions_room_id_idx" ON "game_sessions" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "import_jobs_status_idx" ON "import_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "players_room_id_idx" ON "players" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "rounds_session_id_idx" ON "rounds" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "songs_genre_idx" ON "songs" USING btree ("genre");--> statement-breakpoint
CREATE INDEX "songs_year_idx" ON "songs" USING btree ("year");--> statement-breakpoint
CREATE INDEX "songs_spotify_id_idx" ON "songs" USING btree ("spotify_id");--> statement-breakpoint
CREATE INDEX "songs_youtube_id_idx" ON "songs" USING btree ("youtube_id");