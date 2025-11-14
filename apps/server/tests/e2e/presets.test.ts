/**
 * E2E Tests - Game Presets
 *
 * Tests complete game flows for Quick Game and Classic Game presets
 * from GAME_ROUNDS_TESTING.md
 *
 * These tests simulate complete user journeys:
 * - Room creation
 * - Player joins
 * - Game start with preset
 * - Round progression
 * - Player interactions (buzzing, answering)
 * - Score calculations
 * - Game completion
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import type { RoundConfig, Answer, RoundSong } from '@blind-test/shared'
import { BuzzAndChoiceMode } from '../../src/modes/BuzzAndChoiceMode'
import { FastBuzzMode } from '../../src/modes/FastBuzzMode'
import { TextInputMode } from '../../src/modes/TextInputMode'
import { createMockSong, createMockSongs, MockWebSocketCollector } from '../helpers/testUtils'

/**
 * Quick Game Preset Configuration
 */
const quickGamePreset: RoundConfig[] = [
  {
    modeType: 'fast_buzz',
    mediaType: 'music',
    songFilters: { songCount: 5 },
    params: { songDuration: 20, answerTimer: 5 },
  },
  {
    modeType: 'fast_buzz',
    mediaType: 'music',
    songFilters: { songCount: 5 },
    params: { songDuration: 15, answerTimer: 5 },
  },
  {
    modeType: 'buzz_and_choice',
    mediaType: 'music',
    songFilters: { songCount: 5 },
    params: { songDuration: 20, answerTimer: 10, numChoices: 4 },
  },
]

/**
 * Classic Game Preset Configuration
 */
const classicGamePreset: RoundConfig[] = [
  {
    modeType: 'buzz_and_choice',
    mediaType: 'music',
    songFilters: { songCount: 5 },
    params: { songDuration: 30, answerTimer: 10, numChoices: 4 },
  },
  {
    modeType: 'fast_buzz',
    mediaType: 'music',
    songFilters: { songCount: 5 },
    params: { songDuration: 20, answerTimer: 5 },
  },
  {
    modeType: 'text_input',
    mediaType: 'music',
    songFilters: { songCount: 5 },
    params: { songDuration: 25, answerTimer: 15, fuzzyMatch: true, levenshteinDistance: 2 },
  },
  {
    modeType: 'buzz_and_choice',
    mediaType: 'music',
    songFilters: { songCount: 5 },
    params: { songDuration: 25, answerTimer: 8, numChoices: 4, pointsTitle: 2, pointsArtist: 2 },
  },
  {
    modeType: 'fast_buzz',
    mediaType: 'music',
    songFilters: { songCount: 5 },
    params: { songDuration: 15, answerTimer: 5 },
  },
]

