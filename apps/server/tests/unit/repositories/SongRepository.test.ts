/**
 * SongRepository Filter Tests
 *
 * Tests for song filtering functionality:
 * - Genre filtering (single and multiple)
 * - Year range filtering
 * - Niche song filtering
 * - Combined filters
 * - Random song selection
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { MockSongRepository, createMockSong } from '../../helpers/testUtils'
import type { Song } from '@blind-test/shared'

describe('SongRepository - Niche Filtering', () => {
  let repository: MockSongRepository
  let regularSongs: Song[]
  let nicheSongs: Song[]

  beforeEach(() => {
    repository = new MockSongRepository()

    // Create regular songs
    regularSongs = [
      createMockSong({ id: 'song-1', title: 'Popular Song 1', niche: false }),
      createMockSong({ id: 'song-2', title: 'Popular Song 2', niche: false }),
      createMockSong({ id: 'song-3', title: 'Popular Song 3', niche: false }),
    ]

    // Create niche songs
    nicheSongs = [
      createMockSong({ id: 'song-4', title: 'Obscure Song 1', niche: true }),
      createMockSong({ id: 'song-5', title: 'Obscure Song 2', niche: true }),
    ]

    repository.seed([...regularSongs, ...nicheSongs])
  })

  test('excludes niche songs by default', async () => {
    const songs = await repository.findByFilters({})

    expect(songs.length).toBe(3)
    expect(songs.every(s => !s.niche)).toBe(true)
    expect(songs.map(s => s.id)).toEqual(['song-1', 'song-2', 'song-3'])
  })

  test('excludes niche songs when includeNiche is false', async () => {
    const songs = await repository.findByFilters({ includeNiche: false })

    expect(songs.length).toBe(3)
    expect(songs.every(s => !s.niche)).toBe(true)
  })

  test('includes niche songs when includeNiche is true', async () => {
    const songs = await repository.findByFilters({ includeNiche: true })

    expect(songs.length).toBe(5)
    expect(songs.some(s => s.niche)).toBe(true)
  })

  test('getRandom excludes niche songs by default', async () => {
    const songs = await repository.getRandom(2)

    expect(songs.length).toBe(2)
    expect(songs.every(s => !s.niche)).toBe(true)
  })

  test('getRandom includes niche songs when requested', async () => {
    const songs = await repository.getRandom(5, true)

    expect(songs.length).toBe(5)
    // Should potentially include some niche songs (though random)
  })
})

describe('SongRepository - Genre Filtering', () => {
  let repository: MockSongRepository

  beforeEach(() => {
    repository = new MockSongRepository()

    const songs = [
      createMockSong({ id: 'rock-1', genre: 'rock', title: 'Rock Song 1' }),
      createMockSong({ id: 'rock-2', genre: 'rock', title: 'Rock Song 2' }),
      createMockSong({ id: 'pop-1', genre: 'pop', title: 'Pop Song 1' }),
      createMockSong({ id: 'pop-2', genre: 'pop', title: 'Pop Song 2' }),
      createMockSong({ id: 'jazz-1', genre: 'jazz', title: 'Jazz Song 1' }),
    ]

    repository.seed(songs)
  })

  test('filters by single genre', async () => {
    const songs = await repository.findByFilters({ genre: 'rock' })

    expect(songs.length).toBe(2)
    expect(songs.every(s => s.genre === 'rock')).toBe(true)
  })

  test('filters by multiple genres using OR logic', async () => {
    const songs = await repository.findByFilters({ genre: ['rock', 'jazz'] })

    expect(songs.length).toBe(3)
    expect(songs.every(s => s.genre === 'rock' || s.genre === 'jazz')).toBe(true)
  })

  test('returns empty array when no songs match genre', async () => {
    const songs = await repository.findByFilters({ genre: 'classical' })

    expect(songs.length).toBe(0)
  })

  test('genre filter works with partial matches', async () => {
    repository.seed([
      createMockSong({ id: 'indie-1', genre: 'indie-rock' }),
      createMockSong({ id: 'indie-2', genre: 'indie-pop' }),
      createMockSong({ id: 'rock-1', genre: 'rock' }),
    ])

    const songs = await repository.findByFilters({ genre: 'indie' })

    expect(songs.length).toBe(2)
    expect(songs.every(s => s.genre?.includes('indie'))).toBe(true)
  })
})

describe('SongRepository - Year Range Filtering', () => {
  let repository: MockSongRepository

  beforeEach(() => {
    repository = new MockSongRepository()

    const songs = [
      createMockSong({ id: '1980s', year: 1985, title: '1980s Song' }),
      createMockSong({ id: '1990s', year: 1995, title: '1990s Song' }),
      createMockSong({ id: '2000s', year: 2005, title: '2000s Song' }),
      createMockSong({ id: '2010s', year: 2015, title: '2010s Song' }),
      createMockSong({ id: '2020s', year: 2023, title: '2020s Song' }),
    ]

    repository.seed(songs)
  })

  test('filters by minimum year', async () => {
    const songs = await repository.findByFilters({ yearMin: 2000 })

    expect(songs.length).toBe(3)
    expect(songs.every(s => s.year >= 2000)).toBe(true)
  })

  test('filters by maximum year', async () => {
    const songs = await repository.findByFilters({ yearMax: 2000 })

    expect(songs.length).toBe(2)
    expect(songs.every(s => s.year <= 2000)).toBe(true)
  })

  test('filters by year range (min and max)', async () => {
    const songs = await repository.findByFilters({
      yearMin: 1990,
      yearMax: 2010
    })

    expect(songs.length).toBe(2)
    expect(songs.every(s => s.year >= 1990 && s.year <= 2010)).toBe(true)
  })

  test('returns empty array when no songs in range', async () => {
    const songs = await repository.findByFilters({
      yearMin: 2030,
      yearMax: 2040
    })

    expect(songs.length).toBe(0)
  })

  test('year range includes boundary values', async () => {
    const songs = await repository.findByFilters({
      yearMin: 1995,
      yearMax: 2005
    })

    expect(songs.length).toBe(2)
    expect(songs.map(s => s.year).sort()).toEqual([1995, 2005])
  })
})

describe('SongRepository - Artist Filtering', () => {
  let repository: MockSongRepository

  beforeEach(() => {
    repository = new MockSongRepository()

    const songs = [
      createMockSong({ id: 'beatles-1', artist: 'The Beatles' }),
      createMockSong({ id: 'beatles-2', artist: 'The Beatles' }),
      createMockSong({ id: 'stones-1', artist: 'The Rolling Stones' }),
      createMockSong({ id: 'queen-1', artist: 'Queen' }),
    ]

    repository.seed(songs)
  })

  test('filters by artist name (exact match)', async () => {
    const songs = await repository.findByFilters({ artistName: 'Queen' })

    expect(songs.length).toBe(1)
    expect(songs[0].artist).toBe('Queen')
  })

  test('filters by artist name (partial match)', async () => {
    const songs = await repository.findByFilters({ artistName: 'Beatles' })

    expect(songs.length).toBe(2)
    expect(songs.every(s => s.artist.includes('Beatles'))).toBe(true)
  })

  test('artist filter is case insensitive', async () => {
    const songs = await repository.findByFilters({ artistName: 'beatles' })

    expect(songs.length).toBe(2)
  })

  test('returns empty array when artist not found', async () => {
    const songs = await repository.findByFilters({ artistName: 'Unknown Artist' })

    expect(songs.length).toBe(0)
  })
})

describe('SongRepository - Combined Filters', () => {
  let repository: MockSongRepository

  beforeEach(() => {
    repository = new MockSongRepository()

    const songs = [
      // Rock songs from 1980s
      createMockSong({ id: 'rock-80-1', genre: 'rock', year: 1985, niche: false }),
      createMockSong({ id: 'rock-80-2', genre: 'rock', year: 1988, niche: false }),

      // Rock songs from 2000s
      createMockSong({ id: 'rock-00-1', genre: 'rock', year: 2005, niche: false }),
      createMockSong({ id: 'rock-00-2', genre: 'rock', year: 2008, niche: true }),

      // Pop songs from 2000s
      createMockSong({ id: 'pop-00-1', genre: 'pop', year: 2005, niche: false }),
      createMockSong({ id: 'pop-00-2', genre: 'pop', year: 2008, niche: false }),
    ]

    repository.seed(songs)
  })

  test('combines genre and year filters', async () => {
    const songs = await repository.findByFilters({
      genre: 'rock',
      yearMin: 2000
    })

    expect(songs.length).toBe(1) // Only non-niche rock from 2000s
    expect(songs[0].genre).toBe('rock')
    expect(songs[0].year).toBeGreaterThanOrEqual(2000)
    expect(songs[0].niche).toBe(false)
  })

  test('combines genre, year, and niche filters', async () => {
    const songs = await repository.findByFilters({
      genre: 'rock',
      yearMin: 2000,
      includeNiche: true
    })

    expect(songs.length).toBe(2)
    expect(songs.every(s => s.genre === 'rock' && s.year >= 2000)).toBe(true)
  })

  test('applies all filters together', async () => {
    repository.seed([
      createMockSong({
        id: 'perfect-match',
        genre: 'rock',
        year: 2010,
        artist: 'Test Artist',
        niche: false
      }),
      createMockSong({
        id: 'wrong-genre',
        genre: 'pop',
        year: 2010,
        artist: 'Test Artist',
        niche: false
      }),
      createMockSong({
        id: 'wrong-year',
        genre: 'rock',
        year: 1990,
        artist: 'Test Artist',
        niche: false
      }),
      createMockSong({
        id: 'wrong-niche',
        genre: 'rock',
        year: 2010,
        artist: 'Test Artist',
        niche: true
      }),
    ])

    const songs = await repository.findByFilters({
      genre: 'rock',
      yearMin: 2000,
      yearMax: 2020,
      artistName: 'Test',
      includeNiche: false
    })

    expect(songs.length).toBe(1)
    expect(songs[0].id).toBe('perfect-match')
  })
})

describe('SongRepository - Song Count Limiting', () => {
  let repository: MockSongRepository

  beforeEach(() => {
    repository = new MockSongRepository()

    const songs = Array.from({ length: 20 }, (_, i) =>
      createMockSong({
        id: `song-${i}`,
        title: `Song ${i}`,
        niche: false
      })
    )

    repository.seed(songs)
  })

  test('limits number of songs returned', async () => {
    const songs = await repository.findByFilters({ songCount: 5 })

    expect(songs.length).toBe(5)
  })

  test('returns all songs when songCount exceeds available', async () => {
    repository.seed([
      createMockSong({ id: 'song-1' }),
      createMockSong({ id: 'song-2' }),
    ])

    const songs = await repository.findByFilters({ songCount: 10 })

    expect(songs.length).toBe(2)
  })

  test('songCount works with other filters', async () => {
    repository.seed([
      createMockSong({ id: 'rock-1', genre: 'rock' }),
      createMockSong({ id: 'rock-2', genre: 'rock' }),
      createMockSong({ id: 'rock-3', genre: 'rock' }),
      createMockSong({ id: 'rock-4', genre: 'rock' }),
      createMockSong({ id: 'pop-1', genre: 'pop' }),
    ])

    const songs = await repository.findByFilters({
      genre: 'rock',
      songCount: 2
    })

    expect(songs.length).toBe(2)
    expect(songs.every(s => s.genre === 'rock')).toBe(true)
  })

  test('getRandom respects count parameter', async () => {
    const songs = await repository.getRandom(3)

    expect(songs.length).toBe(3)
  })
})

describe('SongRepository - Edge Cases', () => {
  let repository: MockSongRepository

  beforeEach(() => {
    repository = new MockSongRepository()
  })

  test('returns empty array when repository is empty', async () => {
    const songs = await repository.findByFilters({})

    expect(songs.length).toBe(0)
  })

  test('handles songs without genre gracefully', async () => {
    repository.seed([
      createMockSong({ id: 'with-genre', genre: 'rock' }),
      createMockSong({ id: 'without-genre', genre: undefined }),
    ])

    const songs = await repository.findByFilters({ genre: 'rock' })

    expect(songs.length).toBe(1)
    expect(songs[0].id).toBe('with-genre')
  })

  test('handles undefined filters gracefully', async () => {
    repository.seed([createMockSong({ id: 'song-1' })])

    const songs = await repository.findByFilters({
      genre: undefined,
      yearMin: undefined,
      yearMax: undefined,
    })

    expect(songs.length).toBe(1)
  })

  test('handles year 0 correctly', async () => {
    repository.seed([
      createMockSong({ id: 'year-0', year: 0 }),
      createMockSong({ id: 'year-2000', year: 2000 }),
    ])

    const songs = await repository.findByFilters({ yearMax: 1000 })

    expect(songs.length).toBe(1)
    expect(songs[0].year).toBe(0)
  })
})
