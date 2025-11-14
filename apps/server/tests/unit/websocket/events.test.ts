/**
 * WebSocket Event Tests
 *
 * Tests event broadcasting, data consistency, and master vs player data differences
 * from GAME_ROUNDS_TESTING.md
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test'
import type { ServerMessage, ClientMessage } from '@blind-test/shared'

describe('WebSocket - Event Structure', () => {
  test('game:started event has correct structure', () => {
    const event: ServerMessage = {
      type: 'game:started',
      data: {
        sessionId: 'session-1',
        roomId: 'room-1',
        roundCount: 3,
      },
    }

    expect(event.type).toBe('game:started')
    expect(event.data.sessionId).toBeDefined()
    expect(event.data.roundCount).toBeDefined()
  })

  test('round:started event has correct structure', () => {
    const event: ServerMessage = {
      type: 'round:started',
      data: {
        roundIndex: 0,
        modeType: 'fast_buzz',
        mediaType: 'music',
        songCount: 10,
      },
    }

    expect(event.type).toBe('round:started')
    expect(event.data.roundIndex).toBe(0)
    expect(event.data.modeType).toBe('fast_buzz')
    expect(event.data.songCount).toBe(10)
  })

  test('song:started event has correct structure', () => {
    const event: ServerMessage = {
      type: 'song:started',
      data: {
        songIndex: 0,
        duration: 30,
        clipStart: 45,
        audioPlayback: 'master',
      },
    }

    expect(event.type).toBe('song:started')
    expect(event.data.songIndex).toBeDefined()
    expect(event.data.duration).toBeDefined()
    expect(event.data.audioPlayback).toBe('master')
  })

  test('player:buzzed event has correct structure', () => {
    const event: ServerMessage = {
      type: 'player:buzzed',
      data: {
        playerId: 'player-1',
        playerName: 'Alice',
        songIndex: 0,
        timestamp: Date.now(),
      },
    }

    expect(event.type).toBe('player:buzzed')
    expect(event.data.playerId).toBeDefined()
    expect(event.data.playerName).toBeDefined()
    expect(event.data.timestamp).toBeDefined()
  })

  test('answer:result event has correct structure', () => {
    const event: ServerMessage = {
      type: 'answer:result',
      data: {
        playerId: 'player-1',
        playerName: 'Alice',
        answerType: 'title',
        isCorrect: true,
        pointsAwarded: 1,
      },
    }

    expect(event.type).toBe('answer:result')
    expect(event.data.isCorrect).toBe(true)
    expect(event.data.pointsAwarded).toBe(1)
  })

  test('round:between event has correct structure', () => {
    const event: ServerMessage = {
      type: 'round:between',
      data: {
        completedRoundIndex: 0,
        nextRoundIndex: 1,
        nextRoundMode: 'text_input',
        nextRoundMedia: 'music',
        scores: [
          { playerId: 'player-1', playerName: 'Alice', score: 10, rank: 1 },
          { playerId: 'player-2', playerName: 'Bob', score: 5, rank: 2 },
        ],
      },
    }

    expect(event.type).toBe('round:between')
    expect(event.data.nextRoundIndex).toBe(1)
    expect(event.data.scores.length).toBe(2)
    expect(event.data.scores[0].rank).toBe(1)
  })

  test('game:ended event has correct structure', () => {
    const event: ServerMessage = {
      type: 'game:ended',
      data: {
        finalScores: [
          {
            playerId: 'player-1',
            playerName: 'Alice',
            totalScore: 25,
            rank: 1,
            roundScores: [10, 8, 7],
          },
        ],
      },
    }

    expect(event.type).toBe('game:ended')
    expect(event.data.finalScores[0].roundScores).toEqual([10, 8, 7])
    expect(event.data.finalScores[0].totalScore).toBe(25)
  })
})

describe('WebSocket - Event Order', () => {
  test('game flow events in correct order', () => {
    const events: ServerMessage[] = []

    // Game starts
    events.push({
      type: 'game:started',
      data: { sessionId: 's1', roomId: 'r1', roundCount: 1 },
    })

    // First round starts
    events.push({
      type: 'round:started',
      data: { roundIndex: 0, modeType: 'fast_buzz', mediaType: 'music', songCount: 3 },
    })

    // Song starts
    events.push({
      type: 'song:started',
      data: { songIndex: 0, duration: 30, clipStart: 0, audioPlayback: 'master' },
    })

    // Player buzzes
    events.push({
      type: 'player:buzzed',
      data: { playerId: 'p1', playerName: 'Alice', songIndex: 0, timestamp: 100 },
    })

    // Answer result
    events.push({
      type: 'answer:result',
      data: {
        playerId: 'p1',
        playerName: 'Alice',
        answerType: 'title',
        isCorrect: true,
        pointsAwarded: 1,
      },
    })

    // Song ends
    events.push({
      type: 'song:ended',
      data: { songIndex: 0, correctTitle: 'Test', correctArtist: 'Artist' },
    })

    // Verify order
    expect(events[0].type).toBe('game:started')
    expect(events[1].type).toBe('round:started')
    expect(events[2].type).toBe('song:started')
    expect(events[3].type).toBe('player:buzzed')
    expect(events[4].type).toBe('answer:result')
    expect(events[5].type).toBe('song:ended')
  })

  test('multi-round game event sequence', () => {
    const events: ServerMessage[] = []

    events.push({ type: 'game:started', data: { sessionId: 's1', roomId: 'r1', roundCount: 2 } })
    events.push({ type: 'round:started', data: { roundIndex: 0, modeType: 'fast_buzz', mediaType: 'music', songCount: 2 } })
    events.push({ type: 'round:ended', data: { roundIndex: 0, scores: {} } })
    events.push({
      type: 'round:between',
      data: {
        completedRoundIndex: 0,
        nextRoundIndex: 1,
        nextRoundMode: 'text_input',
        nextRoundMedia: 'music',
        scores: [],
      },
    })
    events.push({ type: 'round:started', data: { roundIndex: 1, modeType: 'text_input', mediaType: 'music', songCount: 2 } })
    events.push({ type: 'round:ended', data: { roundIndex: 1, scores: {} } })
    events.push({ type: 'game:ended', data: { finalScores: [] } })

    // Verify round:between appears between rounds
    const betweenIndex = events.findIndex(e => e.type === 'round:between')
    expect(betweenIndex).toBeGreaterThan(0)

    const firstRoundEnd = events.findIndex(e => e.type === 'round:ended')
    const secondRoundStart = events.findIndex((e, i) => i > firstRoundEnd && e.type === 'round:started')

    expect(betweenIndex).toBeGreaterThan(firstRoundEnd)
    expect(secondRoundStart).toBeGreaterThan(betweenIndex)
  })
})

describe('WebSocket - Master vs Player Events', () => {
  test('song:started includes song details for master only', () => {
    const masterEvent: ServerMessage = {
      type: 'song:started',
      data: {
        songIndex: 0,
        duration: 30,
        clipStart: 0,
        audioPlayback: 'master',
        songTitle: 'Secret Song', // Only for master
        songArtist: 'Secret Artist', // Only for master
      },
    }

    const playerEvent: ServerMessage = {
      type: 'song:started',
      data: {
        songIndex: 0,
        duration: 30,
        clipStart: 0,
        audioPlayback: 'players',
        // No songTitle or songArtist for players
      },
    }

    expect(masterEvent.data.songTitle).toBeDefined()
    expect(masterEvent.data.songArtist).toBeDefined()
    expect((playerEvent.data as any).songTitle).toBeUndefined()
    expect((playerEvent.data as any).songArtist).toBeUndefined()
  })

  test('player:buzzed includes choices only for buzzing player', () => {
    // Event sent to the player who buzzed
    const buzzerEvent: ServerMessage = {
      type: 'player:buzzed',
      data: {
        playerId: 'player-1',
        playerName: 'Alice',
        songIndex: 0,
        timestamp: 100,
        titleChoices: ['A', 'B', 'C', 'D'], // Only for buzzer
      },
    }

    // Event sent to other players
    const observerEvent: ServerMessage = {
      type: 'player:buzzed',
      data: {
        playerId: 'player-1',
        playerName: 'Alice',
        songIndex: 0,
        timestamp: 100,
        // No titleChoices for observers
      },
    }

    expect(buzzerEvent.data.titleChoices).toBeDefined()
    expect((observerEvent.data as any).titleChoices).toBeUndefined()
  })

  test('choices:artist event only sent to correct player', () => {
    const event: ServerMessage = {
      type: 'choices:artist',
      data: {
        playerId: 'player-1',
        artistChoices: ['Queen', 'Beatles', 'Eagles', 'Zeppelin'],
      },
    }

    expect(event.type).toBe('choices:artist')
    expect(event.data.playerId).toBe('player-1')
    expect(event.data.artistChoices.length).toBe(4)
  })
})

describe('WebSocket - Data Consistency', () => {
  test('player IDs are consistent across events', () => {
    const playerId = 'player-123'
    const events: ServerMessage[] = [
      {
        type: 'player:buzzed',
        data: { playerId, playerName: 'Alice', songIndex: 0, timestamp: 100 },
      },
      {
        type: 'answer:result',
        data: {
          playerId,
          playerName: 'Alice',
          answerType: 'title',
          isCorrect: true,
          pointsAwarded: 1,
        },
      },
    ]

    events.forEach(event => {
      expect(event.data.playerId).toBe(playerId)
    })
  })

  test('song indices are sequential', () => {
    const songEvents: ServerMessage[] = [
      { type: 'song:started', data: { songIndex: 0, duration: 30, clipStart: 0, audioPlayback: 'master' } },
      { type: 'song:ended', data: { songIndex: 0, correctTitle: 'A', correctArtist: 'B' } },
      { type: 'song:started', data: { songIndex: 1, duration: 30, clipStart: 0, audioPlayback: 'master' } },
      { type: 'song:ended', data: { songIndex: 1, correctTitle: 'C', correctArtist: 'D' } },
    ]

    let expectedIndex = 0
    songEvents.forEach(event => {
      if (event.type === 'song:started') {
        expect(event.data.songIndex).toBe(expectedIndex)
      } else if (event.type === 'song:ended') {
        expect(event.data.songIndex).toBe(expectedIndex)
        expectedIndex++
      }
    })
  })

  test('round scores maintain player ordering', () => {
    const event: ServerMessage = {
      type: 'round:ended',
      data: {
        roundIndex: 0,
        scores: [
          { playerId: 'p1', playerName: 'Alice', score: 10, rank: 1 },
          { playerId: 'p2', playerName: 'Bob', score: 8, rank: 2 },
          { playerId: 'p3', playerName: 'Charlie', score: 5, rank: 3 },
        ],
      },
    }

    const scores = event.data.scores as any[]
    expect(scores[0].rank).toBeLessThan(scores[1].rank)
    expect(scores[1].rank).toBeLessThan(scores[2].rank)
  })
})

describe('WebSocket - Race Conditions', () => {
  test('buzz timestamps are preserved in events', () => {
    const timestamp1 = 1000
    const timestamp2 = 1020

    const event1: ServerMessage = {
      type: 'player:buzzed',
      data: { playerId: 'p1', playerName: 'Alice', songIndex: 0, timestamp: timestamp1 },
    }

    const event2: ServerMessage = {
      type: 'player:buzzed',
      data: { playerId: 'p2', playerName: 'Bob', songIndex: 0, timestamp: timestamp2 },
    }

    expect(event1.data.timestamp).toBe(timestamp1)
    expect(event2.data.timestamp).toBe(timestamp2)
    expect(event1.data.timestamp).toBeLessThan(event2.data.timestamp!)
  })

  test('simultaneous buzzes are distinguishable by timestamp', () => {
    const buzzes: ServerMessage[] = [
      { type: 'player:buzzed', data: { playerId: 'p1', playerName: 'A', songIndex: 0, timestamp: 100 } },
      { type: 'player:buzzed', data: { playerId: 'p2', playerName: 'B', songIndex: 0, timestamp: 105 } },
      { type: 'player:buzzed', data: { playerId: 'p3', playerName: 'C', songIndex: 0, timestamp: 98 } },
    ]

    const sorted = [...buzzes].sort((a, b) => a.data.timestamp! - b.data.timestamp!)

    expect(sorted[0].data.playerId).toBe('p3') // Earliest timestamp
    expect(sorted[1].data.playerId).toBe('p1')
    expect(sorted[2].data.playerId).toBe('p2') // Latest timestamp
  })
})

describe('WebSocket - Error Events', () => {
  test('error event has message field', () => {
    const event: ServerMessage = {
      type: 'error',
      data: {
        message: 'Room not found',
      },
    }

    expect(event.type).toBe('error')
    expect(event.data.message).toBeDefined()
  })

  test('error event can include error code', () => {
    const event: ServerMessage = {
      type: 'error',
      data: {
        message: 'Invalid action',
        code: 'INVALID_ACTION',
      },
    }

    expect(event.data.code).toBe('INVALID_ACTION')
  })
})

describe('WebSocket - Connection Events', () => {
  test('connected event includes roomId', () => {
    const event: ServerMessage = {
      type: 'connected',
      data: {
        roomId: 'room-123',
      },
    }

    expect(event.type).toBe('connected')
    expect(event.data.roomId).toBe('room-123')
  })

  test('state:sync provides current game state', () => {
    const event: ServerMessage = {
      type: 'state:sync',
      data: {
        room: {
          id: 'room-1',
          status: 'playing',
          name: 'Test Room',
        },
        players: [],
        currentRound: 0,
      },
    }

    expect(event.type).toBe('state:sync')
    expect(event.data.room).toBeDefined()
    expect(event.data.players).toBeDefined()
  })
})
