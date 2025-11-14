/**
 * FastBuzzMode Unit Tests
 *
 * Tests all scenarios from GAME_ROUNDS_TESTING.md:
 * - Buzz racing and timestamps
 * - Manual validation (correct/wrong)
 * - Lockout and penalty
 * - Rebuzz after wrong answer
 * - Song ending conditions
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { FastBuzzMode } from '../../../src/modes/FastBuzzMode'
import type { RoundSong, Answer, Song } from '@blind-test/shared'
import { createMockSong } from '../../helpers/testUtils'

describe('FastBuzzMode - Buzzing', () => {
  let mode: FastBuzzMode
  let song: RoundSong

  beforeEach(() => {
    mode = new FastBuzzMode()
    song = {
      songId: 'test-song',
      song: createMockSong(),
      index: 0,
      status: 'playing',
      lockedOutPlayerIds: [],
      answers: [],
    }
  })

  test('accepts first valid buzz', async () => {
    const result = await mode.handleBuzz('player-1', song, 100)

    expect(result).toBe(true)
    expect(song.activePlayerId).toBe('player-1')
    expect(song.status).toBe('answering')
    expect(song.buzzTimestamps!.get('player-1')).toBe(100)
  })

  test('uses timestamps for race condition', async () => {
    // Player 2 buzzes at T=120ms (arrives first at server)
    const result2 = await mode.handleBuzz('player-2', song, 120)
    expect(result2).toBe(true)
    expect(song.activePlayerId).toBe('player-2')

    // Player 1 buzzes at T=100ms (arrives second at server, but earlier client timestamp)
    const result1 = await mode.handleBuzz('player-1', song, 100)
    expect(result1).toBe(true)
    expect(song.activePlayerId).toBe('player-1') // Player 1 wins with earlier timestamp
  })

  test('rejects buzz from locked out player', async () => {
    song.lockedOutPlayerIds.push('player-1')

    const result = await mode.handleBuzz('player-1', song, 100)

    expect(result).toBe(false)
    expect(song.activePlayerId).toBeUndefined()
  })

  test('rejects buzz when song finished', async () => {
    song.status = 'finished'

    const result = await mode.handleBuzz('player-1', song, 100)

    expect(result).toBe(false)
    expect(song.activePlayerId).toBeUndefined()
  })

  test('allows rebuzz after wrong answer', async () => {
    // Player 1 buzzes
    await mode.handleBuzz('player-1', song, 100)
    expect(song.activePlayerId).toBe('player-1')

    // Player 1 answers wrong
    const wrongAnswer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.songId,
      type: 'title',
      value: 'wrong',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    await mode.handleAnswer(wrongAnswer, song)

    // Song status should return to 'playing' and activePlayerId cleared
    expect(song.status).toBe('playing')
    expect(song.activePlayerId).toBeUndefined()

    // Player 2 can now buzz
    const result2 = await mode.handleBuzz('player-2', song, 200)
    expect(result2).toBe(true)
    expect(song.activePlayerId).toBe('player-2')
  })

  test('stores timestamp when no timestamp provided', async () => {
    const before = Date.now()
    await mode.handleBuzz('player-1', song)
    const after = Date.now()

    const storedTimestamp = song.buzzTimestamps!.get('player-1')!
    expect(storedTimestamp).toBeGreaterThanOrEqual(before)
    expect(storedTimestamp).toBeLessThanOrEqual(after)
  })
})

describe('FastBuzzMode - Manual Validation', () => {
  let mode: FastBuzzMode
  let song: RoundSong

  beforeEach(() => {
    mode = new FastBuzzMode()
    song = {
      songId: 'test-song',
      song: createMockSong({
        title: 'Test Song',
        artist: 'Test Artist',
      }),
      index: 0,
      status: 'answering',
      activePlayerId: 'player-1',
      lockedOutPlayerIds: [],
      answers: [],
    }
  })

  test('accepts master marking as correct', async () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.songId,
      type: 'title',
      value: 'correct',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const result = await mode.handleAnswer(answer, song)

    expect(result.isCorrect).toBe(true)
    expect(result.pointsAwarded).toBe(1)
    expect(result.lockOutPlayer).toBe(false)
    expect(song.status).toBe('finished')
  })

  test('accepts master marking as wrong', async () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.songId,
      type: 'title',
      value: 'wrong',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const result = await mode.handleAnswer(answer, song)

    expect(result.isCorrect).toBe(false)
    expect(result.pointsAwarded).toBe(0)
    expect(result.lockOutPlayer).toBe(true)
    expect(song.status).toBe('playing') // Back to playing for others to buzz
  })

  test('locks out player on wrong answer', async () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.songId,
      type: 'title',
      value: 'wrong',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const result = await mode.handleAnswer(answer, song)

    expect(result.lockOutPlayer).toBe(true)
  })

  test('awards/deducts points based on validation', async () => {
    const correctAnswer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.songId,
      type: 'title',
      value: 'correct',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const correctResult = await mode.handleAnswer(correctAnswer, song)
    expect(correctResult.pointsAwarded).toBe(1)

    // Reset for wrong answer test
    song.status = 'answering'
    song.activePlayerId = 'player-2'

    const wrongAnswer: Answer = {
      id: 'answer-2',
      playerId: 'player-2',
      roundId: 'round-1',
      songId: song.songId,
      type: 'title',
      value: 'wrong',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const wrongResult = await mode.handleAnswer(wrongAnswer, song)
    expect(wrongResult.pointsAwarded).toBe(0)
  })
})

describe('FastBuzzMode - Penalty System', () => {
  let mode: FastBuzzMode
  let song: RoundSong

  beforeEach(() => {
    mode = new FastBuzzMode()
    song = {
      songId: 'test-song',
      song: createMockSong(),
      index: 0,
      status: 'answering',
      activePlayerId: 'player-1',
      lockedOutPlayerIds: [],
      answers: [],
      params: {
        ...mode.defaultParams,
        penaltyEnabled: true,
        penaltyAmount: 1,
      },
    }
  })

  test('applies penalty when enabled and answer wrong', async () => {
    const wrongAnswer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.songId,
      type: 'title',
      value: 'wrong',
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
    song.params = {
      ...mode.defaultParams,
      penaltyEnabled: false,
    }

    const wrongAnswer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.songId,
      type: 'title',
      value: 'wrong',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const result = await mode.handleAnswer(wrongAnswer, song)

    expect(result.pointsAwarded).toBe(0)
    expect(result.lockOutPlayer).toBe(true)
  })

  test('custom penalty amount', async () => {
    song.params = {
      ...mode.defaultParams,
      penaltyEnabled: true,
      penaltyAmount: 2,
    }

    const wrongAnswer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.songId,
      type: 'title',
      value: 'wrong',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const result = await mode.handleAnswer(wrongAnswer, song)

    expect(result.pointsAwarded).toBe(-2)
  })
})

describe('FastBuzzMode - Song Ending', () => {
  let mode: FastBuzzMode
  let song: RoundSong

  beforeEach(() => {
    mode = new FastBuzzMode()
    song = {
      songId: 'test-song',
      song: createMockSong(),
      index: 0,
      status: 'playing',
      lockedOutPlayerIds: [],
      answers: [],
    }
  })

  test('ends song on correct answer', async () => {
    song.status = 'answering'
    song.activePlayerId = 'player-1'

    const correctAnswer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.songId,
      type: 'title',
      value: 'correct',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    await mode.handleAnswer(correctAnswer, song)

    expect(song.status).toBe('finished')
    expect(mode.shouldEndSong(song, 3)).toBe(true)
  })

  test('ends song when all locked out', () => {
    song.lockedOutPlayerIds = ['player-1', 'player-2', 'player-3']
    const activePlayerCount = 3

    const shouldEnd = mode.shouldEndSong(song, activePlayerCount)

    expect(shouldEnd).toBe(true)
  })

  test('continues with remaining players', () => {
    song.lockedOutPlayerIds = ['player-1', 'player-2']
    const activePlayerCount = 3

    const shouldEnd = mode.shouldEndSong(song, activePlayerCount)

    expect(shouldEnd).toBe(false)
  })

  test('ends when status is finished', () => {
    song.status = 'finished'

    const shouldEnd = mode.shouldEndSong(song, 3)

    expect(shouldEnd).toBe(true)
  })
})

describe('FastBuzzMode - Multiple Buzz Attempts', () => {
  let mode: FastBuzzMode
  let song: RoundSong

  beforeEach(() => {
    mode = new FastBuzzMode()
    song = {
      songId: 'test-song',
      song: createMockSong(),
      index: 0,
      status: 'playing',
      lockedOutPlayerIds: [],
      answers: [],
    }
  })

  test('multiple buzz attempts with lockouts', async () => {
    // Player 1 buzzes
    await mode.handleBuzz('player-1', song, 100)
    expect(song.activePlayerId).toBe('player-1')

    // Player 1 answers wrong
    const wrong1: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.songId,
      type: 'title',
      value: 'wrong',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }
    const result1 = await mode.handleAnswer(wrong1, song)
    expect(result1.lockOutPlayer).toBe(true)
    // Game service would add to lockedOutPlayerIds - simulate that
    song.lockedOutPlayerIds.push('player-1')

    // Player 2 buzzes
    await mode.handleBuzz('player-2', song, 200)
    expect(song.activePlayerId).toBe('player-2')

    // Player 2 answers wrong
    const wrong2: Answer = {
      id: 'answer-2',
      playerId: 'player-2',
      roundId: 'round-1',
      songId: song.songId,
      type: 'title',
      value: 'wrong',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }
    const result2 = await mode.handleAnswer(wrong2, song)
    expect(result2.lockOutPlayer).toBe(true)
    // Game service would add to lockedOutPlayerIds - simulate that
    song.lockedOutPlayerIds.push('player-2')

    // Player 3 buzzes and gets correct
    await mode.handleBuzz('player-3', song, 300)
    expect(song.activePlayerId).toBe('player-3')

    const correct3: Answer = {
      id: 'answer-3',
      playerId: 'player-3',
      roundId: 'round-1',
      songId: song.songId,
      type: 'title',
      value: 'correct',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }
    const result3 = await mode.handleAnswer(correct3, song)

    expect(result3.isCorrect).toBe(true)
    expect(song.status).toBe('finished')
  })

  test('song continues after wrong answer until timeout or correct answer', async () => {
    // Player 1 buzzes and answers wrong
    await mode.handleBuzz('player-1', song, 100)
    const wrong1: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.songId,
      type: 'title',
      value: 'wrong',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }
    await mode.handleAnswer(wrong1, song)

    // Song should continue (status = playing)
    expect(song.status).toBe('playing')
    expect(mode.shouldEndSong(song, 3)).toBe(false)

    // Player 2 can now buzz
    const canPlayer2Buzz = mode.canBuzz('player-2', song)
    expect(canPlayer2Buzz).toBe(true)
  })
})

describe('FastBuzzMode - Scoring', () => {
  let mode: FastBuzzMode
  let song: Song

  beforeEach(() => {
    mode = new FastBuzzMode()
    song = createMockSong({
      title: 'Test Song',
      artist: 'Test Artist',
    })
  })

  test('calculates score for correct answer', () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'title',
      value: 'correct',
      isCorrect: true,
      pointsAwarded: 0,
      submittedAt: new Date(),
      timeToAnswer: 1000,
    }

    const score = mode.calculateScore(answer, song, mode.defaultParams)
    expect(score).toBe(1)
  })

  test('calculates score for wrong answer without penalty', () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'title',
      value: 'wrong',
      isCorrect: false,
      pointsAwarded: 0,
      submittedAt: new Date(),
      timeToAnswer: 1000,
    }

    const score = mode.calculateScore(answer, song, {
      ...mode.defaultParams,
      penaltyEnabled: false,
    })
    expect(score).toBe(0)
  })

  test('calculates score for wrong answer with penalty', () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'title',
      value: 'wrong',
      isCorrect: false,
      pointsAwarded: 0,
      submittedAt: new Date(),
      timeToAnswer: 1000,
    }

    const score = mode.calculateScore(answer, song, {
      ...mode.defaultParams,
      penaltyEnabled: true,
      penaltyAmount: 1,
    })
    expect(score).toBe(-1)
  })
})