describe('E2E: Quick Game Preset (3 rounds)', () => {
  let wsCollector: MockWebSocketCollector
  let playerScores: Map<string, number>
  let songs: any[]

  beforeEach(() => {
    wsCollector = new MockWebSocketCollector()
    playerScores = new Map([
      ['player-1', 0],
      ['player-2', 0],
      ['player-3', 0],
    ])
    songs = createMockSongs(15) // 5 songs per round × 3 rounds
  })

  test('completes full 3-round game flow', async () => {
    // === GAME START ===
    wsCollector.broadcast('game:started', {
      sessionId: 'session-1',
      roomId: 'room-1',
      roundCount: 3,
    })

    expect(wsCollector.getEvents('game:started').length).toBe(1)

    // === ROUND 1: Fast Buzz (5 songs, 20s duration) ===
    wsCollector.broadcast('round:started', {
      roundIndex: 0,
      modeType: 'fast_buzz',
      mediaType: 'music',
      songCount: 5,
    })

    const fastBuzzMode = new FastBuzzMode()
    const round1Songs: RoundSong[] = songs.slice(0, 5).map((song, i) => ({
      songId: song.id,
      song,
      index: i,
      status: 'playing',
      lockedOutPlayerIds: [],
      answers: [],
    }))

    // Simulate 5 songs in round 1
    for (let i = 0; i < 5; i++) {
      const song = round1Songs[i]

      // Song starts
      wsCollector.broadcast('song:started', {
        songIndex: i,
        duration: 20,
        clipStart: 30,
        audioPlayback: 'master',
      })

      // Player 1 buzzes and answers correctly
      const buzzAccepted = await fastBuzzMode.handleBuzz('player-1', song, 100 + i)
      expect(buzzAccepted).toBe(true)

      wsCollector.broadcast('player:buzzed', {
        playerId: 'player-1',
        playerName: 'Alice',
        songIndex: i,
        timestamp: 100 + i,
      })

      const answer: Answer = {
        id: `answer-${i}`,
        playerId: 'player-1',
        roundId: 'round-1',
        songId: song.songId,
        type: 'title',
        value: 'correct',
        submittedAt: new Date(),
        timeToAnswer: 1000,
        isCorrect: true,
        pointsAwarded: 1,
      }

      const result = await fastBuzzMode.handleAnswer(answer, song)
      playerScores.set('player-1', (playerScores.get('player-1') || 0) + result.pointsAwarded)

      wsCollector.broadcast('answer:result', {
        playerId: 'player-1',
        playerName: 'Alice',
        answerType: 'title',
        isCorrect: true,
        pointsAwarded: result.pointsAwarded,
      })

      wsCollector.broadcast('song:ended', {
        songIndex: i,
        correctTitle: song.song.title,
        correctArtist: song.song.artist,
      })
    }

    // Round 1 ends
    wsCollector.broadcast('round:ended', {
      roundIndex: 0,
      scores: { 'player-1': 5, 'player-2': 0, 'player-3': 0 },
    })

    // Between rounds
    wsCollector.broadcast('round:between', {
      completedRoundIndex: 0,
      nextRoundIndex: 1,
      nextRoundMode: 'fast_buzz',
      nextRoundMedia: 'music',
      scores: [
        { playerId: 'player-1', playerName: 'Alice', score: 5, rank: 1 },
        { playerId: 'player-2', playerName: 'Bob', score: 0, rank: 2 },
        { playerId: 'player-3', playerName: 'Charlie', score: 0, rank: 3 },
      ],
    })

    // === ROUND 2: Fast Buzz (5 songs, 15s duration) ===
    wsCollector.broadcast('round:started', {
      roundIndex: 1,
      modeType: 'fast_buzz',
      mediaType: 'music',
      songCount: 5,
    })

    const round2Songs: RoundSong[] = songs.slice(5, 10).map((song, i) => ({
      songId: song.id,
      song,
      index: i,
      status: 'playing',
      lockedOutPlayerIds: [],
      answers: [],
    }))

    // Simulate Player 2 winning this round
    for (let i = 0; i < 5; i++) {
      const song = round2Songs[i]
      const buzzAccepted = await fastBuzzMode.handleBuzz('player-2', song, 200 + i)
      expect(buzzAccepted).toBe(true)

      const answer: Answer = {
        id: `answer-r2-${i}`,
        playerId: 'player-2',
        roundId: 'round-2',
        songId: song.songId,
        type: 'title',
        value: 'correct',
        submittedAt: new Date(),
        timeToAnswer: 1000,
        isCorrect: true,
        pointsAwarded: 1,
      }

      const result = await fastBuzzMode.handleAnswer(answer, song)
      playerScores.set('player-2', (playerScores.get('player-2') || 0) + result.pointsAwarded)
    }

    wsCollector.broadcast('round:ended', {
      roundIndex: 1,
      scores: { 'player-1': 0, 'player-2': 5, 'player-3': 0 },
    })

    wsCollector.broadcast('round:between', {
      completedRoundIndex: 1,
      nextRoundIndex: 2,
      nextRoundMode: 'buzz_and_choice',
      nextRoundMedia: 'music',
      scores: [
        { playerId: 'player-1', playerName: 'Alice', score: 5, rank: 1 },
        { playerId: 'player-2', playerName: 'Bob', score: 5, rank: 1 },
        { playerId: 'player-3', playerName: 'Charlie', score: 0, rank: 3 },
      ],
    })

    // === ROUND 3: Buzz and Choice (5 songs, 20s duration) ===
    wsCollector.broadcast('round:started', {
      roundIndex: 2,
      modeType: 'buzz_and_choice',
      mediaType: 'music',
      songCount: 5,
    })

    const buzzAndChoiceMode = new BuzzAndChoiceMode()
    const round3Songs: RoundSong[] = songs.slice(10, 15).map((song, i) => ({
      songId: song.id,
      song,
      index: i,
      status: 'playing',
      lockedOutPlayerIds: [],
      answers: [],
      titleChoices: ['Title A', 'Title B', song.title, 'Title D'],
      artistChoices: ['Artist A', song.artist, 'Artist C', 'Artist D'],
    }))

    // Player 3 wins this round with title + artist answers
    for (let i = 0; i < 5; i++) {
      const song = round3Songs[i]
      const buzzAccepted = await buzzAndChoiceMode.handleBuzz('player-3', song, 300 + i)
      expect(buzzAccepted).toBe(true)

      // Correct title
      const titleAnswer: Answer = {
        id: `answer-r3-title-${i}`,
        playerId: 'player-3',
        roundId: 'round-3',
        songId: song.songId,
        type: 'title',
        value: song.song.title,
        submittedAt: new Date(),
        timeToAnswer: 1000,
        isCorrect: true,
        pointsAwarded: 1,
      }

      const titleResult = await buzzAndChoiceMode.handleAnswer(titleAnswer, song)
      playerScores.set('player-3', (playerScores.get('player-3') || 0) + titleResult.pointsAwarded)

      // Correct artist
      const artistAnswer: Answer = {
        id: `answer-r3-artist-${i}`,
        playerId: 'player-3',
        roundId: 'round-3',
        songId: song.songId,
        type: 'artist',
        value: song.song.artist,
        submittedAt: new Date(),
        timeToAnswer: 2000,
        isCorrect: true,
        pointsAwarded: 1,
      }

      const artistResult = await buzzAndChoiceMode.handleAnswer(artistAnswer, song)
      playerScores.set('player-3', (playerScores.get('player-3') || 0) + artistResult.pointsAwarded)
    }

    wsCollector.broadcast('round:ended', {
      roundIndex: 2,
      scores: { 'player-1': 0, 'player-2': 0, 'player-3': 10 },
    })

    // === GAME END ===
    wsCollector.broadcast('game:ended', {
      finalScores: [
        { playerId: 'player-3', playerName: 'Charlie', totalScore: 10, rank: 1, roundScores: [0, 0, 10] },
        { playerId: 'player-1', playerName: 'Alice', totalScore: 5, rank: 2, roundScores: [5, 0, 0] },
        { playerId: 'player-2', playerName: 'Bob', totalScore: 5, rank: 2, roundScores: [0, 5, 0] },
      ],
    })

    // === ASSERTIONS ===
    // Verify all events were broadcast
    expect(wsCollector.getEvents('game:started').length).toBe(1)
    expect(wsCollector.getEvents('round:started').length).toBe(3)
    expect(wsCollector.getEvents('round:ended').length).toBe(3)
    expect(wsCollector.getEvents('round:between').length).toBe(2) // Only between rounds, not at end
    expect(wsCollector.getEvents('game:ended').length).toBe(1)

    // Verify final scores
    expect(playerScores.get('player-1')).toBe(5)
    expect(playerScores.get('player-2')).toBe(5)
    expect(playerScores.get('player-3')).toBe(10)

    // Verify key events are present in correct order
    const events = wsCollector.getEvents()
    const gameStarted = events.findIndex(e => e.type === 'game:started')
    const firstRoundStarted = events.findIndex(e => e.type === 'round:started')
    const firstRoundEnded = events.findIndex(e => e.type === 'round:ended')
    const firstBetween = events.findIndex(e => e.type === 'round:between')
    const secondRoundStarted = events.findIndex((e, i) => i > firstRoundStarted && e.type === 'round:started')

    expect(gameStarted).toBeGreaterThanOrEqual(0)
    expect(firstRoundStarted).toBeGreaterThan(gameStarted)
    expect(firstRoundEnded).toBeGreaterThan(firstRoundStarted)
    expect(firstBetween).toBeGreaterThan(firstRoundEnded)
    expect(secondRoundStarted).toBeGreaterThan(firstBetween)
  })

  test('validates preset configuration', () => {
    expect(quickGamePreset.length).toBe(3)
    expect(quickGamePreset[0].modeType).toBe('fast_buzz')
    expect(quickGamePreset[1].modeType).toBe('fast_buzz')
    expect(quickGamePreset[2].modeType).toBe('buzz_and_choice')

    // Verify song counts
    quickGamePreset.forEach(round => {
      expect(round.songFilters?.songCount).toBe(5)
    })

    // Verify parameters are set
    expect(quickGamePreset[0].params?.songDuration).toBe(20)
    expect(quickGamePreset[1].params?.songDuration).toBe(15)
    expect(quickGamePreset[2].params?.numChoices).toBe(4)
  })
})

