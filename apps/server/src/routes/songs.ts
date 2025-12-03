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
import { duplicateDetectionService } from '../services/DuplicateDetectionService';
import { metadataEnrichmentService } from '../services/MetadataEnrichmentService';
import { jobQueue } from '../services/JobQueue';

const apiLogger = logger.child({ module: 'API:Songs' });

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

/**
 * Check admin authentication via header
 * Returns error response if not authenticated, null if OK
 */
function checkAdminAuth(headers: Record<string, string | undefined>): { status: number; body: { error: string } } | null {
  if (!ADMIN_PASSWORD) {
    return { status: 503, body: { error: 'Admin authentication not configured' } };
  }

  const providedPassword = headers['x-admin-password'];

  if (!providedPassword || providedPassword !== ADMIN_PASSWORD) {
    return { status: 401, body: { error: 'Admin authentication required' } };
  }

  return null; // Auth passed
}

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
  // Get all songs with optional filtering
  .get('/', async ({ query }) => {
    const filter = query.filter;

    let songs;
    if (filter === 'incomplete-metadata') {
      apiLogger.debug('Fetching songs with incomplete metadata');
      songs = await songRepository.findWithIncompleteMetadata();
    } else if (filter === 'missing-file') {
      apiLogger.debug('Fetching songs with missing files');
      songs = await songRepository.findWithMissingFile();
    } else {
      apiLogger.debug('Fetching all songs');
      songs = await songRepository.findAll();
    }

    return {
      songs,
      total: songs.length,
      filter: filter || 'all',
    };
  }, {
    query: t.Object({
      filter: t.Optional(t.Union([
        t.Literal('incomplete-metadata'),
        t.Literal('missing-file'),
        t.Literal('all')
      ]))
    })
  })

  // Get song statistics for charts
  .get('/stats', async ({ query }) => {
    const includeNiche = query.includeNiche === 'true';
    apiLogger.debug('Fetching song statistics', { includeNiche });
    try {
      const stats = await songRepository.getStats(includeNiche);
      return stats;
    } catch (err) {
      apiLogger.error('Failed to fetch song statistics', err);
      return { error: 'Failed to fetch statistics' };
    }
  }, {
    query: t.Object({
      includeNiche: t.Optional(t.String()),
    }),
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
  .get('/:songId', async ({ params: { songId }, set }) => {
    const song = await songRepository.findById(songId);

    if (!song) {
      set.status = 404;
      return { error: 'Song not found' };
    }

    return song;
  })

  // Get audio info (duration, format, etc.) for preview
  .get('/:songId/info', async ({ params: { songId }, set }) => {
    const song = await songRepository.findById(songId);

    if (!song) {
      set.status = 404;
      return { error: 'Song not found' };
    }

    const filePath = path.join(process.cwd(), song.filePath);
    if (!existsSync(filePath)) {
      set.status = 404;
      return { error: 'Audio file not found' };
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
      set.status = 500;
      return { error: 'Failed to analyze audio file' };
    }
  })

  // Stream song audio
  .get('/:songId/stream', async ({ params: { songId }, set, request }) => {
    apiLogger.debug('Streaming audio', { songId });

    const song = await songRepository.findById(songId);
    if (!song) {
      set.status = 404;
      return { error: 'Song not found' };
    }

    // Security: Validate file path to prevent directory traversal
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    const requestedPath = path.resolve(process.cwd(), song.filePath);

    // Ensure the resolved path is within the uploads directory
    if (!requestedPath.startsWith(uploadsDir)) {
      apiLogger.error('Path traversal attempt detected', { songId, filePath: song.filePath, requestedPath, uploadsDir });
      set.status = 403;
      return { error: 'Access denied' };
    }

    const filePath = requestedPath;
    if (!existsSync(filePath)) {
      apiLogger.warn('Audio file not found on disk', { songId, filePath });
      set.status = 404;
      return { error: 'Audio file not found' };
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
      set.status = 500;
      return { error: 'Failed to stream audio' };
    }
  })

  // Upload new song
  .post('/upload', async ({ body, set, query, headers }) => {
    // Check admin auth
    const authError = checkAdminAuth(headers as Record<string, string | undefined>);
    if (authError) {
      set.status = authError.status;
      return authError.body;
    }

    apiLogger.info('Uploading song', { force: query.force || false });

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

      // Create background job for processing
      const job = jobQueue.createJob('file_upload', {
        tempFilePath: filePath,
        fileName: filename,
        clipStart: body.clipStart,
        clipDuration: body.clipDuration,
        force: query.force || false,
        providedMetadata: {
          title: body.title,
          artist: body.artist,
          album: body.album,
          year: body.year,
          genre: body.genre,
        },
      });

      apiLogger.info('File upload job created', { jobId: job.id, fileName: filename });

      return {
        jobId: job.id,
        status: 'processing',
        message: 'File uploaded successfully, processing in background',
      };
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
      title: t.Optional(t.String()),
      artist: t.Optional(t.String()),
      album: t.Optional(t.String()),
      year: t.Optional(t.Number()),
      genre: t.Optional(t.String()),
    }),
    query: t.Object({
      force: t.Optional(t.Boolean()),
    }),
  })

  // Update song metadata
  .patch('/:songId', async ({ params: { songId }, body, set, headers }) => {
    // Check admin auth
    const authError = checkAdminAuth(headers as Record<string, string | undefined>);
    if (authError) {
      set.status = authError.status;
      return authError.body;
    }

    const song = await songRepository.findById(songId);

    if (!song) {
      set.status = 404;
      return { error: 'Song not found' };
    }

    try {
      const updated = await songRepository.update(songId, body);
      apiLogger.info('Updated song', { songId, title: updated.title });
      return updated;
    } catch (err) {
      apiLogger.error('Failed to update song', err, { songId });
      set.status = 500;
      return { error: 'Failed to update song' };
    }
  }, {
    body: t.Object({
      title: t.Optional(t.String()),
      artist: t.Optional(t.String()),
      album: t.Optional(t.String()),
      year: t.Optional(t.Number()),
      genre: t.Optional(t.String()),
      clipStart: t.Optional(t.Number({ minimum: 0 })),
      niche: t.Optional(t.Boolean()),
    }),
  })

  // Auto-discover metadata for existing song
  .post('/:songId/auto-discover', async ({ params: { songId }, set, headers }) => {
    // Check admin auth
    const authError = checkAdminAuth(headers as Record<string, string | undefined>);
    if (authError) {
      set.status = authError.status;
      return authError.body;
    }

    const song = await songRepository.findById(songId);

    if (!song) {
      set.status = 404;
      return { error: 'Song not found' };
    }

    try {
      // Use the song's current metadata as the YouTube-like input
      const enrichmentResult = await metadataEnrichmentService.enrichFromYouTube({
        title: `${song.artist} - ${song.title}`,
        uploader: song.artist,
        duration: song.duration,
        youtubeId: undefined
      });

      apiLogger.info('Auto-discovered metadata', {
        songId,
        provider: metadataEnrichmentService.getProvider().name,
        confidence: enrichmentResult.enriched.confidence
      });

      // Return the enrichment result without auto-updating
      // The client decides whether to apply it
      return {
        success: true,
        provider: metadataEnrichmentService.getProvider().name,
        enriched: enrichmentResult.enriched,
        original: {
          title: song.title,
          artist: song.artist,
          album: song.album,
          year: song.year,
          genre: song.genre
        }
      };
    } catch (err) {
      apiLogger.error('Failed to auto-discover metadata', err, { songId });
      set.status = 500;
      return { error: 'Failed to auto-discover metadata' };
    }
  })

  // Delete song
  .delete('/:songId', async ({ params: { songId }, set, headers }) => {
    // Check admin auth
    const authError = checkAdminAuth(headers as Record<string, string | undefined>);
    if (authError) {
      set.status = authError.status;
      return authError.body;
    }

    const song = await songRepository.findById(songId);

    if (!song) {
      set.status = 404;
      return { error: 'Song not found' };
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
      set.status = 500;
      return { error: 'Failed to delete song' };
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

  // Check for duplicate songs
  .post('/check-duplicate', async ({ body, set, headers }) => {
    // Check admin auth
    const authError = checkAdminAuth(headers as Record<string, string | undefined>);
    if (authError) {
      set.status = authError.status;
      return authError.body;
    }

    try {
      apiLogger.info('Checking for duplicates', { title: body.title, artist: body.artist });

      const result = await duplicateDetectionService.detectDuplicates({
        title: body.title,
        artist: body.artist,
        duration: body.duration,
        spotifyId: body.spotifyId,
        youtubeId: body.youtubeId,
        album: body.album,
        year: body.year,
      });

      return {
        isDuplicate: result.isDuplicate,
        confidence: result.highestConfidence,
        matches: result.matches.map(match => ({
          song: {
            id: match.song.id,
            title: match.song.title,
            artist: match.song.artist,
            album: match.song.album,
            year: match.song.year,
            duration: match.song.duration,
            source: match.song.source,
            spotifyId: match.song.spotifyId,
            youtubeId: match.song.youtubeId,
          },
          confidence: match.confidence,
          reasons: match.reasons,
          titleScore: match.titleScore,
          artistScore: match.artistScore,
          durationMatch: match.durationMatch,
        })),
      };
    } catch (err) {
      apiLogger.error('Duplicate check failed', err);
      set.status = 500;
      return { error: err instanceof Error ? err.message : 'Duplicate check failed' };
    }
  }, {
    body: t.Object({
      title: t.String(),
      artist: t.String(),
      duration: t.Optional(t.Number()),
      spotifyId: t.Optional(t.String()),
      youtubeId: t.Optional(t.String()),
      album: t.Optional(t.String()),
      year: t.Optional(t.Number()),
    }),
  })

  // Download full song from Spotify to temp directory (for clip selection)
  .post('/spotify-download-temp', async ({ body, set, headers }) => {
    // Check admin auth
    const authError = checkAdminAuth(headers as Record<string, string | undefined>);
    if (authError) {
      set.status = authError.status;
      return authError.body;
    }

    try {
      apiLogger.info('Downloading temp song from Spotify', {
        spotifyId: body.spotifyId,
        force: body.force || false
      });

      // 1. Get Spotify metadata
      const spotifyTrack = await spotifyService.getTrack(body.spotifyId);
      if (!spotifyTrack) {
        set.status = 404;
        return { error: 'Spotify track not found' };
      }

      // 2. Check for duplicates (unless force flag is set)
      if (!body.force) {
        const duplicateCheck = await duplicateDetectionService.detectDuplicates({
          title: spotifyTrack.title,
          artist: spotifyTrack.artist,
          duration: spotifyTrack.duration,
          spotifyId: body.spotifyId,
          album: spotifyTrack.album,
          year: spotifyTrack.year,
        });

        if (duplicateCheck.isDuplicate) {
          apiLogger.info('Duplicates found for Spotify track', {
            spotifyId: body.spotifyId,
            matchCount: duplicateCheck.matches.length,
            highestConfidence: duplicateCheck.highestConfidence
          });

          // Return duplicate info instead of blocking
          return {
            duplicates: duplicateCheck.matches.map(match => ({
              song: {
                id: match.song.id,
                title: match.song.title,
                artist: match.song.artist,
                album: match.song.album,
                year: match.song.year,
                duration: match.song.duration,
                source: match.song.source,
                spotifyId: match.song.spotifyId,
                youtubeId: match.song.youtubeId,
              },
              confidence: match.confidence,
              reasons: match.reasons,
            })),
            metadata: spotifyTrack,
          };
        }
      }

      // 3. Find YouTube video
      const youtubeVideo = await youtubeDownloadService.findBestMatch(
        spotifyTrack.title,
        spotifyTrack.artist
      );

      if (!youtubeVideo) {
        set.status = 404;
        return { error: 'Could not find song on YouTube' };
      }

      // 4. Download full song to temp directory
      apiLogger.info('Downloading full song for clip selection', { videoId: youtubeVideo.videoId });

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

      // 5. Return temp file info and metadata
      return {
        tempFileId: path.basename(downloadResult.filePath, '.mp3'),
        tempFilePath: downloadResult.filePath,
        fileName: downloadResult.fileName!,
        fileSize: downloadResult.fileSize!,
        spotify: spotifyTrack,
        youtube: youtubeVideo,
      };
    } catch (err) {
      apiLogger.error('Failed to download temp song from Spotify', err);
      set.status = 500;
      return {
        error: err instanceof Error ? err.message : 'Failed to download song'
      };
    }
  }, {
    body: t.Object({
      spotifyId: t.String(),
      force: t.Optional(t.Boolean()),
    }),
  })

  // Finalize Spotify import after clip selection
  .post('/spotify-finalize', async ({ body, set, headers }) => {
    // Check admin auth
    const authError = checkAdminAuth(headers as Record<string, string | undefined>);
    if (authError) {
      set.status = authError.status;
      return authError.body;
    }

    try {
      apiLogger.info('Finalizing Spotify import', {
        tempFileId: body.tempFileId,
        clipStart: body.clipStart,
        clipDuration: body.clipDuration
      });

      // 1. Verify temp file exists
      const tempFilePath = path.join(process.cwd(), 'uploads', `${body.tempFileId}.mp3`);

      try {
        await stat(tempFilePath);
      } catch {
        set.status = 404;
        return { error: 'Temp file not found or expired' };
      }

      // 2. Trim audio to selected clip
      const clipStart = body.clipStart ?? SONG_CONFIG.DEFAULT_CLIP_START;
      const clipDuration = body.clipDuration ?? SONG_CONFIG.DEFAULT_CLIP_DURATION;

      let finalFileSize: number;

      try {
        apiLogger.info('Trimming audio to clip', { clipStart, clipDuration });

        const trimResult = await trimAndReplace({
          inputPath: tempFilePath,
          startTime: clipStart,
          duration: clipDuration,
          format: 'mp3',
          bitrate: '192k',
        });

        finalFileSize = trimResult.fileSize;

        apiLogger.info('Audio trimmed successfully', {
          originalSize: body.originalFileSize,
          trimmedSize: finalFileSize
        });
      } catch (trimError) {
        apiLogger.error('Audio trimming failed', trimError);
        set.status = 500;
        return { error: 'Failed to trim audio clip' };
      }

      // 3. Enrich Spotify metadata with AI fallback for missing fields
      const enrichmentResult = await metadataEnrichmentService.enrichFromSpotifyData({
        title: body.spotify.title,
        artist: body.spotify.artist,
        album: body.spotify.album,
        year: body.spotify.year,
        genre: body.spotify.genre,
        duration: body.spotify.duration,
        spotifyId: body.spotify.spotifyId
      });

      apiLogger.info('Spotify metadata enriched', {
        confidence: enrichmentResult.enriched.confidence,
        provider: enrichmentResult.provider,
        hasGenre: !!enrichmentResult.enriched.genre,
        hasAlbum: !!enrichmentResult.enriched.album
      });

      // 4. Detect language
      const language = detectSongLanguage(body.spotify.title, body.spotify.artist);

      // 5. Create song record with enriched metadata
      const song = await songRepository.create({
        filePath: tempFilePath,
        fileName: path.basename(tempFilePath),
        title: enrichmentResult.enriched.title,
        artist: enrichmentResult.enriched.artist,
        album: enrichmentResult.enriched.album,
        year: enrichmentResult.enriched.year || new Date().getFullYear(),
        genre: enrichmentResult.enriched.genre,
        duration: body.spotify.duration,
        clipStart,
        clipDuration,
        fileSize: finalFileSize,
        format: 'mp3',
        language,
        spotifyId: body.spotify.spotifyId,
        youtubeId: body.youtube.videoId,
        source: 'spotify-youtube',
      });

      apiLogger.info('Song added successfully from Spotify', {
        songId: song.id,
        title: song.title,
        youtubeId: body.youtube.videoId
      });

      return {
        song,
        source: {
          spotify: body.spotify,
          youtube: body.youtube,
        },
      };
    } catch (err) {
      apiLogger.error('Failed to finalize Spotify import', err);
      set.status = 500;
      return {
        error: err instanceof Error ? err.message : 'Failed to finalize import'
      };
    }
  }, {
    body: t.Object({
      tempFileId: t.String(),
      originalFileSize: t.Number(),
      clipStart: t.Optional(t.Number({ minimum: 0 })),
      clipDuration: t.Optional(t.Number({ minimum: 1, maximum: 180 })),
      genre: t.Optional(t.String()),
      spotify: t.Object({
        spotifyId: t.String(),
        title: t.String(),
        artist: t.String(),
        album: t.Optional(t.String()),
        year: t.Optional(t.Number()),
        genre: t.Optional(t.String()),
        duration: t.Number(),
      }),
      youtube: t.Object({
        videoId: t.String(),
        title: t.String(),
      }),
    }),
  })

  // ========================================================================
  // YouTube Direct Import
  // ========================================================================

  // Get YouTube playlist or video info
  .post('/youtube-playlist-info', async ({ body, set, headers }) => {
    // Check admin auth
    const authError = checkAdminAuth(headers as Record<string, string | undefined>);
    if (authError) {
      set.status = authError.status;
      return authError.body;
    }

    try {
      apiLogger.info('Fetching YouTube playlist/video info', { url: body.url });

      const playlistInfo = await youtubeDownloadService.getPlaylistInfo(body.url);

      return playlistInfo;
    } catch (err) {
      apiLogger.error('Failed to fetch YouTube playlist info', err);
      set.status = 500;
      return {
        error: err instanceof Error ? err.message : 'Failed to fetch playlist information'
      };
    }
  }, {
    body: t.Object({
      url: t.String({ minLength: 1 }),
    }),
  })

  // Check YouTube videos for duplicates
  .post('/youtube-check-duplicates', async ({ body, set, headers }) => {
    // Check admin auth
    const authError = checkAdminAuth(headers as Record<string, string | undefined>);
    if (authError) {
      set.status = authError.status;
      return authError.body;
    }

    try {
      apiLogger.info('Checking YouTube videos for duplicates', {
        videoCount: body.videos.length
      });

      const results = await Promise.all(
        body.videos.map(async (video) => {
          const duplicateCheck = await duplicateDetectionService.detectDuplicates({
            title: video.title,
            artist: video.uploader || 'Unknown',
            duration: video.durationInSeconds,
            youtubeId: video.videoId,
          });

          return {
            videoId: video.videoId,
            title: video.title,
            isDuplicate: duplicateCheck.isDuplicate,
            confidence: duplicateCheck.highestConfidence,
            matches: duplicateCheck.isDuplicate
              ? duplicateCheck.matches.map(match => ({
                  song: {
                    id: match.song.id,
                    title: match.song.title,
                    artist: match.song.artist,
                    album: match.song.album,
                    year: match.song.year,
                    duration: match.song.duration,
                    source: match.song.source,
                    spotifyId: match.song.spotifyId,
                    youtubeId: match.song.youtubeId,
                  },
                  confidence: match.confidence,
                  reasons: match.reasons,
                }))
              : [],
          };
        })
      );

      return {
        results,
        duplicateCount: results.filter(r => r.isDuplicate).length,
        total: results.length,
      };
    } catch (err) {
      apiLogger.error('Failed to check YouTube duplicates', err);
      set.status = 500;
      return {
        error: err instanceof Error ? err.message : 'Failed to check duplicates'
      };
    }
  }, {
    body: t.Object({
      videos: t.Array(
        t.Object({
          videoId: t.String(),
          title: t.String(),
          uploader: t.Optional(t.String()),
          durationInSeconds: t.Optional(t.Number()),
        })
      ),
    }),
  })

  // Enrich YouTube video metadata with Spotify data
  .post('/enrich-metadata', async ({ body, set, headers }) => {
    // Check admin auth
    const authError = checkAdminAuth(headers as Record<string, string | undefined>);
    if (authError) {
      set.status = authError.status;
      return authError.body;
    }

    try {
      apiLogger.info('Enriching YouTube metadata', {
        title: body.youtubeTitle,
        uploader: body.uploader
      });

      const result = await metadataEnrichmentService.enrichFromYouTube({
        title: body.youtubeTitle,
        uploader: body.uploader,
        duration: body.duration,
        youtubeId: body.youtubeId,
      });

      return result;
    } catch (err) {
      apiLogger.error('Failed to enrich metadata', err);
      set.status = 500;
      return {
        error: err instanceof Error ? err.message : 'Failed to enrich metadata'
      };
    }
  }, {
    body: t.Object({
      youtubeTitle: t.String(),
      uploader: t.String(),
      duration: t.Number(),
      youtubeId: t.Optional(t.String()),
    }),
  })

  // Batch enrich YouTube videos metadata
  .post('/youtube-enrich-batch', async ({ body, set, headers }) => {
    // Check admin auth
    const authError = checkAdminAuth(headers as Record<string, string | undefined>);
    if (authError) {
      set.status = authError.status;
      return authError.body;
    }

    try {
      apiLogger.info('Batch enriching YouTube metadata', {
        videoCount: body.videos.length
      });

      // Convert to YouTubeMetadata format
      const youtubeVideos = body.videos.map(video => ({
        title: video.title,
        uploader: video.uploader || 'Unknown',
        duration: video.durationInSeconds,
        youtubeId: video.videoId,
      }));

      // Use batch enrichment with retry logic (max 3 attempts)
      let results;
      let lastError;
      const maxRetries = 3;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          results = await metadataEnrichmentService.enrichBatch(youtubeVideos);
          break; // Success - exit retry loop
        } catch (err) {
          lastError = err;
          apiLogger.warn('Enrichment attempt failed', {
            attempt,
            maxRetries,
            error: err instanceof Error ? err.message : String(err)
          });

          if (attempt < maxRetries) {
            // Exponential backoff: 1s, 2s, 4s
            const delayMs = Math.pow(2, attempt - 1) * 1000;
            apiLogger.info('Retrying enrichment', { delayMs, nextAttempt: attempt + 1 });
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }
      }

      if (!results) {
        throw lastError || new Error('Enrichment failed after retries');
      }

      // Enhanced logging for metadata quality
      const metadataStats = {
        total: results.length,
        withGenre: results.filter(r => r.enriched.genre).length,
        withAlbum: results.filter(r => r.enriched.album).length,
        withYear: results.filter(r => r.enriched.year).length,
        lowConfidence: results.filter(r => r.enriched.confidence < 70).length,
        averageConfidence: Math.round(
          results.reduce((sum, r) => sum + r.enriched.confidence, 0) / results.length
        ),
        providers: [...new Set(results.map(r => r.provider))],
        usedFallback: results.filter(r => r.provider.includes('+')).length
      };

      apiLogger.info('Batch enrichment complete', metadataStats);

      // Log individual low-confidence or missing-field results
      results.forEach((result, index) => {
        if (result.enriched.confidence < 70 || !result.enriched.genre || !result.enriched.album) {
          apiLogger.warn('Enrichment quality concern', {
            index,
            title: result.enriched.title,
            artist: result.enriched.artist,
            confidence: result.enriched.confidence,
            hasGenre: !!result.enriched.genre,
            hasAlbum: !!result.enriched.album,
            hasYear: !!result.enriched.year,
            provider: result.provider
          });
        }
      });

      return {
        results,
        total: results.length,
      };
    } catch (err) {
      apiLogger.error('Failed to batch enrich metadata', err);
      set.status = 500;
      return {
        error: err instanceof Error ? err.message : 'Failed to batch enrich metadata'
      };
    }
  }, {
    body: t.Object({
      videos: t.Array(
        t.Object({
          videoId: t.String(),
          title: t.String(),
          uploader: t.Optional(t.String()),
          durationInSeconds: t.Number(),
        })
      ),
    }),
  })

  // Start batch YouTube import job
  .post('/youtube-import-batch', async ({ body, set, headers }) => {
    // Check admin auth
    const authError = checkAdminAuth(headers as Record<string, string | undefined>);
    if (authError) {
      set.status = authError.status;
      return authError.body;
    }

    try {
      apiLogger.info('Starting YouTube batch import', {
        videoCount: body.videos.length
      });

      // Import the job queue
      const { jobQueue } = await import('../services/JobQueue');

      // Create a job for the batch import
      const job = jobQueue.createJob('youtube_playlist', {
        playlistTitle: body.playlistTitle,
        videos: body.videos,
        genre: body.genre,
      });

      apiLogger.info('YouTube batch import job created', { jobId: job.id });

      return {
        success: true,
        jobId: job.id,
        job,
      };
    } catch (err) {
      apiLogger.error('Failed to start YouTube batch import', err);
      set.status = 500;
      return {
        error: err instanceof Error ? err.message : 'Failed to start batch import'
      };
    }
  }, {
    body: t.Object({
      playlistTitle: t.Optional(t.String()),
      genre: t.Optional(t.String()),
      videos: t.Array(t.Object({
        videoId: t.String(),
        title: t.String(),
        clipStart: t.Optional(t.Number({ minimum: 0 })),
        clipDuration: t.Optional(t.Number({ minimum: 1, maximum: 180 })),
        force: t.Optional(t.Boolean()),
        // Optional: user-provided metadata (artist, title)
        // Enrichment is handled automatically in the backend during job processing
        artist: t.Optional(t.String()),
      })),
    }),
  })
