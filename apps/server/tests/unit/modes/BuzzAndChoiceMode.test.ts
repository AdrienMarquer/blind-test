/**
 * BuzzAndChoiceMode Unit Tests
 *
 * Tests all scenarios from GAME_ROUNDS_TESTING.md:
 * - Choice generation (4 options, shuffling, insufficient songs)
 * - Buzz racing with timestamps
 * - Sequential title → artist flow
 * - Lockout mechanics
 * - Penalty system
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { BuzzAndChoiceMode } from '../../../src/modes/BuzzAndChoiceMode'
import { AnswerGenerationService } from '../../../src/services/AnswerGenerationService'
import type { RoundSong, Answer, Song, Round } from '@blind-test/shared'
import { createMockSong, createMockRound, createMockSongs, createMockBuzz, MockSongRepository } from '../../helpers/testUtils'

describe('BuzzAndChoiceMode - Choice Generation', () => {
  let mode: BuzzAndChoiceMode
  let song: RoundSong
  let allSongs: Song[]
  let mockRepo: MockSongRepository

  beforeEach(() => {
    // Create diverse mock songs with different titles and artists
    allSongs = [
      createMockSong({ id: 'song-0', title: 'Bohemian Rhapsody', artist: 'Queen', year: 1975, genre: 'rock' }),
      createMockSong({ id: 'song-1', title: 'Stairway to Heaven', artist: 'Led Zeppelin', year: 1971, genre: 'rock' }),
      createMockSong({ id: 'song-2', title: 'Hotel California', artist: 'Eagles', year: 1976, genre: 'rock' }),
      createMockSong({ id: 'song-3', title: 'Imagine', artist: 'John Lennon', year: 1971, genre: 'pop' }),
      createMockSong({ id: 'song-4', title: 'Smells Like Teen Spirit', artist: 'Nirvana', year: 1991, genre: 'grunge' }),
      createMockSong({ id: 'song-5', title: 'Billie Jean', artist: 'Michael Jackson', year: 1982, genre: 'pop' }),
      createMockSong({ id: 'song-6', title: 'Sweet Child O Mine', artist: 'Guns N Roses', year: 1987, genre: 'rock' }),
      createMockSong({ id: 'song-7', title: 'Wonderwall', artist: 'Oasis', year: 1995, genre: 'rock' }),
      createMockSong({ id: 'song-8', title: 'Lose Yourself', artist: 'Eminem', year: 2002, genre: 'hip-hop' }),
      createMockSong({ id: 'song-9', title: 'Shape of You', artist: 'Ed Sheeran', year: 2017, genre: 'pop' }),
    ]

    // Create mock repository with test songs
    mockRepo = new MockSongRepository(allSongs)

    // Create AnswerGenerationService with mock repository
    const answerService = new AnswerGenerationService(mockRepo)

    // Create mode with injected service
    mode = new BuzzAndChoiceMode(answerService)

    song = {
      songId: allSongs[0].id,
      song: allSongs[0],
      index: 0,
      status: 'playing',
      lockedOutPlayerIds: [],
      answers: [],
      params: mode.defaultParams,
    }
  })

  test('generates title question with 4 choices including correct answer', async () => {
    await mode.startSong(song, allSongs, 'music')

    expect(song.titleQuestion).toBeDefined()
    expect(song.titleQuestion!.type).toBe('music')
    expect(song.titleQuestion!.phase).toBe('title')
    expect(song.titleQuestion!.choices.length).toBe(4)

    // Check correct answer is in choices
    const correctChoice = song.titleQuestion!.choices.find(c => c.correct)
    expect(correctChoice).toBeDefined()
    expect(correctChoice!.displayText).toBe(allSongs[0].title)

    // Check all choices are unique
    const uniqueChoices = new Set(song.titleQuestion!.choices.map(c => c.displayText))
    expect(uniqueChoices.size).toBe(4)
  })

  test('generates artist question with 4 choices including correct answer', async () => {
    await mode.startSong(song, allSongs, 'music')

    expect(song.artistQuestion).toBeDefined()
    expect(song.artistQuestion!.type).toBe('music')
    expect(song.artistQuestion!.phase).toBe('artist')
    expect(song.artistQuestion!.choices.length).toBe(4)

    // Check correct answer is in choices
    const correctChoice = song.artistQuestion!.choices.find(c => c.correct)
    expect(correctChoice).toBeDefined()
    expect(correctChoice!.displayText).toBe(allSongs[0].artist)

    // Check all choices are unique
    const uniqueChoices = new Set(song.artistQuestion!.choices.map(c => c.displayText))
    expect(uniqueChoices.size).toBe(4)
  })

  test('shuffles choices randomly', async () => {
    // Run multiple times and check that order varies
    const titleOrders: string[] = []

    for (let i = 0; i < 5; i++) {
      const testSong = {
        ...song,
        songId: `song-${i}`,
      }
      await mode.startSong(testSong, allSongs, 'music')
      titleOrders.push(testSong.titleQuestion!.choices.map(c => c.displayText).join(','))
    }

    // At least one order should be different (shuffling happened)
    const uniqueOrders = new Set(titleOrders)
    expect(uniqueOrders.size).toBeGreaterThan(1)
  })

  test('handles insufficient songs for unique choices', async () => {
    // Only 3 songs total (need 4 for unique choices)
    const fewSongs = [
      createMockSong({ id: 'song-a', title: 'Song A', artist: 'Artist A', year: 2020, genre: 'pop' }),
      createMockSong({ id: 'song-b', title: 'Song B', artist: 'Artist B', year: 2021, genre: 'rock' }),
      createMockSong({ id: 'song-c', title: 'Song C', artist: 'Artist C', year: 2022, genre: 'jazz' }),
    ]

    // Create new mock repo with only 3 songs
    const smallRepo = new MockSongRepository(fewSongs)
    const smallAnswerService = new AnswerGenerationService(smallRepo)
    const smallMode = new BuzzAndChoiceMode(smallAnswerService)

    const testSong = {
      ...song,
      songId: fewSongs[0].id,
      song: fewSongs[0],
    }

    await smallMode.startSong(testSong, fewSongs, 'music')

    // With only 3 songs, service will use fallback to generate 4 choices
    // Emergency fallback ensures we always have 4 choices
    expect(testSong.titleQuestion!.choices.length).toBe(4)
    expect(testSong.artistQuestion!.choices.length).toBe(4)
    const titleTexts = testSong.titleQuestion!.choices.map(c => c.displayText)
    const artistTexts = testSong.artistQuestion!.choices.map(c => c.displayText)
    expect(titleTexts).toContain(fewSongs[0].title)
    expect(artistTexts).toContain(fewSongs[0].artist)
  })
})

describe('BuzzAndChoiceMode - Buzzing', () => {
  let mode: BuzzAndChoiceMode
  let song: RoundSong

  beforeEach(() => {
    mode = new BuzzAndChoiceMode()
    song = {
      songId: 'test-song',
      song: createMockSong(),
      index: 0,
      status: 'playing',
      lockedOutPlayerIds: [],
      answers: [],
      titleQuestion: {
        type: 'music',
        phase: 'title',
        choices: [
          { id: '1', correct: false, displayText: 'Title 1' },
          { id: '2', correct: false, displayText: 'Title 2' },
          { id: '3', correct: false, displayText: 'Title 3' },
          { id: '4', correct: true, displayText: 'Title 4' },
        ],
      },
      artistQuestion: {
        type: 'music',
        phase: 'artist',
        choices: [
          { id: '1', correct: false, displayText: 'Artist 1' },
          { id: '2', correct: false, displayText: 'Artist 2' },
          { id: '3', correct: false, displayText: 'Artist 3' },
          { id: '4', correct: true, displayText: 'Artist 4' },
        ],
      },
    }
  })

  test('accepts first buzz', async () => {
    const result = await mode.handleBuzz('player-1', song, 100)

    expect(result).toBe(true)
    expect(song.activePlayerId).toBe('player-1')
    expect(song.status).toBe('answering')
  })

  test('rejects buzz from locked out player', async () => {
    song.lockedOutPlayerIds.push('player-1')

    const result = await mode.handleBuzz('player-1', song, 100)

    expect(result).toBe(false)
    expect(song.activePlayerId).toBeUndefined()
  })

  test('handles race condition with timestamps', async () => {
    // Player 1 buzzes at T=100ms (arrives at server T=150ms)
    // Player 2 buzzes at T=120ms (arrives at server T=130ms)
    // Player 1 should win despite arriving later

    // Player 2 arrives first
    const result2 = await mode.handleBuzz('player-2', song, 120)
    expect(result2).toBe(true)
    expect(song.activePlayerId).toBe('player-2')

    // Reset for race condition test
    song.activePlayerId = undefined
    song.status = 'playing'
    song.buzzTimestamps = new Map()

    // Simulate simultaneous buzzes
    song.buzzTimestamps.set('player-2', 120)
    const result1 = await mode.handleBuzz('player-1', song, 100)

    // Player 1 should win (earlier timestamp)
    expect(result1).toBe(true)
    expect(song.activePlayerId).toBe('player-1')
  })

  test('rejects buzz when another player is answering', async () => {
    song.activePlayerId = 'player-1'
    song.status = 'answering'

    const result = await mode.handleBuzz('player-2', song, 100)

    expect(result).toBe(false)
    expect(song.activePlayerId).toBe('player-1') // Unchanged
  })

  test('rejects buzz when song not playing', async () => {
    song.status = 'finished'

    const result = await mode.handleBuzz('player-1', song, 100)

    expect(result).toBe(false)
    expect(song.activePlayerId).toBeUndefined()
  })
})

describe('BuzzAndChoiceMode - Answer Validation', () => {
  let mode: BuzzAndChoiceMode
  let song: RoundSong
  let testSong: Song

  beforeEach(() => {
    mode = new BuzzAndChoiceMode()
    testSong = createMockSong({
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
    })

    song = {
      songId: testSong.id,
      song: testSong,
      index: 0,
      status: 'answering',
      activePlayerId: 'player-1',
      lockedOutPlayerIds: [],
      answers: [],
      titleQuestion: {
        type: 'music',
        phase: 'title',
        choices: [
          { id: '1', correct: true, displayText: 'Bohemian Rhapsody' },
          { id: '2', correct: false, displayText: 'Stairway to Heaven' },
          { id: '3', correct: false, displayText: 'Hotel California' },
          { id: '4', correct: false, displayText: 'Imagine' },
        ],
      },
      artistQuestion: {
        type: 'music',
        phase: 'artist',
        choices: [
          { id: '1', correct: true, displayText: 'Queen' },
          { id: '2', correct: false, displayText: 'Led Zeppelin' },
          { id: '3', correct: false, displayText: 'Eagles' },
          { id: '4', correct: false, displayText: 'Beatles' },
        ],
      },
    }
  })

  test('validates correct title choice', async () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: testSong.id,
      type: 'title',
      value: 'Bohemian Rhapsody',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const result = await mode.handleAnswer(answer, song)

    expect(result.isCorrect).toBe(true)
    expect(result.pointsAwarded).toBe(1)
    expect(result.shouldShowArtistChoices).toBe(true)
    expect(result.lockOutPlayer).toBe(false)
  })

  test('validates incorrect title choice', async () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: testSong.id,
      type: 'title',
      value: 'Stairway to Heaven',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const result = await mode.handleAnswer(answer, song)

    expect(result.isCorrect).toBe(false)
    expect(result.pointsAwarded).toBe(0)
    expect(result.shouldShowArtistChoices).toBe(false)
    expect(result.lockOutPlayer).toBe(true)
  })

  test('shows artist choices after correct title', async () => {
    const titleAnswer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: testSong.id,
      type: 'title',
      value: 'Bohemian Rhapsody',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const result = await mode.handleAnswer(titleAnswer, song)

    expect(result.shouldShowArtistChoices).toBe(true)
  })

  test('validates correct artist choice', async () => {
    const answer: Answer = {
      id: 'answer-2',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: testSong.id,
      type: 'artist',
      value: 'Queen',
      submittedAt: new Date(),
      timeToAnswer: 2000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const result = await mode.handleAnswer(answer, song)

    expect(result.isCorrect).toBe(true)
    expect(result.pointsAwarded).toBe(1)
    expect(result.shouldShowArtistChoices).toBe(false)
    expect(result.lockOutPlayer).toBe(false)
  })

  test('validates incorrect artist choice', async () => {
    const answer: Answer = {
      id: 'answer-2',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: testSong.id,
      type: 'artist',
      value: 'Led Zeppelin',
      submittedAt: new Date(),
      timeToAnswer: 2000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const result = await mode.handleAnswer(answer, song)

    expect(result.isCorrect).toBe(false)
    expect(result.pointsAwarded).toBe(0)
    expect(result.lockOutPlayer).toBe(true)
  })

  test('answers are case-insensitive', () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: testSong.id,
      type: 'title',
      value: 'bohemian rhapsody',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const isCorrect = mode.validateAnswer(answer, testSong)
    expect(isCorrect).toBe(true)
  })
})

describe('BuzzAndChoiceMode - Scoring', () => {
  let mode: BuzzAndChoiceMode
  let song: RoundSong

  beforeEach(() => {
    mode = new BuzzAndChoiceMode()
    const testSong = createMockSong({
      title: 'Test Song',
      artist: 'Test Artist',
    })

    song = {
      songId: testSong.id,
      song: testSong,
      index: 0,
      status: 'answering',
      activePlayerId: 'player-1',
      lockedOutPlayerIds: [],
      answers: [],
    }
  })

  test('awards points correctly for title and artist', async () => {
    const titleAnswer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.songId,
      type: 'title',
      value: 'Test Song',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const titleResult = await mode.handleAnswer(titleAnswer, song)
    expect(titleResult.pointsAwarded).toBe(1)

    const artistAnswer: Answer = {
      id: 'answer-2',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.songId,
      type: 'artist',
      value: 'Test Artist',
      submittedAt: new Date(),
      timeToAnswer: 2000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const artistResult = await mode.handleAnswer(artistAnswer, song)
    expect(artistResult.pointsAwarded).toBe(1)
  })

  test('applies penalty when enabled', async () => {
    mode.defaultParams.penaltyEnabled = true
    mode.defaultParams.penaltyAmount = -1

    const wrongAnswer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.songId,
      type: 'title',
      value: 'Wrong Title',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const result = await mode.handleAnswer(wrongAnswer, song)
    expect(result.pointsAwarded).toBe(-1)
    expect(result.lockOutPlayer).toBe(true)
  })

  test('no penalty when disabled', async () => {
    mode.defaultParams.penaltyEnabled = false

    const wrongAnswer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.songId,
      type: 'title',
      value: 'Wrong Title',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const result = await mode.handleAnswer(wrongAnswer, song)
    expect(result.pointsAwarded).toBe(0)
  })
})

describe('BuzzAndChoiceMode - Lockout Mechanics', () => {
  let mode: BuzzAndChoiceMode
  let song: RoundSong

  beforeEach(() => {
    mode = new BuzzAndChoiceMode()
    song = {
      songId: 'test-song',
      song: createMockSong(),
      index: 0,
      status: 'playing',
      lockedOutPlayerIds: [],
      answers: [],
    }
  })

  test('locks out player after wrong title', async () => {
    const wrongAnswer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.songId,
      type: 'title',
      value: 'Wrong Title',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const result = await mode.handleAnswer(wrongAnswer, song)
    expect(result.lockOutPlayer).toBe(true)
  })

  test('allows others to buzz after lockout', async () => {
    song.lockedOutPlayerIds.push('player-1')

    const canPlayer1Buzz = mode.canBuzz('player-1', song)
    const canPlayer2Buzz = mode.canBuzz('player-2', song)

    expect(canPlayer1Buzz).toBe(false)
    expect(canPlayer2Buzz).toBe(true)
  })
})

describe('BuzzAndChoiceMode - Song Ending', () => {
  let mode: BuzzAndChoiceMode
  let song: RoundSong

  beforeEach(() => {
    mode = new BuzzAndChoiceMode()
    const testSong = createMockSong()
    song = {
      songId: testSong.id,
      song: testSong,
      index: 0,
      status: 'playing',
      lockedOutPlayerIds: [],
      answers: [],
    }
  })

  test('ends song when both title and artist correct', () => {
    song.answers = [
      {
        id: 'answer-1',
        playerId: 'player-1',
        roundId: 'round-1',
        songId: song.songId,
        type: 'title',
        value: 'correct',
        isCorrect: true,
        pointsAwarded: 1,
        submittedAt: new Date(),
        timeToAnswer: 1000,
      },
      {
        id: 'answer-2',
        playerId: 'player-1',
        roundId: 'round-1',
        songId: song.songId,
        type: 'artist',
        value: 'correct',
        isCorrect: true,
        pointsAwarded: 1,
        submittedAt: new Date(),
        timeToAnswer: 2000,
      },
    ]

    const shouldEnd = mode.shouldEndSong(song, 3)
    expect(shouldEnd).toBe(true)
  })

  test('continues song with only title correct', () => {
    song.answers = [
      {
        id: 'answer-1',
        playerId: 'player-1',
        roundId: 'round-1',
        songId: song.songId,
        type: 'title',
        value: 'correct',
        isCorrect: true,
        pointsAwarded: 1,
        submittedAt: new Date(),
        timeToAnswer: 1000,
      },
    ]

    const shouldEnd = mode.shouldEndSong(song, 3)
    expect(shouldEnd).toBe(false)
  })

  test('ends song when all players locked out', () => {
    song.lockedOutPlayerIds = ['player-1', 'player-2', 'player-3']
    const activePlayerCount = 3

    const shouldEnd = mode.shouldEndSong(song, activePlayerCount)
    expect(shouldEnd).toBe(true)
  })

  test('continues song with remaining players', () => {
    song.lockedOutPlayerIds = ['player-1', 'player-2']
    const activePlayerCount = 3

    const shouldEnd = mode.shouldEndSong(song, activePlayerCount)
    expect(shouldEnd).toBe(false)
  })

  test('ends song when status is finished', () => {
    song.status = 'finished'

    const shouldEnd = mode.shouldEndSong(song, 3)
    expect(shouldEnd).toBe(true)
  })
})
