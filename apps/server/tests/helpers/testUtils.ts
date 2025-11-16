/**
 * Shared test utilities for blind-test testing
 */

import type { Player, Room, Round, Song, GameSession } from '@blind-test/shared'

/**
 * Create a mock player for testing
 */
export function createMockPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: `player-${Math.random().toString(36).substr(2, 9)}`,
    name: 'Test Player',
    score: 0,
    connected: true,
    isMaster: false,
    joinedAt: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create a mock room for testing
 */
export function createMockRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: `room-${Math.random().toString(36).substr(2, 9)}`,
    name: 'Test Room',
    code: Math.random().toString(36).substr(2, 6).toUpperCase(),
    status: 'lobby',
    createdAt: new Date().toISOString(),
    qrCode: 'data:image/png;base64,test',
    ...overrides,
  }
}

/**
 * Create a mock song for testing
 */
export function createMockSong(overrides: Partial<Song> = {}): Song {
  const id = `song-${Math.random().toString(36).substr(2, 9)}`
  return {
    id,
    filePath: `/uploads/${id}.mp3`,
    fileName: `${id}.mp3`,
    title: 'Test Song',
    artist: 'Test Artist',
    year: 2024,
    duration: 180, // 3 minutes
    genre: 'test',
    clipStart: 30,
    clipDuration: 45,
    fileSize: 5242880, // 5MB
    format: 'mp3',
    niche: false, // Default: not a niche song
    source: 'test',
    createdAt: new Date(),
    ...overrides,
  }
}

/**
 * Create a mock game session for testing
 */
export function createMockGameSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: `session-${Math.random().toString(36).substr(2, 9)}`,
    roomId: 'test-room',
    startedAt: new Date().toISOString(),
    status: 'active',
    ...overrides,
  }
}

/**
 * Create a mock round for testing
 */
export function createMockRound(overrides: Partial<Round> = {}): Round {
  return {
    id: `round-${Math.random().toString(36).substr(2, 9)}`,
    sessionId: 'test-session',
    index: 0,
    modeType: 'buzz_and_choice',
    mediaType: 'music',
    songFilters: { songCount: 5 },
    params: {},
    status: 'pending',
    currentSongIndex: 0,
    ...overrides,
  }
}

/**
 * Create an array of mock songs for testing choice generation
 */
export function createMockSongs(count: number): Song[] {
  return Array.from({ length: count }, (_, i) =>
    createMockSong({
      id: `song-${i}`,
      title: `Song ${i}`,
      artist: `Artist ${i}`,
      year: 2020 + i,
    })
  )
}

/**
 * Simulate a buzz with timestamp
 */
export interface MockBuzz {
  playerId: string
  timestamp: number
  serverArrivalTime?: number
}

/**
 * Create a mock buzz event
 */
export function createMockBuzz(playerId: string, timestamp: number): MockBuzz {
  return {
    playerId,
    timestamp,
    serverArrivalTime: Date.now(),
  }
}

/**
 * Wait for a specific duration (useful for testing timers)
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Assert that an array contains all expected items
 */
export function assertContains<T>(array: T[], ...items: T[]): void {
  for (const item of items) {
    if (!array.includes(item)) {
      throw new Error(`Expected array to contain ${item}`)
    }
  }
}

/**
 * Assert that an array is shuffled (not in original order)
 */
export function assertShuffled<T>(original: T[], shuffled: T[]): void {
  if (original.length !== shuffled.length) {
    throw new Error('Arrays must have same length')
  }

  // At least one element should be in a different position
  let isDifferent = false
  for (let i = 0; i < original.length; i++) {
    if (original[i] !== shuffled[i]) {
      isDifferent = true
      break
    }
  }

  if (!isDifferent) {
    throw new Error('Array appears to not be shuffled')
  }
}

/**
 * Mock WebSocket event collector
 */
export class MockWebSocketCollector {
  public events: Array<{ type: string; data: any }> = []

  broadcast(type: string, data: any) {
    this.events.push({ type, data })
  }

  getEvents(type?: string): Array<{ type: string; data: any }> {
    if (type) {
      return this.events.filter(e => e.type === type)
    }
    return this.events
  }

