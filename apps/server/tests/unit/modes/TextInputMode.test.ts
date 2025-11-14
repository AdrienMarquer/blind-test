/**
 * TextInputMode Unit Tests
 *
 * Tests all scenarios from GAME_ROUNDS_TESTING.md:
 * - Levenshtein distance algorithm
 * - Exact matching (case-insensitive)
 * - Fuzzy matching (thresholds 0-3)
 * - No buzzing allowed
 * - Simultaneous answers
 * - Scoring
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { TextInputMode } from '../../../src/modes/TextInputMode'
import type { RoundSong, Answer, Song } from '@blind-test/shared'
import { createMockSong } from '../../helpers/testUtils'

describe('TextInputMode - Levenshtein Distance Algorithm', () => {
  let mode: TextInputMode

  beforeEach(() => {
    mode = new TextInputMode()
  })

  test('calculates distance correctly for known examples', () => {
    // Access private method through any cast for testing
    const modeAny = mode as any

    // Classic example from computer science
    expect(modeAny.levenshteinDistance('kitten', 'sitting')).toBe(3)

    // Single character difference
    expect(modeAny.levenshteinDistance('Queen', 'Quen')).toBe(1)
    expect(modeAny.levenshteinDistance('Queen', 'Quee')).toBe(1)

    // Two character differences
    expect(modeAny.levenshteinDistance('Queen', 'Qen')).toBe(2)

    // Three character differences
    expect(modeAny.levenshteinDistance('Queen', 'Qn')).toBe(3)

    // Identical strings
    expect(modeAny.levenshteinDistance('test', 'test')).toBe(0)

    // Empty strings
    expect(modeAny.levenshteinDistance('', '')).toBe(0)
    expect(modeAny.levenshteinDistance('test', '')).toBe(4)
    expect(modeAny.levenshteinDistance('', 'test')).toBe(4)
  })

  test('handles case sensitivity correctly', () => {
    const modeAny = mode as any

    // Levenshtein is case-sensitive, but validation normalizes to lowercase
    expect(modeAny.levenshteinDistance('QUEEN', 'queen')).toBe(5)
    expect(modeAny.levenshteinDistance('queen', 'queen')).toBe(0)
  })

  test('calculates distance for real song titles', () => {
    const modeAny = mode as any

    // Common typos
    expect(modeAny.levenshteinDistance('bohemian rhapsody', 'bohemian rapsody')).toBe(1)
    expect(modeAny.levenshteinDistance('stairway to heaven', 'stairway to heavan')).toBe(1)
    expect(modeAny.levenshteinDistance('hotel california', 'hotel californa')).toBe(1) // Missing 'i'
  })
})

describe('TextInputMode - Exact Matching', () => {
  let mode: TextInputMode
  let song: Song

  beforeEach(() => {
    mode = new TextInputMode()
    song = createMockSong({
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
    })
  })

  test('accepts exact match case-insensitive', () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'title',
      value: 'bohemian rhapsody',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const isCorrect = mode.validateAnswer(answer, song)
    expect(isCorrect).toBe(true)
  })

  test('accepts exact match with different case', () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'title',
      value: 'BOHEMIAN RHAPSODY',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const isCorrect = mode.validateAnswer(answer, song)
    expect(isCorrect).toBe(true)
  })

  test('accepts exact match with extra whitespace', () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'title',
      value: '  Bohemian Rhapsody  ',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const isCorrect = mode.validateAnswer(answer, song)
    expect(isCorrect).toBe(true)
  })

  test('rejects completely wrong answer', () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'title',
      value: 'Stairway to Heaven',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const isCorrect = mode.validateAnswer(answer, song)
    expect(isCorrect).toBe(false)
  })
})

describe('TextInputMode - Fuzzy Matching with Threshold 2', () => {
  let mode: TextInputMode
  let song: Song

  beforeEach(() => {
    mode = new TextInputMode()
    song = createMockSong({
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
    })
  })

  test('accepts 1 character difference with threshold 2', () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'title',
      value: 'Bohemian Rapsody', // Missing 'h'
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const isCorrect = mode.validateAnswer(answer, song)
    expect(isCorrect).toBe(true)
  })

  test('accepts 2 character difference with threshold 2', () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'title',
      value: 'Bohemian Rapsod', // Missing 'h' and 'y'
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const isCorrect = mode.validateAnswer(answer, song)
    expect(isCorrect).toBe(true)
  })

  test('rejects 3 character difference with threshold 2', () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'title',
      value: 'Boheman Rapsod', // Missing 'i', 'h', 'y' = 3 changes
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const isCorrect = mode.validateAnswer(answer, song)
    expect(isCorrect).toBe(false)
  })

  test('accepts artist with 1 character difference', () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'artist',
      value: 'Quen', // Missing 'e'
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const isCorrect = mode.validateAnswer(answer, song)
    expect(isCorrect).toBe(true)
  })

  test('accepts artist with 2 character difference', () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'artist',
      value: 'Qen', // Missing 'u' and 'e'
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const isCorrect = mode.validateAnswer(answer, song)
    expect(isCorrect).toBe(true)
  })

  test('rejects artist with 3 character difference', () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'artist',
      value: 'Qn', // Missing 'u', 'e', 'e'
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const isCorrect = mode.validateAnswer(answer, song)
    expect(isCorrect).toBe(false)
  })
})

describe('TextInputMode - Fuzzy Matching Disabled', () => {
  let mode: TextInputMode
  let song: Song

  beforeEach(() => {
    mode = new TextInputMode()
    mode.defaultParams.fuzzyMatch = false
    song = createMockSong({
      title: 'Test Song',
      artist: 'Test Artist',
    })
  })

  test('rejects 1 character difference when fuzzy match disabled', () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'title',
      value: 'Test Son', // Missing 'g'
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const isCorrect = mode.validateAnswer(answer, song)
    expect(isCorrect).toBe(false)
  })

  test('accepts exact match when fuzzy match disabled', () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'title',
      value: 'Test Song',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const isCorrect = mode.validateAnswer(answer, song)
    expect(isCorrect).toBe(true)
  })
})

describe('TextInputMode - Different Thresholds', () => {
  let mode: TextInputMode
  let song: Song

  beforeEach(() => {
    mode = new TextInputMode()
    song = createMockSong({
      title: 'Stairway to Heaven',
      artist: 'Led Zeppelin',
    })
  })

  test('threshold 0 - only exact matches', () => {
    mode.defaultParams.levenshteinDistance = 0

    const exact: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'title',
      value: 'Stairway to Heaven',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }
    expect(mode.validateAnswer(exact, song)).toBe(true)

    const oneOff: Answer = {
      ...exact,
      value: 'Stairway to Heave', // Missing 'n'
    }
    expect(mode.validateAnswer(oneOff, song)).toBe(false)
  })

  test('threshold 1 - very strict', () => {
    mode.defaultParams.levenshteinDistance = 1

    const oneOff: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'title',
      value: 'Stairway to Heave', // Missing 'n' (distance 1)
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }
    expect(mode.validateAnswer(oneOff, song)).toBe(true)

    const twoOff: Answer = {
      ...oneOff,
      value: 'Stairway to Heav', // Missing 'e' and 'n' (distance 2)
    }
    expect(mode.validateAnswer(twoOff, song)).toBe(false)
  })

  test('threshold 3 - lenient', () => {
    mode.defaultParams.levenshteinDistance = 3

    const threeOff: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'title',
      value: 'Stairway to Hea', // Missing 'v', 'e', 'n' (distance 3)
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }
    expect(mode.validateAnswer(threeOff, song)).toBe(true)

    const fourOff: Answer = {
      ...threeOff,
      value: 'Stairway to He', // Missing 'a', 'v', 'e', 'n' (distance 4)
    }
    expect(mode.validateAnswer(fourOff, song)).toBe(false)
  })
})

describe('TextInputMode - No Buzzing', () => {
  let mode: TextInputMode
  let song: RoundSong

  beforeEach(() => {
    mode = new TextInputMode()
    song = {
      songId: 'test-song',
      song: createMockSong(),
      index: 0,
      status: 'playing',
      lockedOutPlayerIds: [],
      answers: [],
    }
  })

  test('always rejects buzz attempts', async () => {
    const result = await mode.handleBuzz('player-1', song, 100)
    expect(result).toBe(false)
  })

  test('canBuzz always returns false', () => {
    expect(mode.canBuzz('player-1', song)).toBe(false)
    expect(mode.canBuzz('player-2', song)).toBe(false)
    expect(mode.canBuzz('player-3', song)).toBe(false)
  })

  test('multiple buzz attempts all rejected', async () => {
    const result1 = await mode.handleBuzz('player-1', song, 100)
    const result2 = await mode.handleBuzz('player-2', song, 110)
    const result3 = await mode.handleBuzz('player-3', song, 120)

    expect(result1).toBe(false)
    expect(result2).toBe(false)
    expect(result3).toBe(false)
    expect(song.activePlayerId).toBeUndefined()
  })
})

describe('TextInputMode - Simultaneous Answers', () => {
  let mode: TextInputMode
  let song: RoundSong
  let testSong: Song

  beforeEach(() => {
    mode = new TextInputMode()
    testSong = createMockSong({
      title: 'Test Song',
      artist: 'Test Artist',
    })

    song = {
      songId: testSong.id,
      song: testSong,
      index: 0,
      status: 'playing',
      lockedOutPlayerIds: [],
      answers: [],
    }
  })

  test('allows multiple simultaneous answers', async () => {
    const answer1: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: testSong.id,
      type: 'title',
      value: 'Test Song',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const answer2: Answer = {
      id: 'answer-2',
      playerId: 'player-2',
      roundId: 'round-1',
      songId: testSong.id,
      type: 'title',
      value: 'Test Song',
      submittedAt: new Date(),
      timeToAnswer: 1500,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const result1 = await mode.handleAnswer(answer1, song)
    const result2 = await mode.handleAnswer(answer2, song)

    expect(result1.isCorrect).toBe(true)
    expect(result2.isCorrect).toBe(true)
    expect(result1.lockOutPlayer).toBe(false)
    expect(result2.lockOutPlayer).toBe(false)
  })

  test('no player lockouts ever', async () => {
    const wrongAnswer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: testSong.id,
      type: 'title',
      value: 'Wrong Song',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const result = await mode.handleAnswer(wrongAnswer, song)

    expect(result.lockOutPlayer).toBe(false)
    expect(song.lockedOutPlayerIds.length).toBe(0)
  })
})

describe('TextInputMode - Scoring', () => {
  let mode: TextInputMode
  let song: RoundSong
  let testSong: Song

  beforeEach(() => {
    mode = new TextInputMode()
    testSong = createMockSong({
      title: 'Test Song',
      artist: 'Test Artist',
    })

    song = {
      songId: testSong.id,
      song: testSong,
      index: 0,
      status: 'playing',
      lockedOutPlayerIds: [],
      answers: [],
    }
  })

  test('awards points for correct title', async () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: testSong.id,
      type: 'title',
      value: 'Test Song',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: true, // Set by handleAnswer
      pointsAwarded: 0,
    }

    const result = await mode.handleAnswer(answer, song)

    expect(result.isCorrect).toBe(true)
    expect(result.pointsAwarded).toBe(1)
  })

  test('awards points for correct artist', async () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: testSong.id,
      type: 'artist',
      value: 'Test Artist',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: true,
      pointsAwarded: 0,
    }

    const result = await mode.handleAnswer(answer, song)

    expect(result.isCorrect).toBe(true)
    expect(result.pointsAwarded).toBe(1)
  })

  test('awards no points for incorrect', async () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: testSong.id,
      type: 'title',
      value: 'Wrong Song',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    const result = await mode.handleAnswer(answer, song)

    expect(result.isCorrect).toBe(false)
    expect(result.pointsAwarded).toBe(0)
  })

  test('both title and artist can be answered', async () => {
    const titleAnswer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: testSong.id,
      type: 'title',
      value: 'Test Song',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: true,
      pointsAwarded: 0,
    }

    const artistAnswer: Answer = {
      id: 'answer-2',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: testSong.id,
      type: 'artist',
      value: 'Test Artist',
      submittedAt: new Date(),
      timeToAnswer: 1500,
      isCorrect: true,
      pointsAwarded: 0,
    }

    const titleResult = await mode.handleAnswer(titleAnswer, song)
    const artistResult = await mode.handleAnswer(artistAnswer, song)

    expect(titleResult.pointsAwarded).toBe(1)
    expect(artistResult.pointsAwarded).toBe(1)
    // Total possible: 2 points per song
  })
})

describe('TextInputMode - Song Ending', () => {
  let mode: TextInputMode
  let song: RoundSong

  beforeEach(() => {
    mode = new TextInputMode()
    song = {
      songId: 'test-song',
      song: createMockSong(),
      index: 0,
      status: 'playing',
      lockedOutPlayerIds: [],
      answers: [],
    }
  })

  test('song does not end early (waits for timer)', () => {
    // Even with correct answers, song waits for timer
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

  test('song ends when status is finished', () => {
    song.status = 'finished'

    const shouldEnd = mode.shouldEndSong(song, 3)
    expect(shouldEnd).toBe(true)
  })
})

describe('TextInputMode - Edge Cases', () => {
  let mode: TextInputMode
  let song: Song

  beforeEach(() => {
    mode = new TextInputMode()
    song = createMockSong({
      title: 'A',
      artist: 'B',
    })
  })

  test('handles very short titles', () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'title',
      value: 'A',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    expect(mode.validateAnswer(answer, song)).toBe(true)
  })

  test('handles empty string input', () => {
    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: song.id,
      type: 'title',
      value: '',
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    // Empty strings should never be valid answers
    expect(mode.validateAnswer(answer, song)).toBe(false)
  })

  test('handles special characters', () => {
    const specialSong = createMockSong({
      title: "Don't Stop Believin'",
      artist: 'Journey',
    })

    const answer: Answer = {
      id: 'answer-1',
      playerId: 'player-1',
      roundId: 'round-1',
      songId: specialSong.id,
      type: 'title',
      value: "don't stop believin'",
      submittedAt: new Date(),
      timeToAnswer: 1000,
      isCorrect: false,
      pointsAwarded: 0,
    }

    expect(mode.validateAnswer(answer, specialSong)).toBe(true)
  })
})
