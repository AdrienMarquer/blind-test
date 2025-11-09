-- Remove playlist system (replaced by metadata filters)
DROP TABLE IF EXISTS `playlist_songs`;
DROP TABLE IF EXISTS `playlists`;

-- Remove playlistId from rounds table (no longer needed)
CREATE TABLE rounds_new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  "index" INTEGER NOT NULL,
  mode_type TEXT NOT NULL,
  media_type TEXT NOT NULL,
  song_filters TEXT,
  params TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at INTEGER,
  ended_at INTEGER,
  current_song_index INTEGER NOT NULL DEFAULT 0
);

INSERT INTO rounds_new SELECT
  id, session_id, "index", mode_type, media_type,
  song_filters, params, status, started_at, ended_at, current_song_index
FROM rounds;

DROP TABLE rounds;
ALTER TABLE rounds_new RENAME TO rounds;