  getLastEvent(type?: string): { type: string; data: any } | undefined {
    const events = this.getEvents(type)
    return events[events.length - 1]
  }

  clear() {
    this.events = []
  }

  assertEventOrder(...types: string[]) {
    const actualTypes = this.events.map(e => e.type)
    for (let i = 0; i < types.length; i++) {
      if (actualTypes[i] !== types[i]) {
        throw new Error(
          `Expected event at index ${i} to be ${types[i]}, got ${actualTypes[i]}`
        )
      }
    }
  }
}

/**
 * Mock Song Repository for testing (avoids database dependency)
 */
export class MockSongRepository {
  private songs: Map<string, Song> = new Map()

  constructor(initialSongs: Song[] = []) {
    initialSongs.forEach(song => this.songs.set(song.id, song))
  }

  async findById(id: string): Promise<Song | null> {
    return this.songs.get(id) || null
  }

  async findAll(): Promise<Song[]> {
    return Array.from(this.songs.values())
  }

  async create(song: Partial<Song>): Promise<Song> {
    const newSong: Song = {
      id: song.id || `song-${Math.random().toString(36).substr(2, 9)}`,
      filePath: song.filePath || `/uploads/${song.id}.mp3`,
      fileName: song.fileName || `${song.id}.mp3`,
      title: song.title || 'Test Song',
      artist: song.artist || 'Test Artist',
      year: song.year || 2024,
      duration: song.duration || 180,
      genre: song.genre,
      clipStart: song.clipStart || 30,
      clipDuration: song.clipDuration || 45,
      fileSize: song.fileSize || 5242880,
      format: song.format || 'mp3',
      createdAt: song.createdAt || new Date(),
      source: song.source || 'test',
      niche: song.niche ?? false,
      album: song.album,
      language: song.language,
      subgenre: song.subgenre,
      spotifyId: song.spotifyId,
      youtubeId: song.youtubeId,
    }
    this.songs.set(newSong.id, newSong)
    return newSong
  }

  async findByFilters(filters: {
    genre?: string | string[];
    yearMin?: number;
    yearMax?: number;
    artistName?: string;
    songCount?: number;
    includeNiche?: boolean;
  } = {}): Promise<Song[]> {
    let songs = Array.from(this.songs.values())

    // Filter by niche (exclude by default unless includeNiche is true)
    if (!filters.includeNiche) {
      songs = songs.filter(s => !s.niche)
    }

    // Filter by genre
    if (filters.genre) {
      if (Array.isArray(filters.genre)) {
        // Multiple genres - OR logic
        songs = songs.filter(s =>
          s.genre && filters.genre!.some(g => s.genre?.includes(g))
        )
      } else {
        // Single genre
        songs = songs.filter(s => s.genre?.includes(filters.genre as string))
      }
    }

    // Filter by year range
    if (filters.yearMin !== undefined) {
      songs = songs.filter(s => s.year >= filters.yearMin!)
    }
    if (filters.yearMax !== undefined) {
      songs = songs.filter(s => s.year <= filters.yearMax!)
    }

    // Filter by artist name
    if (filters.artistName) {
      songs = songs.filter(s =>
        s.artist.toLowerCase().includes(filters.artistName!.toLowerCase())
      )
    }

    // Limit count (random selection)
    if (filters.songCount && filters.songCount < songs.length) {
      // Shuffle and take first N
      const shuffled = [...songs].sort(() => Math.random() - 0.5)
      songs = shuffled.slice(0, filters.songCount)
    }

    return songs
  }

  async getRandom(count: number, includeNiche: boolean = false): Promise<Song[]> {
    return this.findByFilters({ songCount: count, includeNiche })
  }

  async update(id: string, data: Partial<Song>): Promise<Song> {
    const existing = this.songs.get(id)
    if (!existing) throw new Error(`Song ${id} not found`)
    const updated = { ...existing, ...data }
    this.songs.set(id, updated)
    return updated
  }

  async delete(id: string): Promise<void> {
    this.songs.delete(id)
  }

  clear() {
    this.songs.clear()
  }

  seed(songs: Song[]) {
    this.clear()
    songs.forEach(song => this.songs.set(song.id, song))
  }
}
