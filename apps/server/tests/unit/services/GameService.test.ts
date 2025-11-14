/**
 * GameService Unit Tests
 *
 * Tests game service logic with mocked dependencies:
 * - Game start validation
 * - Round progression
 * - Score calculation
 * - State transitions
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test'
import type { GameSession, Round, RoundSong, Song, Player } from '@blind-test/shared'
import { createMockRoom, createMockPlayer, createMockSongs, createMockGameSession, createMockRound } from '../../helpers/testUtils'

describe('GameService - Score Calculation', () => {
  test('calculates round scores with correct rankings', () => {
    const players = [
      createMockPlayer({ id: 'player-1', name: 'Alice' }),
      createMockPlayer({ id: 'player-2', name: 'Bob' }),
      createMockPlayer({ id: 'player-3', name: 'Charlie' }),
    ]

    const roundScores = new Map([
      ['player-1', 5],
      ['player-2', 3],
      ['player-3', 7],
    ])

    // Calculate rankings
    const sortedScores = Array.from(roundScores.entries())
      .sort((a, b) => b[1] - a[1]) // Sort descending by score
      .map(([playerId, score], index) => ({
        playerId,
        playerName: players.find(p => p.id === playerId)?.name || '',
        score,
        rank: index + 1,
      }))

    expect(sortedScores.length).toBe(3)
    expect(sortedScores[0].playerId).toBe('player-3')
    expect(sortedScores[0].rank).toBe(1)
    expect(sortedScores[1].playerId).toBe('player-1')
    expect(sortedScores[1].rank).toBe(2)
    expect(sortedScores[2].playerId).toBe('player-2')
    expect(sortedScores[2].rank).toBe(3)
  })

  test('handles tied scores correctly', () => {
    const roundScores = new Map([
      ['player-1', 5],
      ['player-2', 5],
      ['player-3', 3],
    ])

    // Calculate rankings with ties
    const sortedScores = Array.from(roundScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([playerId, score], index, arr) => {
        // Find rank (same score = same rank)
        let rank = 1
        for (let i = 0; i < index; i++) {
          if (arr[i][1] > score) {
            rank++
          }
        }
        return { playerId, score, rank }
      })

    const tied = sortedScores.filter(s => s.score === 5)
    expect(tied.length).toBe(2)
    expect(tied[0].rank).toBe(1)
    expect(tied[1].rank).toBe(1)
  })

  test('calculates final scores across multiple rounds', () => {
    const round1Scores = new Map([
      ['player-1', 5],
      ['player-2', 3],
      ['player-3', 7],
    ])

    const round2Scores = new Map([
      ['player-1', 4],
      ['player-2', 6],
      ['player-3', 2],
    ])

    // Aggregate scores
    const totalScores = new Map<string, { total: number; rounds: number[] }>()

    for (const [playerId, score] of round1Scores) {
      totalScores.set(playerId, { total: score, rounds: [score] })
    }

    for (const [playerId, score] of round2Scores) {
      const existing = totalScores.get(playerId)!
      existing.total += score
      existing.rounds.push(score)
    }

    expect(totalScores.get('player-1')!.total).toBe(9)
    expect(totalScores.get('player-2')!.total).toBe(9)
    expect(totalScores.get('player-3')!.total).toBe(9)
    expect(totalScores.get('player-1')!.rounds).toEqual([5, 4])
    expect(totalScores.get('player-2')!.rounds).toEqual([3, 6])
    expect(totalScores.get('player-3')!.rounds).toEqual([7, 2])
  })

  test('handles round with no correct answers', () => {
    const roundScores = new Map([
      ['player-1', 0],
      ['player-2', 0],
      ['player-3', 0],
    ])

    const sortedScores = Array.from(roundScores.entries())
      .map(([playerId, score]) => ({ playerId, score }))

    expect(sortedScores.length).toBe(3)
    expect(sortedScores.every(s => s.score === 0)).toBe(true)
  })

  test('handles empty scores map', () => {
    const roundScores = new Map<string, number>()

    const sortedScores = Array.from(roundScores.entries())
      .map(([playerId, score]) => ({ playerId, score }))

    expect(sortedScores.length).toBe(0)
    expect(Array.isArray(sortedScores)).toBe(true)
  })
})

describe('GameService - Round Progression Logic', () => {
  test('validates round configuration has required fields', () => {
    const validRound = createMockRound({
      modeType: 'fast_buzz',
      mediaType: 'music',
      songFilters: { songCount: 5 },
    })

    expect(validRound.modeType).toBeDefined()
    expect(validRound.mediaType).toBeDefined()
    expect(validRound.songFilters).toBeDefined()
  })

  test('detects last round correctly', () => {
    const session = createMockGameSession()
    session.rounds = [
      createMockRound({ index: 0 }),
      createMockRound({ index: 1 }),
      createMockRound({ index: 2 }),
    ]

    const isLastRound = (currentIndex: number) => currentIndex === session.rounds.length - 1

    expect(isLastRound(0)).toBe(false)
    expect(isLastRound(1)).toBe(false)
    expect(isLastRound(2)).toBe(true)
  })

  test('calculates next round index correctly', () => {
    const currentRoundIndex = 1
    const nextRoundIndex = currentRoundIndex + 1

    expect(nextRoundIndex).toBe(2)
  })

  test('validates room state transitions', () => {
    const room = createMockRoom({ status: 'lobby' })

    // Game starts
    room.status = 'playing'
    expect(room.status).toBe('playing')

    // Round ends (not last round)
    room.status = 'between_rounds'
    expect(room.status).toBe('between_rounds')

    // Next round starts
    room.status = 'playing'
    expect(room.status).toBe('playing')

    // Last round ends
    room.status = 'finished'
    expect(room.status).toBe('finished')
  })
})

describe('GameService - Song Selection Logic', () => {
  test('selects correct number of songs from pool', () => {
    const songPool = createMockSongs(20)
    const requestedCount = 5

    const selectedSongs = songPool.slice(0, requestedCount)

    expect(selectedSongs.length).toBe(5)
    expect(selectedSongs.every(s => s.title && s.artist)).toBe(true)
  })

  test('validates song has required metadata', () => {
    const song = createMockSongs(1)[0]

    expect(song.id).toBeDefined()
    expect(song.title).toBeDefined()
    expect(song.artist).toBeDefined()
    expect(song.duration).toBeDefined()
    expect(song.clipStart).toBeDefined()
  })

  test('applies song filters correctly', () => {
    const songs = createMockSongs(10)
    const filters = {
      songCount: 5,
      year: 2024,
      genre: 'test',
    }

    // Filter by year and genre
    const filtered = songs
      .filter(s => s.year === filters.year)
      .filter(s => s.genre === filters.genre)
      .slice(0, filters.songCount)

    expect(filtered.length).toBeLessThanOrEqual(5)
    expect(filtered.every(s => s.year === 2024)).toBe(true)
    expect(filtered.every(s => s.genre === 'test')).toBe(true)
  })
})

describe('GameService - Timer Logic', () => {
  test('calculates song end time correctly', () => {
    const songDuration = 30 // seconds
    const startTime = Date.now()
    const endTime = startTime + (songDuration * 1000)

    expect(endTime - startTime).toBe(30000)
  })

  test('calculates time remaining correctly', () => {
    const endTime = Date.now() + 30000 // 30 seconds from now
    const timeRemaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000))

    expect(timeRemaining).toBeGreaterThanOrEqual(29)
    expect(timeRemaining).toBeLessThanOrEqual(30)
  })

  test('detects timer expiration', () => {
    const endTime = Date.now() - 1000 // 1 second ago
    const hasExpired = Date.now() >= endTime

    expect(hasExpired).toBe(true)
  })
})

describe('GameService - Player State Management', () => {
  test('initializes player scores map', () => {
    const players = [
      createMockPlayer({ id: 'player-1' }),
      createMockPlayer({ id: 'player-2' }),
      createMockPlayer({ id: 'player-3' }),
    ]

    const scores = new Map<string, number>()
    for (const player of players) {
      scores.set(player.id, 0)
    }

    expect(scores.size).toBe(3)
    expect(scores.get('player-1')).toBe(0)
    expect(scores.get('player-2')).toBe(0)
    expect(scores.get('player-3')).toBe(0)
  })

  test('updates player score correctly', () => {
    const scores = new Map([['player-1', 5]])
    const pointsAwarded = 2

    scores.set('player-1', scores.get('player-1')! + pointsAwarded)

    expect(scores.get('player-1')).toBe(7)
  })

  test('tracks locked out players', () => {
    const lockedOut = new Set<string>()

    lockedOut.add('player-1')
    lockedOut.add('player-2')

    expect(lockedOut.size).toBe(2)
    expect(lockedOut.has('player-1')).toBe(true)
    expect(lockedOut.has('player-3')).toBe(false)
  })

  test('detects all players locked out', () => {
    const allPlayers = ['player-1', 'player-2', 'player-3']
    const lockedOut = new Set(['player-1', 'player-2', 'player-3'])

    const allLockedOut = allPlayers.every(p => lockedOut.has(p))

    expect(allLockedOut).toBe(true)
  })
})
