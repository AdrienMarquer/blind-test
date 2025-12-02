/**
 * Type-Safe API Helpers
 *
 * Provides clean, type-safe wrappers around Eden Treaty API calls.
 * Use these helpers instead of accessing the API directly with `as any` casts.
 *
 * Example:
 *   // Before: const roomsApi = api.api.rooms as Record<string, any>;
 *   // After:  import { roomApi } from '$lib/api-helpers';
 *   //         const response = await roomApi.get(roomId);
 */

import { api, getAuthenticatedApi } from './api';
import type { RoundConfig } from '@blind-test/shared';

// ============================================
// Room Operations
// ============================================

export const roomApi = {
  /**
   * List all rooms, optionally filtered by status
   */
  list: (status?: string) =>
    api.api.rooms.get({ query: { status } }),

  /**
   * Create a new room
   */
  create: (name: string, maxPlayers?: number) =>
    api.api.rooms.post({ name, maxPlayers }),

  /**
   * Find a room by its short code (e.g., "B7UN")
   */
  getByCode: (code: string) =>
    api.api.rooms.code({ code }).get(),

  /**
   * Get a room by its ID
   */
  get: (roomId: string) =>
    api.api.rooms({ roomId }).get(),

  /**
   * Update a room's settings
   */
  update: (roomId: string, data: { name?: string; maxPlayers?: number }) =>
    api.api.rooms({ roomId }).patch(data),

  /**
   * Delete a room
   */
  delete: (roomId: string) =>
    api.api.rooms({ roomId }).delete(),
};

// ============================================
// Player Operations
// ============================================

export const playerApi = {
  /**
   * Add a player to a room
   */
  add: (roomId: string, name: string) =>
    api.api.rooms({ roomId }).players.post({ name }),

  /**
   * Get a player's info
   */
  get: (roomId: string, playerId: string) =>
    api.api.rooms({ roomId }).players({ playerId }).get(),

  /**
   * Remove a player from a room
   */
  remove: (roomId: string, playerId: string) =>
    api.api.rooms({ roomId }).players({ playerId }).delete(),
};

// ============================================
// Game Operations
// ============================================

export const gameApi = {
  /**
   * Start a game with the specified rounds configuration
   */
  start: (roomId: string, rounds: RoundConfig[]) =>
    api.api.game({ roomId }).start.post({ rounds }),

  /**
   * End the current game
   */
  end: (roomId: string) =>
    api.api.game({ roomId }).end.post({}),

  /**
   * Start the next round (from between_rounds state)
   */
  nextRound: (roomId: string) =>
    api.api.game({ roomId })['next-round'].post({}),
};

// ============================================
// Song Operations
// ============================================

export const songApi = {
  /**
   * List all songs, optionally filtered
   */
  list: (filter?: 'incomplete-metadata' | 'missing-file' | 'all') =>
    api.api.songs.get({ query: { filter } }),

  /**
   * Get song statistics for charts
   */
  stats: (includeNiche: boolean) =>
    api.api.songs.stats.get({ query: { includeNiche: String(includeNiche) } }),

  /**
   * Search for songs on Spotify
   */
  searchSpotify: (q: string) =>
    api.api.songs['search-spotify'].get({ query: { q } }),

  /**
   * Get a song by ID
   */
  get: (songId: string) =>
    api.api.songs({ songId }).get(),

  /**
   * Stream a song's audio (returns blob URL)
   */
  stream: (songId: string) =>
    api.api.songs({ songId }).stream.get(),

  /**
   * Download a song from Spotify (authenticated)
   * Note: File upload still uses fetch() due to FormData limitation
   */
  spotifyDownloadTemp: (spotifyId: string, force?: boolean) => {
    const authApi = getAuthenticatedApi();
    return authApi.api.songs['spotify-download-temp'].post({ spotifyId, force });
  },

  /**
   * Confirm and save a temporary download (authenticated)
   */
  confirmTempDownload: (tempFileId: string) => {
    const authApi = getAuthenticatedApi();
    return authApi.api.songs[tempFileId].confirm.post({});
  },

  /**
   * Cancel a temporary download (authenticated)
   */
  cancelTempDownload: (tempFileId: string) => {
    const authApi = getAuthenticatedApi();
    return authApi.api.songs[tempFileId].cancel.post({});
  },

  /**
   * Update a song's metadata (authenticated)
   */
  update: (songId: string, metadata: Record<string, unknown>) => {
    const authApi = getAuthenticatedApi();
    return authApi.api.songs({ songId }).patch(metadata);
  },

  /**
   * Delete a song (authenticated)
   */
  delete: (songId: string) => {
    const authApi = getAuthenticatedApi();
    return authApi.api.songs({ songId }).delete();
  },

  /**
   * Finalize a Spotify download with clip selection (authenticated)
   */
  spotifyFinalize: (tempFileId: string, clipStart: number, clipDuration: number, metadata: Record<string, unknown>) => {
    const authApi = getAuthenticatedApi();
    return authApi.api.songs['spotify-finalize'].post({ tempFileId, clipStart, clipDuration, metadata });
  },

  /**
   * Import songs from YouTube in batch (authenticated)
   */
  youtubeImportBatch: (videos: Array<{
    videoId: string;
    title: string;
    clipStart?: number;
    clipDuration?: number;
    force?: boolean;
    artist?: string;
  }>) => {
    const authApi = getAuthenticatedApi();
    return authApi.api.songs['youtube-import-batch'].post({ videos });
  },

  /**
   * Stream a temporary file's audio (for clip selection)
   */
  streamTemp: (tempFileId: string) =>
    api.api.songs[tempFileId].stream.get(),
};

// ============================================
// Job Operations
// ============================================

export const jobApi = {
  /**
   * Get the status of a job
   */
  get: (jobId: string) =>
    api.api.jobs({ jobId }).get(),

  /**
   * Cancel a job
   */
  cancel: (jobId: string) =>
    api.api.jobs({ jobId }).delete(),
};