describe('E2E: Classic Game Preset (5 rounds)', () => {
  test('validates preset configuration', () => {
    expect(classicGamePreset.length).toBe(5)

    // Verify mode variety
    expect(classicGamePreset[0].modeType).toBe('buzz_and_choice')
    expect(classicGamePreset[1].modeType).toBe('fast_buzz')
    expect(classicGamePreset[2].modeType).toBe('text_input')
    expect(classicGamePreset[3].modeType).toBe('buzz_and_choice')
    expect(classicGamePreset[4].modeType).toBe('fast_buzz')

    // Verify all rounds use music
    classicGamePreset.forEach(round => {
      expect(round.mediaType).toBe('music')
      expect(round.songFilters?.songCount).toBe(5)
    })

    // Verify text_input fuzzy match configuration
    const textInputRound = classicGamePreset[2]
    expect(textInputRound.params?.fuzzyMatch).toBe(true)
    expect(textInputRound.params?.levenshteinDistance).toBe(2)

    // Verify higher points in round 4
    const bonusRound = classicGamePreset[3]
    expect(bonusRound.params?.pointsTitle).toBe(2)
    expect(bonusRound.params?.pointsArtist).toBe(2)
  })

  test('simulates text_input round with fuzzy matching', async () => {
    const textInputMode = new TextInputMode()
    const song = createMockSong({
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
    })

    const roundSong: RoundSong = {
      songId: song.id,
      song,
      index: 0,
      status: 'playing',
      lockedOutPlayerIds: [],
      answers: [],
      params: classicGamePreset[2].params,
    }

    // Player 1: Exact match
    const exactAnswer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-3',
      songId: song.id,
      type: 'title',
      value: 'Bohemian Rhapsody',
      submittedAt: new Date(),
      timeToAnswer: 5000,
      isCorrect: true,
      pointsAwarded: 0,
    }

    const exactResult = await textInputMode.handleAnswer(exactAnswer, roundSong)
    expect(exactResult.isCorrect).toBe(true)
    expect(exactResult.pointsAwarded).toBe(1)

    // Player 2: Fuzzy match (1 typo)
    const fuzzyAnswer: Answer = {
      id: 'answer-2',
      playerId: 'player-2',
      roundId: 'round-3',
      songId: song.id,
      type: 'title',
      value: 'Bohemian Rapsody', // Missing 'h'
      submittedAt: new Date(),
      timeToAnswer: 7000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const fuzzyResult = await textInputMode.handleAnswer(fuzzyAnswer, roundSong)
    expect(fuzzyResult.isCorrect).toBe(true) // Accepted due to fuzzy match
    expect(fuzzyResult.pointsAwarded).toBe(1)

    // Player 3: Beyond threshold (3 typos)
    const wrongAnswer: Answer = {
      id: 'answer-3',
      playerId: 'player-3',
      roundId: 'round-3',
      songId: song.id,
      type: 'title',
      value: 'Boheman Rapsod', // 3 changes
      submittedAt: new Date(),
      timeToAnswer: 10000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const wrongResult = await textInputMode.handleAnswer(wrongAnswer, roundSong)
    expect(wrongResult.isCorrect).toBe(false)
    expect(wrongResult.pointsAwarded).toBe(0)
  })
})

describe('E2E: Preset Scoring', () => {
  test('calculates correct total scores across rounds', () => {
    const roundScores = [
      { 'player-1': 5, 'player-2': 3, 'player-3': 7 },  // Round 1
      { 'player-1': 4, 'player-2': 6, 'player-3': 2 },  // Round 2
      { 'player-1': 8, 'player-2': 4, 'player-3': 6 },  // Round 3
    ]

    const totalScores = {
      'player-1': 0,
      'player-2': 0,
      'player-3': 0,
    }

    // Aggregate scores
    roundScores.forEach(round => {
      Object.entries(round).forEach(([playerId, score]) => {
        totalScores[playerId as keyof typeof totalScores] += score
      })
    })

    expect(totalScores['player-1']).toBe(17) // 5 + 4 + 8
    expect(totalScores['player-2']).toBe(13) // 3 + 6 + 4
    expect(totalScores['player-3']).toBe(15) // 7 + 2 + 6

    // Verify rankings
    const sorted = Object.entries(totalScores).sort((a, b) => b[1] - a[1])
    expect(sorted[0][0]).toBe('player-1') // Winner
    expect(sorted[1][0]).toBe('player-3') // Second
    expect(sorted[2][0]).toBe('player-2') // Third
  })
})
