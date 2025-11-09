/**
 * Blind Test - Main Server
 * Elysia REST API + WebSockets
 */

import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { roomRepository, playerRepository, songRepository, gameSessionRepository, playlistRepository } from './repositories';
import { handleWebSocket, handleMessage, handleClose, broadcastToRoom } from './websocket/handler';
import { validateRoomName, validatePlayerName } from '@blind-test/shared';
import type { Room, Player } from '@blind-test/shared';
import { generateId } from '@blind-test/shared';
import { db, schema } from './db';
import { runMigrations } from './db';
import { extractMetadata, isSupportedAudioFormat, getFileFormat } from './utils/mp3-metadata';
import { writeFile, unlink, stat } from 'fs/promises';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { modeRegistry } from './modes';
import { mediaRegistry } from './media';

// Run database migrations (db directory created in db/index.ts)
try {
  runMigrations();
  console.log('✅ Database ready');
} catch (error) {
  console.error('❌ Database initialization failed:', error);
  process.exit(1);
}

// Initialize Elysia app
const app = new Elysia()
  .use(cors())
  .get('/', () => {
    return {
      message: 'Blind Test API Server',
      status: 'running',
      version: '1.0.0',
      websocket: 'enabled',
    };
  })

  // ========================================================================
  // Room Endpoints
  // ========================================================================

  // Get all rooms
  .get('/api/rooms', async ({ query }) => {
    console.log('[GET /api/rooms] Fetching rooms');

    let rooms: Room[];

    if (query.status) {
      rooms = await roomRepository.findByStatus(query.status as Room['status']);
    } else {
      rooms = await roomRepository.findAll();
    }

    return {
      rooms,
      total: rooms.length,
    };
  }, {
    query: t.Optional(t.Object({
      status: t.Optional(t.String()),
    })),
  })

  // Create new room
  .post('/api/rooms', async ({ body, error }) => {
    // Validate room name
    if (!validateRoomName(body.name)) {
      return error(400, {
        error: 'Invalid room name. Must be 1-50 characters, alphanumeric, spaces, hyphens, underscores only.',
      });
    }

    try {
      const room = await roomRepository.create({
        name: body.name,
        maxPlayers: body.maxPlayers || 8,
        masterIp: 'localhost', // TODO: Extract from request in production
      });

      console.log(`[POST /api/rooms] Created room: ${room.name} (code: ${room.code})`);

      return room;
    } catch (err) {
      console.error('[POST /api/rooms] Error:', err);
      return error(500, { error: 'Failed to create room' });
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 1, maxLength: 50 }),
      maxPlayers: t.Optional(t.Number({ minimum: 2, maximum: 20 })),
    }),
  })

  // Get room by ID
  .get('/api/rooms/:roomId', async ({ params: { roomId }, error }) => {
    const room = await roomRepository.findById(roomId);

    if (!room) {
      console.log(`[GET /api/rooms/${roomId}] Room not found`);
      return error(404, { error: 'Room not found' });
    }

    // Populate players
    const players = await playerRepository.findByRoom(roomId);
    room.players = players;

    console.log(`[GET /api/rooms/${roomId}] Fetching room: ${room.name}`);
    return room;
  })

  // Update room
  .patch('/api/rooms/:roomId', async ({ params: { roomId }, body, error }) => {
    const room = await roomRepository.findById(roomId);

    if (!room) {
      return error(404, { error: 'Room not found' });
    }

    if (room.status !== 'lobby') {
      return error(400, { error: 'Cannot update room while game is in progress' });
    }

    if (body.name && !validateRoomName(body.name)) {
      return error(400, { error: 'Invalid room name' });
    }

    try {
      const updated = await roomRepository.update(roomId, body);
      console.log(`[PATCH /api/rooms/${roomId}] Updated room: ${updated.name}`);
      return updated;
    } catch (err) {
      console.error(`[PATCH /api/rooms/${roomId}] Error:`, err);
      return error(500, { error: 'Failed to update room' });
    }
  }, {
    body: t.Object({
      name: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
      maxPlayers: t.Optional(t.Number({ minimum: 2, maximum: 20 })),
    }),
  })

  // Delete room
  .delete('/api/rooms/:roomId', async ({ params: { roomId }, error }) => {
    const room = await roomRepository.findById(roomId);

    if (!room) {
      return error(404, { error: 'Room not found' });
    }

    try {
      // Delete all players first
      await playerRepository.deleteByRoom(roomId);
      // Delete room
      await roomRepository.delete(roomId);

      console.log(`[DELETE /api/rooms/${roomId}] Deleted room: ${room.name}`);
      return new Response(null, { status: 204 });
    } catch (err) {
      console.error(`[DELETE /api/rooms/${roomId}] Error:`, err);
      return error(500, { error: 'Failed to delete room' });
    }
  })

  // ========================================================================
  // Player Endpoints
  // ========================================================================

  // Add player to room
  .post('/api/rooms/:roomId/players', async ({ params: { roomId }, body, error }) => {
    const room = await roomRepository.findById(roomId);

    if (!room) {
      return error(404, { error: 'Room not found' });
    }

    if (room.status !== 'lobby') {
      return error(400, { error: 'Cannot join - game already in progress' });
    }

    if (!validatePlayerName(body.name)) {
      return error(400, { error: 'Invalid player name. Must be 1-20 characters, alphanumeric and spaces only.' });
    }

    // Check if room is full
    const playerCount = await playerRepository.countConnected(roomId);
    if (playerCount >= room.maxPlayers) {
      return error(400, { error: 'Room is full' });
    }

    // Check for duplicate name
    const existing = await playerRepository.findByRoomAndName(roomId, body.name);
    if (existing) {
      return error(400, { error: 'Name already taken in this room' });
    }

    try {
      const player = await playerRepository.create({
        roomId,
        name: body.name,
        role: 'player',
      });

      console.log(`[POST /api/rooms/${roomId}/players] Added player: ${player.name}`);

      // Broadcast player join event to all connected WebSocket clients
      broadcastToRoom(roomId, {
        type: 'player:joined',
        data: { player, room }
      });

      return player;
    } catch (err) {
      console.error(`[POST /api/rooms/${roomId}/players] Error:`, err);
      return error(500, { error: 'Failed to add player' });
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 1, maxLength: 20 }),
    }),
  })

  // Get player info
  .get('/api/rooms/:roomId/players/:playerId', async ({ params: { roomId, playerId }, error }) => {
    const player = await playerRepository.findById(playerId);

    if (!player || player.roomId !== roomId) {
      return error(404, { error: 'Player not found' });
    }

    return player;
  })

  // Remove player from room
  .delete('/api/rooms/:roomId/players/:playerId', async ({ params: { roomId, playerId }, error }) => {
    const player = await playerRepository.findById(playerId);

    if (!player || player.roomId !== roomId) {
      return error(404, { error: 'Player not found' });
    }

    try {
      await playerRepository.delete(playerId);
      console.log(`[DELETE /api/rooms/${roomId}/players/${playerId}] Removed player: ${player.name}`);

      // Broadcast player left event to all connected WebSocket clients
      const remainingPlayers = await playerRepository.countConnected(roomId);
      broadcastToRoom(roomId, {
        type: 'player:left',
        data: {
          playerId: player.id,
          playerName: player.name,
          remainingPlayers
        }
      });

      return new Response(null, { status: 204 });
    } catch (err) {
      console.error(`[DELETE /api/rooms/${roomId}/players/${playerId}] Error:`, err);
      return error(500, { error: 'Failed to remove player' });
    }
  })

  // ========================================================================
  // Game Control Endpoints (Stubs for future phases)
  // ========================================================================

  // Start game
  .post('/api/game/:roomId/start', async ({ params: { roomId }, body, error }) => {
    const room = await roomRepository.findById(roomId);

    if (!room) {
      return error(404, { error: 'Room not found' });
    }

    if (room.status !== 'lobby') {
      return error(409, { error: 'Game already started' });
    }

    const playerCount = await playerRepository.countConnected(roomId);
    if (playerCount < 2) {
      return error(400, { error: 'Need at least 2 players to start' });
    }

    try {
      // Create game session
      const session = await gameSessionRepository.create({
        roomId,
      });

      // Get songs for the game
      let songIds: string[];
      if (body.playlistId) {
        const playlist = await playlistRepository.findById(body.playlistId);
        if (!playlist) {
          return error(404, { error: 'Playlist not found' });
        }
        songIds = playlist.songIds;
      } else if (body.songIds && body.songIds.length > 0) {
        songIds = body.songIds;
      } else {
        // Get random songs from library
        const randomSongs = await songRepository.getRandom(body.songCount || 10);
        songIds = randomSongs.map(s => s.id);
      }

      if (songIds.length === 0) {
        await gameSessionRepository.delete(session.id);
        return error(400, { error: 'No songs available for the game' });
      }

      // Create a simple playlist for this session if needed
      let playlistId = body.playlistId;
      if (!playlistId) {
        const tempPlaylist = await playlistRepository.create({
          name: `Game ${session.id}`,
          description: 'Auto-generated playlist for game session',
          songIds,
        });
        playlistId = tempPlaylist.id;
      }

      // Create single round for now (Phase 3 will support multiple rounds)
      const roundId = generateId();
      await db.insert(schema.rounds).values({
        id: roundId,
        sessionId: session.id,
        index: 0,
        modeType: body.modeType || 'buzz_and_choice',
        mediaType: body.mediaType || 'music', // Default to music for MVP
        playlistId,
        params: body.params || null,
        status: 'pending',
        startedAt: null,
        endedAt: null,
        currentSongIndex: 0,
      });

      // Update room status
      const updated = await roomRepository.update(roomId, { status: 'playing' });
      console.log(`[POST /api/game/${roomId}/start] Game started for room: ${room.name} with ${songIds.length} songs`);

      // Broadcast game start to all connected WebSocket clients
      broadcastToRoom(roomId, {
        type: 'game:started',
        data: {
          room: updated,
          session: await gameSessionRepository.findById(session.id),
        }
      });

      return {
        sessionId: session.id,
        roomId,
        status: updated.status,
        songCount: songIds.length,
        modeType: body.modeType || 'buzz_and_choice',
      };
    } catch (err) {
      console.error(`[POST /api/game/${roomId}/start] Error:`, err);
      return error(500, { error: 'Failed to start game' });
    }
  }, {
    body: t.Object({
      playlistId: t.Optional(t.String()),
      songIds: t.Optional(t.Array(t.String())),
      songCount: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      modeType: t.Optional(t.String()),
      params: t.Optional(t.Any()),
    }),
  })

  // ========================================================================
  // Music Library Endpoints
  // ========================================================================

  // Get all songs
  .get('/api/songs', async () => {
    console.log('[GET /api/songs] Fetching all songs');
    const songs = await songRepository.findAll();
    return {
      songs,
      total: songs.length,
    };
  })

  // Get song by ID
  .get('/api/songs/:songId', async ({ params: { songId }, error }) => {
    const song = await songRepository.findById(songId);

    if (!song) {
      return error(404, { error: 'Song not found' });
    }

    return song;
  })

  // Search songs
  .get('/api/songs/search/:query', async ({ params: { query } }) => {
    console.log(`[GET /api/songs/search/${query}] Searching songs`);
    const songs = await songRepository.searchByTitle(query);
    return {
      songs,
      total: songs.length,
    };
  })

  // Upload new song
  .post('/api/songs/upload', async ({ body, error }) => {
    console.log('[POST /api/songs/upload] Uploading song');

    // Validate file
    if (!body.file) {
      return error(400, { error: 'No file provided' });
    }

    const file = body.file as File;

    // Check file type
    if (!isSupportedAudioFormat(file.name)) {
      return error(400, {
        error: 'Unsupported file format. Supported: mp3, m4a, wav, flac',
      });
    }

    try {
      // Ensure uploads directory exists
      const uploadsDir = path.join(process.cwd(), 'uploads');
      if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true });
      }

      // Generate unique filename
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-z0-9.-]/gi, '_');
      const filename = `${timestamp}_${sanitizedName}`;
      const filePath = path.join(uploadsDir, filename);

      // Write file to disk
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await writeFile(filePath, buffer);

      // Get file size
      const stats = await stat(filePath);
      const fileSize = stats.size;

      // Extract metadata
      let metadata;
      try {
        metadata = await extractMetadata(filePath);
      } catch (metadataError) {
        // Clean up file if metadata extraction fails
        await unlink(filePath);
        throw metadataError;
      }

      // Check if song already exists (by file path or title+artist)
      const existingSong = await songRepository.findByFilePath(filePath);
      if (existingSong) {
        await unlink(filePath);
        return error(409, { error: 'Song already exists in library' });
      }

      // Create song record
      const song = await songRepository.create({
        filePath,
        fileName: filename,
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        year: metadata.year,
        genre: metadata.genre,
        duration: metadata.duration,
        clipStart: 30, // Default clip start
        fileSize,
        format: getFileFormat(file.name),
      });

      console.log(`[POST /api/songs/upload] Uploaded song: ${song.title} by ${song.artist}`);

      return song;
    } catch (err) {
      console.error('[POST /api/songs/upload] Error:', err);
      if (err instanceof Error) {
        return error(500, { error: err.message });
      }
      return error(500, { error: 'Failed to upload song' });
    }
  }, {
    body: t.Object({
      file: t.File({
        maxSize: 50 * 1024 * 1024, // 50MB max
      }),
    }),
  })

  // Update song metadata
  .patch('/api/songs/:songId', async ({ params: { songId }, body, error }) => {
    const song = await songRepository.findById(songId);

    if (!song) {
      return error(404, { error: 'Song not found' });
    }

    try {
      const updated = await songRepository.update(songId, body);
      console.log(`[PATCH /api/songs/${songId}] Updated song: ${updated.title}`);
      return updated;
    } catch (err) {
      console.error(`[PATCH /api/songs/${songId}] Error:`, err);
      return error(500, { error: 'Failed to update song' });
    }
  }, {
    body: t.Object({
      title: t.Optional(t.String()),
      artist: t.Optional(t.String()),
      album: t.Optional(t.String()),
      year: t.Optional(t.Number()),
      genre: t.Optional(t.String()),
      clipStart: t.Optional(t.Number({ minimum: 0 })),
    }),
  })

  // Delete song
  .delete('/api/songs/:songId', async ({ params: { songId }, error }) => {
    const song = await songRepository.findById(songId);

    if (!song) {
      return error(404, { error: 'Song not found' });
    }

    try {
      // Delete file from disk
      try {
        await unlink(song.filePath);
      } catch (fileError) {
        console.warn(`Could not delete file: ${song.filePath}`, fileError);
      }

      // Delete from database
      await songRepository.delete(songId);
      console.log(`[DELETE /api/songs/${songId}] Deleted song: ${song.title}`);

      return new Response(null, { status: 204 });
    } catch (err) {
      console.error(`[DELETE /api/songs/${songId}] Error:`, err);
      return error(500, { error: 'Failed to delete song' });
    }
  })

  // ========================================================================
  // Playlist Endpoints
  // ========================================================================

  // Get all playlists
  .get('/api/playlists', async () => {
    console.log('[GET /api/playlists] Fetching all playlists');
    const playlists = await playlistRepository.findAll();
    return {
      playlists,
      total: playlists.length,
    };
  })

  // Get playlist by ID
  .get('/api/playlists/:playlistId', async ({ params: { playlistId }, error }) => {
    const playlist = await playlistRepository.findById(playlistId);

    if (!playlist) {
      return error(404, { error: 'Playlist not found' });
    }

    return playlist;
  })

  // Create playlist
  .post('/api/playlists', async ({ body, error }) => {
    try {
      const playlist = await playlistRepository.create({
        name: body.name,
        description: body.description,
        songIds: body.songIds || [],
      });

      console.log(`[POST /api/playlists] Created playlist: ${playlist.name} with ${playlist.songCount} songs`);
      return playlist;
    } catch (err) {
      console.error('[POST /api/playlists] Error:', err);
      return error(500, { error: 'Failed to create playlist' });
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 1, maxLength: 100 }),
      description: t.Optional(t.String()),
      songIds: t.Optional(t.Array(t.String())),
    }),
  })

  // Update playlist
  .patch('/api/playlists/:playlistId', async ({ params: { playlistId }, body, error }) => {
    const playlist = await playlistRepository.findById(playlistId);

    if (!playlist) {
      return error(404, { error: 'Playlist not found' });
    }

    try {
      const updated = await playlistRepository.update(playlistId, body);
      console.log(`[PATCH /api/playlists/${playlistId}] Updated playlist: ${updated.name}`);
      return updated;
    } catch (err) {
      console.error(`[PATCH /api/playlists/${playlistId}] Error:`, err);
      return error(500, { error: 'Failed to update playlist' });
    }
  }, {
    body: t.Object({
      name: t.Optional(t.String()),
      description: t.Optional(t.String()),
      songIds: t.Optional(t.Array(t.String())),
    }),
  })

  // Delete playlist
  .delete('/api/playlists/:playlistId', async ({ params: { playlistId }, error }) => {
    const playlist = await playlistRepository.findById(playlistId);

    if (!playlist) {
      return error(404, { error: 'Playlist not found' });
    }

    try {
      await playlistRepository.delete(playlistId);
      console.log(`[DELETE /api/playlists/${playlistId}] Deleted playlist: ${playlist.name}`);
      return new Response(null, { status: 204 });
    } catch (err) {
      console.error(`[DELETE /api/playlists/${playlistId}] Error:`, err);
      return error(500, { error: 'Failed to delete playlist' });
    }
  })

  // ========================================================================
  // Mode System Endpoints
  // ========================================================================

  // Get all available game modes
  .get('/api/modes', () => {
    console.log('[GET /api/modes] Fetching available modes');

    const modes = modeRegistry.getMetadata();

    return {
      modes,
      count: modes.length,
    };
  })

  // Get specific mode details
  .get('/api/modes/:modeType', ({ params: { modeType }, error }) => {
    console.log(`[GET /api/modes/${modeType}] Fetching mode details`);

    try {
      const handler = modeRegistry.get(modeType as any);

      return {
        type: handler.type,
        name: handler.name,
        description: handler.description,
        defaultParams: handler.defaultParams,
      };
    } catch (err) {
      console.error(`[GET /api/modes/${modeType}] Error:`, err);
      return error(404, { error: `Mode not found: ${modeType}` });
    }
  })

  // ========================================================================
  // Media System Endpoints
  // ========================================================================

  // Get all available media types
  .get('/api/media', () => {
    console.log('[GET /api/media] Fetching available media types');

    const mediaTypes = mediaRegistry.getMetadata();

    return {
      mediaTypes,
      count: mediaTypes.length,
    };
  })

  // Get specific media type details
  .get('/api/media/:mediaType', ({ params: { mediaType }, error }) => {
    console.log(`[GET /api/media/${mediaType}] Fetching media type details`);

    try {
      const handler = mediaRegistry.get(mediaType as any);

      return {
        type: handler.type,
        name: handler.name,
        description: handler.description,
      };
    } catch (err) {
      console.error(`[GET /api/media/${mediaType}] Error:`, err);
      return error(404, { error: `Media type not found: ${mediaType}` });
    }
  })

  // ========================================================================
  // WebSocket Endpoints
  // ========================================================================

  // WebSocket endpoint for room connections
  .ws('/ws/rooms/:roomId', {
    params: t.Object({
      roomId: t.String()
    }),
    open(ws) {
      // Extract roomId from route params
      const roomId = ws.data?.params?.roomId;

      if (!roomId) {
        console.error('No roomId found in WebSocket connection');
        ws.close();
        return;
      }

      // Store roomId in ws.data for access in message handlers
      ws.data.roomId = roomId;
      handleWebSocket(ws);
    },
    message(ws, message) {
      handleMessage(ws, typeof message === 'string' ? message : JSON.stringify(message));
    },
    close(ws) {
      handleClose(ws);
    }
  })

  .listen(3007);

console.log(
  `🎵 Blind Test Server is running at http://${app.server?.hostname}:${app.server?.port}`
);
console.log(`📡 WebSocket server ready on ws://${app.server?.hostname}:${app.server?.port}`);

// Export app type for Eden Treaty
export type App = typeof app;
