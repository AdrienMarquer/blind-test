/**
 * Song/Music Library Routes
 * Handles song CRUD operations, upload, search, and streaming
 */

import { Elysia, t } from 'elysia';
import { songRepository } from '../repositories';
import { extractMetadata, isSupportedAudioFormat, getFileFormat } from '../utils/mp3-metadata';
import { writeFile, unlink, stat } from 'fs/promises';
import { mkdir } from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { spotifyService } from '../services/SpotifyService';
import { youtubeDownloadService } from '../services/YouTubeDownloadService';
import { detectSongLanguage } from '../utils/language-detector';
import { trimAndReplace, getAudioInfo } from '../utils/audio-processor';
import { SONG_CONFIG } from '@blind-test/shared';

const apiLogger = logger.child({ module: 'API:Songs' });

/**
 * Get content type header for audio format
 */
function getContentType(format: string): string {
  switch (format.toLowerCase()) {
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
      return 'audio/mp4';
    case 'wav':
      return 'audio/wav';
    case 'flac':
      return 'audio/flac';
    default:
      return 'audio/mpeg';
  }
}

export const songRoutes = new Elysia({ prefix: '/api/songs' })
  // Get all songs
  .get('/', async () => {
    apiLogger.debug('Fetching all songs');
    const songs = await songRepository.findAll();
    return {
      songs,
      total: songs.length,
    };
  })

  // Search songs (must come before /:songId to avoid conflict)
  .get('/search/:query', async ({ params: { query } }) => {
    apiLogger.debug('Searching songs', { query });
    const songs = await songRepository.searchByTitle(query);
    return {
      songs,
      total: songs.length,
    };
  })

  // Get song by ID
  .get('/:songId', async ({ params: { songId }, error }) => {
    const song = await songRepository.findById(songId);

    if (!song) {
      return error(404, { error: 'Song not found' });
    }

    return song;
  })

  // Get audio info (duration, format, etc.) for preview
  .get('/:songId/info', async ({ params: { songId }, error }) => {
    const song = await songRepository.findById(songId);

    if (!song) {
      return error(404, { error: 'Song not found' });
    }

    const filePath = path.join(process.cwd(), song.filePath);
    if (!existsSync(filePath)) {
      return error(404, { error: 'Audio file not found' });
    }

    try {
      const audioInfo = await getAudioInfo(filePath);
      return {
        ...audioInfo,
        songId: song.id,
        title: song.title,
        artist: song.artist,
      };
    } catch (err) {
      apiLogger.error('Failed to get audio info', err, { songId });
      return error(500, { error: 'Failed to analyze audio file' });
    }
  })

  // Stream song audio
  .get('/:songId/stream', async ({ params: { songId }, error, set, request }) => {
    apiLogger.debug('Streaming audio', { songId });

    const song = await songRepository.findById(songId);
    if (!song) {
      return error(404, { error: 'Song not found' });
    }

    // Security: Validate file path to prevent directory traversal
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    const requestedPath = path.resolve(process.cwd(), song.filePath);

    // Ensure the resolved path is within the uploads directory
    if (!requestedPath.startsWith(uploadsDir)) {
      apiLogger.error('Path traversal attempt detected', { songId, filePath: song.filePath, requestedPath, uploadsDir });
      return error(403, { error: 'Access denied' });
    }

    const filePath = requestedPath;
    if (!existsSync(filePath)) {
      apiLogger.warn('Audio file not found on disk', { songId, filePath });
      return error(404, { error: 'Audio file not found' });
    }

    try {
      const fileStats = await stat(filePath);
      const fileSize = fileStats.size;

      // Get range header for seeking support
      const range = request.headers.get('range');

      if (range) {
        // Parse range header (e.g., "bytes=0-1023")
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = (end - start) + 1;

        set.status = 206; // Partial Content
        set.headers = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': getContentType(song.format),
        };

        // Create read stream for the range
        const stream = createReadStream(filePath, { start, end });
        return new Response(stream as any);
      } else {
        // No range, stream the whole file
        set.headers = {
          'Content-Length': fileSize.toString(),
          'Content-Type': getContentType(song.format),
          'Accept-Ranges': 'bytes',
        };

        const stream = createReadStream(filePath);
        return new Response(stream as any);
      }
    } catch (err) {
      apiLogger.error('Failed to stream audio file', err, { songId, filePath });
      return error(500, { error: 'Failed to stream audio' });
    }
  })

  // Upload new song
  .post('/upload', async ({ body, set }) => {
    apiLogger.info('Uploading song');

    // Validate file
    if (!body.file) {
      set.status = 400;
      return { error: 'No file provided' };
    }

    const file = body.file as File;

    // Check file type
    if (!isSupportedAudioFormat(file.name)) {
      set.status = 400;
      return { error: 'Unsupported file format. Supported: mp3, m4a, wav, flac' };
    }

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

    try {
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
        const errorMsg = metadataError instanceof Error ? metadataError.message : 'Failed to extract metadata';
        set.status = 400;
        return { error: errorMsg };
      }

      // Check if song already exists (by title+artist)
      const existingSong = await songRepository.findByTitleAndArtist(metadata.title, metadata.artist);
      if (existingSong) {
        await unlink(filePath);
        set.status = 409;
        return { error: `Song already exists in library: "${metadata.title}" by ${metadata.artist}` };
      }

      // Detect language
      const language = detectSongLanguage(metadata.title, metadata.artist);

      // Handle audio trimming if clip parameters provided
      let finalFileSize = fileSize;
      const clipStart = body.clipStart ?? SONG_CONFIG.DEFAULT_CLIP_START;
      const clipDuration = body.clipDuration ?? SONG_CONFIG.DEFAULT_CLIP_DURATION;

      // Trim audio to specified clip if clipStart or clipDuration is provided
      if (body.clipStart !== undefined || body.clipDuration !== undefined) {
        try {
          apiLogger.info('Trimming uploaded audio', { clipStart, clipDuration });

          const trimResult = await trimAndReplace({
            inputPath: filePath,
            startTime: clipStart,
            duration: clipDuration,
            format: getFileFormat(file.name) as 'mp3' | 'm4a' | 'wav' | 'flac',
            bitrate: '192k',
          });

          finalFileSize = trimResult.fileSize;
          apiLogger.info('Audio trimmed successfully', {
            originalSize: fileSize,
            trimmedSize: finalFileSize
          });
        } catch (trimError) {
          apiLogger.warn('Audio trimming failed, keeping original file', trimError);
          // Continue with original file if trimming fails
        }
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
        clipStart,
        clipDuration,
        fileSize: finalFileSize,
        format: getFileFormat(file.name),
        language,
        source: 'upload',
      });

      apiLogger.info('Uploaded song', { songId: song.id, title: song.title, artist: song.artist });

      return song;
    } catch (err) {
      // Clean up file if it was created
      try {
        await unlink(filePath);
      } catch (unlinkError) {
        // Ignore if file doesn't exist
      }

      apiLogger.error('Song upload failed', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to upload song';
      set.status = 500;
      return { error: errorMsg };
    }
  }, {
    body: t.Object({
      file: t.File({
        maxSize: 50 * 1024 * 1024, // 50MB max
      }),
      clipStart: t.Optional(t.Number({ minimum: 0 })),
      clipDuration: t.Optional(t.Number({ minimum: 1, maximum: 180 })), // Max 3 minutes
    }),
  })

  // Update song metadata
  .patch('/:songId', async ({ params: { songId }, body, error }) => {
    const song = await songRepository.findById(songId);

    if (!song) {
      return error(404, { error: 'Song not found' });
    }

    try {
      const updated = await songRepository.update(songId, body);
      apiLogger.info('Updated song', { songId, title: updated.title });
      return updated;
    } catch (err) {
      apiLogger.error('Failed to update song', err, { songId });
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
  .delete('/:songId', async ({ params: { songId }, error }) => {
    const song = await songRepository.findById(songId);

    if (!song) {
      return error(404, { error: 'Song not found' });
    }

    try {
      // Delete file from disk
      try {
        await unlink(song.filePath);
      } catch (fileError) {
        apiLogger.warn('Could not delete song file', { filePath: song.filePath, error: fileError });
      }

      // Delete from database
      await songRepository.delete(songId);
      apiLogger.info('Deleted song', { songId, title: song.title });

      return new Response(null, { status: 204 });
    } catch (err) {
      apiLogger.error('Failed to delete song', err, { songId });
      return error(500, { error: 'Failed to delete song' });
    }
  })

  // ========================================================================
  // Spotify Integration
  // ========================================================================

  // Search Spotify catalog
  .get('/search-spotify', async ({ query, set }) => {
    try {
      if (!query.q) {
        set.status = 400;
        return { error: 'Query parameter "q" is required' };
      }

      apiLogger.info('Searching Spotify', { query: query.q });

      const results = await spotifyService.search(query.q, query.limit || 20);

      return {
        results,
        count: results.length,
      };
    } catch (err) {
      apiLogger.error('Spotify search failed', err);
      set.status = 500;
      return { error: err instanceof Error ? err.message : 'Spotify search failed' };
    }
  }, {
    query: t.Object({
      q: t.String({ minLength: 1 }),
      limit: t.Optional(t.Number({ minimum: 1, maximum: 50 })),
    }),
  })

  // Add song from Spotify (downloads from YouTube)
  .post('/add-from-spotify', async ({ body, set }) => {
    console.log('🔵 Endpoint hit: /add-from-spotify');
    console.log('🔵 Body:', JSON.stringify(body));
    try {
      apiLogger.info('Adding song from Spotify', { spotifyId: body.spotifyId });

      // 1. Get Spotify metadata
      const spotifyTrack = await spotifyService.getTrack(body.spotifyId);
      if (!spotifyTrack) {
        set.status = 404;
        return { error: 'Spotify track not found' };
      }

      // 2. Check if song already exists (by Spotify ID or title+artist)
      const existingBySpotify = await songRepository.findAll();
      const duplicate = existingBySpotify.find(
        s => s.spotifyId === body.spotifyId ||
             (s.title === spotifyTrack.title && s.artist === spotifyTrack.artist)
      );

      if (duplicate) {
        set.status = 409;
        return {
          error: 'Song already exists in library',
          existingSong: duplicate
        };
      }

      // 3. Find and download from YouTube
      apiLogger.info('Searching YouTube', {
        title: spotifyTrack.title,
        artist: spotifyTrack.artist
      });

      const youtubeVideo = await youtubeDownloadService.findBestMatch(
        spotifyTrack.title,
        spotifyTrack.artist
      );

      if (!youtubeVideo) {
        set.status = 404;
        return { error: 'Could not find song on YouTube' };
      }

      apiLogger.info('Downloading from YouTube', { videoId: youtubeVideo.videoId });

      const downloadResult = await youtubeDownloadService.download(
        youtubeVideo.videoId,
        { format: 'mp3', quality: '192' }
      );

      if (!downloadResult.success || !downloadResult.filePath) {
        set.status = 500;
        return {
          error: 'Failed to download audio',
          details: downloadResult.error
        };
      }

      // 4. Detect language
      const language = detectSongLanguage(spotifyTrack.title, spotifyTrack.artist);

      // 4.5. Trim audio to save storage space
      let finalFileSize = downloadResult.fileSize!;
      const clipStart = body.clipStart ?? SONG_CONFIG.DEFAULT_CLIP_START;
      const clipDuration = body.clipDuration ?? SONG_CONFIG.DEFAULT_CLIP_DURATION;

      try {
        apiLogger.info('Trimming downloaded audio', { clipStart, clipDuration });

        const trimResult = await trimAndReplace({
          inputPath: downloadResult.filePath,
          startTime: clipStart,
          duration: clipDuration,
          format: 'mp3',
          bitrate: '192k',
        });

        finalFileSize = trimResult.fileSize;
        apiLogger.info('Downloaded audio trimmed successfully', {
          originalSize: downloadResult.fileSize,
          trimmedSize: finalFileSize
        });
      } catch (trimError) {
        apiLogger.warn('Audio trimming failed, keeping original file', trimError);
        // Continue with original file if trimming fails
      }

      // 5. Create song record
      const song = await songRepository.create({
        filePath: downloadResult.filePath,
        fileName: downloadResult.fileName!,
        title: spotifyTrack.title,
        artist: spotifyTrack.artist,
        album: spotifyTrack.album,
        year: spotifyTrack.year || new Date().getFullYear(),
        genre: body.genre || spotifyTrack.genre,
        duration: spotifyTrack.duration,
        clipStart,
        clipDuration,
        fileSize: finalFileSize,
        format: 'mp3',
        language,
        spotifyId: spotifyTrack.spotifyId,
        youtubeId: youtubeVideo.videoId,
        source: 'spotify-youtube',
      });

      apiLogger.info('Song added successfully', {
        songId: song.id,
        title: song.title,
        youtubeId: youtubeVideo.videoId
      });

      return {
        song,
        source: {
          spotify: spotifyTrack,
          youtube: youtubeVideo,
        },
      };
    } catch (err) {
      apiLogger.error('Failed to add song from Spotify', err);
      set.status = 500;
      return {
        error: err instanceof Error ? err.message : 'Failed to add song'
      };
    }
  }, {
    body: t.Object({
      spotifyId: t.String(),
      clipStart: t.Optional(t.Number({ minimum: 0 })),
      clipDuration: t.Optional(t.Number({ minimum: 1, maximum: 180 })), // Max 3 minutes
      genre: t.Optional(t.String()),
    }),
  });
