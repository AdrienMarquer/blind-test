# Game Rounds System - Testing Guide

This document describes the multi-round game system architecture for backend developers implementing unit and end-to-end tests.

## Overview

The blind test application supports **multi-round games** where each round can have a different game mode and media type. Games are configured with an array of rounds, and the system manages progression through rounds with transition states.

## Game Architecture

### Core Concepts

1. **Game Session**: A complete game instance containing multiple rounds
2. **Round**: A single game segment with a specific mode, media type, and song selection
3. **Round Progression**: Automatic or manual advancement through rounds
4. **Between-Rounds State**: Transition period showing scores and next round preview

### Key Components

- **GameService** (`apps/server/src/services/GameService.ts`): Orchestrates game flow
- **GameStateManager** (`apps/server/src/services/GameStateManager.ts`): Manages in-memory game state
- **Mode Handlers** (`apps/server/src/modes/`): Implement game mode logic
- **Round Repository** (PostgreSQL): Persists round configurations

## Game Modes

### 1. Buzz and Choice Mode (`buzz_and_choice`)

**Flow:**
1. Song plays
2. Players buzz to answer
3. First player to buzz gets 4 multiple choice options for title
4. If title is correct, player gets 4 multiple choice options for artist
5. Points awarded for each correct answer

**Implementation:** `apps/server/src/modes/BuzzAndChoiceMode.ts`

**Key Methods:**
- `startSong()`: Generates 4 title choices and 4 artist choices from available songs
- `handleBuzz()`: Manages buzz racing with timestamps, returns true if buzz accepted
- `handleAnswer()`: Validates answer against choices, determines if artist choices should show
- `canBuzz()`: Checks if player can buzz (not locked out, song is playing)
- `shouldEndSong()`: Returns true when correct answer found or all players locked out

**Parameters:**
```typescript
{
  songDuration: 30,      // Seconds to play song clip
  answerTimer: 10,       // Seconds to answer after buzzing
  pointsTitle: 1,        // Points for correct title
  pointsArtist: 1,       // Points for correct artist
  numChoices: 4,         // Number of multiple choice options
  penaltyEnabled: false, // Enable point penalties for wrong answers
  penaltyAmount: 0       // Points to deduct for wrong answer
}
```

**Test Scenarios:**
- Multiple players buzz simultaneously (race condition)
- Player answers title correctly, then artist correctly
- Player answers title correctly, then artist incorrectly
- Player answers title incorrectly (gets locked out)
- All players locked out (song should end)
- Choice generation with insufficient songs (needs at least 4 songs total)

### 2. Fast Buzz Mode (`fast_buzz`)

**Flow:**
1. Song plays
2. Players buzz at any time
3. First player to buzz answers verbally
4. Master validates answer manually (marks as correct/wrong)
5. If wrong, player is locked out and others can buzz
6. If correct, points awarded and song ends

**Implementation:** `apps/server/src/modes/FastBuzzMode.ts`

**Key Methods:**
- `handleBuzz()`: First to buzz gets to answer, includes timestamp racing
- `handleAnswer()`: Master validation - `answer.value === 'correct'`
- `canBuzz()`: Players can buzz if not locked out
- `shouldEndSong()`: Ends when someone answers correctly or all locked out

**Parameters:**
```typescript
{
  songDuration: 20,
  answerTimer: 5,
  pointsTitle: 1,          // Points awarded for correct answer
  manualValidation: true,
  penaltyEnabled: false,
  penaltyAmount: 0
}
```

**Test Scenarios:**
- Player buzzes and master marks correct
- Player buzzes and master marks wrong (lockout + penalty if enabled)
- Multiple buzz attempts with lockouts
- Race condition with multiple simultaneous buzzes
- Song continues after wrong answer until timeout or correct answer

### 3. Text Input Mode (`text_input`)

**Flow:**
1. Song plays
2. Players type their answers for title and/or artist
3. System validates using fuzzy matching (Levenshtein distance)
4. Points awarded for each correct field
5. No buzzing or lockouts

**Implementation:** `apps/server/src/modes/TextInputMode.ts`

**Key Methods:**
- `handleBuzz()`: Always returns false (no buzzing)
- `handleAnswer()`: Validates with fuzzy matching, calculates score
- `validateAnswer()`: Uses Levenshtein distance algorithm for typo tolerance
- `matchStrings()`: Exact or fuzzy string matching
- `levenshteinDistance()`: Calculates edit distance between strings

**Parameters:**
```typescript
{
  songDuration: 25,
  answerTimer: 15,
  pointsTitle: 1,
  pointsArtist: 1,
  fuzzyMatch: true,           // Enable fuzzy matching
  levenshteinDistance: 2      // Max character differences allowed
}
```

**Fuzzy Matching Algorithm:**
The system uses the Levenshtein distance algorithm to calculate the minimum number of single-character edits (insertions, deletions, substitutions) needed to change one string into another. With `levenshteinDistance: 2`, answers within 2 character differences are accepted.

**Test Scenarios:**
- Exact match (case-insensitive): "Bohemian Rhapsody" → "bohemian rhapsody" ✓
- Fuzzy match within threshold: "Bohemian Rhapsody" → "Bohemian Rapsody" ✓ (1 char)
- Fuzzy match within threshold: "Queen" → "Quen" ✓ (1 char)
- Beyond threshold: "Bohemian Rhapsody" → "Boheman Rapsody" ✗ (3 chars)
- Title correct, artist wrong
- Both title and artist correct
- No buzzing allowed (all buzz attempts return false)
- Multiple players can answer simultaneously

## Round Configuration System

### Starting a Game

**Endpoint:** `POST /api/game/:roomId/start`

**Request Body:**
```typescript
{
  rounds: [
    {
      modeType: 'buzz_and_choice',
      mediaType: 'music',
      songFilters?: {
        genre?: string | string[],     // Filter by genre(s)
        yearMin?: number,               // Minimum year
        yearMax?: number,               // Maximum year
        artistName?: string,            // Filter by artist
        songCount?: number,             // Number of songs (default: 10)
        songIds?: string[]              // Specific song IDs
      },
      params?: {
        // Override mode defaults
        songDuration?: number,
        answerTimer?: number,
        // ... other mode-specific params
      }
    },
    // ... more rounds
  ]
}
```

**Validation:**
- At least one round required
- Each round must have valid `modeType` and `mediaType`
- If `songFilters` provided, must return at least 1 song
- `songCount` must be between 1 and 100

**Response:**
```typescript
{
  sessionId: string,
  roomId: string,
  status: 'playing',
  roundCount: number,
  message: string
}
```

### Game Presets

Two built-in presets are hardcoded in the client (`apps/client/src/lib/presets.ts`):

#### Quick Game (3 rounds, 10-15 minutes)
```typescript
[
  {
    modeType: 'fast_buzz',
    mediaType: 'music',
    songFilters: { songCount: 5 },
    params: { songDuration: 20, answerTimer: 5 }
  },
  {
    modeType: 'buzz_and_choice',
    mediaType: 'picture',
    songFilters: { songCount: 7 },
    params: { songDuration: 10, answerTimer: 15 }
  },
  {
    modeType: 'text_input',
    mediaType: 'music',
    songFilters: { songCount: 5 },
    params: { songDuration: 25, answerTimer: 15 }
  }
]
```

#### Classic Game (5 rounds, 25-30 minutes)
```typescript
[
  {
    modeType: 'fast_buzz',
    mediaType: 'music',
    songFilters: { songCount: 10 },
    params: { songDuration: 20, answerTimer: 5 }
  },
  {
    modeType: 'buzz_and_choice',
    mediaType: 'music',
    songFilters: { songCount: 10 },
    params: { songDuration: 30, answerTimer: 10 }
  },
  {
    modeType: 'text_input',
    mediaType: 'music',
    songFilters: { songCount: 8 },
    params: { songDuration: 25, answerTimer: 15 }
  },
  {
    modeType: 'buzz_and_choice',
    mediaType: 'picture',
    songFilters: { songCount: 8 },
    params: { songDuration: 10, answerTimer: 15 }
  },
  {
    modeType: 'fast_buzz',
    mediaType: 'video',
    songFilters: { songCount: 5 },
    params: { songDuration: 15, answerTimer: 5 }
  }
]
```

## Round Progression

### Game State Transitions

```
lobby → playing → between_rounds → playing → ... → finished
```

### Round Flow

1. **Game Starts** → Room status: `playing`
   - First round starts automatically
   - WebSocket: `game:started`
   - WebSocket: `round:started`

2. **Round in Progress**
   - Songs play sequentially
   - Players buzz and answer
   - Scores accumulate per round
   - WebSocket: `song:started`, `player:buzzed`, `answer:result`, `song:ended`

3. **Round Ends** → Room status: `between_rounds`
   - Calculate round scores with rankings
   - WebSocket: `round:ended`
   - WebSocket: `round:between` with leaderboard and next round preview

4. **Next Round Starts** (Master triggers)
   - Endpoint: `POST /api/game/:roomId/next-round`
   - Room status: `playing`
   - WebSocket: `round:started`

5. **Game Ends** (After last round)
   - Room status: `finished`
   - Calculate final scores across all rounds
   - WebSocket: `game:ended` with final leaderboard

### Key Service Methods

**GameService.ts:**

```typescript
// Start a specific round
async startRound(roomId: string, sessionId: string, roundIndex: number): Promise<void>

// End current round, transition to between_rounds or finished
async endRound(roomId: string, round: Round): Promise<void>

// Start next pending round (called by master)
async startNextRound(roomId: string): Promise<void>

// Calculate scores for a round with rankings
calculateRoundScores(round: Round, players: Player[]): Array<{
  playerId: string,
  playerName: string,
  score: number,
  rank: number
}>

// Calculate final scores across all rounds
async calculateFinalScores(session: GameSession, players: Player[]): Promise<FinalScore[]>
```

## WebSocket Events

### Game Flow Events

**`game:started`**
```typescript
{
  type: 'game:started',
  data: {
    room: Room,
    session: GameSession
  }
}
```

**`round:started`**
```typescript
{
  type: 'round:started',
  data: {
    roundIndex: number,
    songCount: number,
    modeType: string
  }
}
```

**`round:between`** (Transition between rounds)
```typescript
{
  type: 'round:between',
  data: {
    completedRoundIndex: number,
    nextRoundIndex: number,
    nextRoundMode: string,
    nextRoundMedia: string,
    scores: Array<{
      playerId: string,
      playerName: string,
      score: number,
      rank: number
    }>
  }
}
```

**`round:ended`**
```typescript
{
  type: 'round:ended',
  data: {
    roundIndex: number,
    scores: Record<string, number>
  }
}
```

**`game:ended`**
```typescript
{
  type: 'game:ended',
  data: {
    finalScores: Array<{
      playerId: string,
      playerName: string,
      totalScore: number,
      rank: number,
      roundScores: number[]
    }>
  }
}
```

### Gameplay Events

**`song:started`**
```typescript
{
  type: 'song:started',
  data: {
    songIndex: number,
    duration: number,
    audioUrl: string,
    clipStart: number,
    audioPlayback: 'master' | 'players' | 'all',
    songTitle?: string,      // Only for master/debug
    songArtist?: string      // Only for master/debug
  }
}
```

**`player:buzzed`**
```typescript
{
  type: 'player:buzzed',
  data: {
    playerId: string,
    playerName: string,
    songIndex: number,
    titleChoices?: string[]  // Multiple choice options (buzz_and_choice mode)
  }
}
```

**`answer:result`**
```typescript
{
  type: 'answer:result',
  data: {
    playerId: string,
    playerName: string,
    answerType: 'title' | 'artist',
    isCorrect: boolean,
    pointsAwarded: number,
    shouldShowArtistChoices?: boolean,  // buzz_and_choice: show artist choices next
    lockOutPlayer?: boolean             // Player locked out from buzzing
  }
}
```

**`choices:artist`** (buzz_and_choice mode only)
```typescript
{
  type: 'choices:artist',
  data: {
    playerId: string,
    artistChoices: string[]  // 4 artist choices after correct title
  }
}
```

**`song:ended`**
```typescript
{
  type: 'song:ended',
  data: {
    songIndex: number,
    correctTitle: string,
    correctArtist: string
  }
}
```

## Testing Strategies

### Unit Tests

#### Mode Handler Tests

**BuzzAndChoiceMode.test.ts:**
```typescript
describe('BuzzAndChoiceMode', () => {
  // Choice generation
  test('generates 4 title choices including correct answer')
  test('generates 4 artist choices including correct answer')
  test('shuffles choices randomly')
  test('handles insufficient songs for unique choices')

  // Buzzing
  test('accepts first buzz')
  test('rejects buzz from locked out player')
  test('handles race condition with timestamps')

  // Answer validation
  test('validates correct title choice')
  test('validates incorrect title choice')
  test('shows artist choices after correct title')
  test('locks out player after wrong title')
  test('awards points correctly')
  test('applies penalty when enabled')

  // Song ending
  test('ends song when correct answer found')
  test('ends song when all players locked out')
  test('continues song with remaining players')
})
```

**FastBuzzMode.test.ts:**
```typescript
describe('FastBuzzMode', () => {
  // Buzzing
  test('accepts first valid buzz')
  test('uses timestamps for race condition')
  test('allows rebuzz after wrong answer')

  // Manual validation
  test('accepts master marking as correct')
  test('accepts master marking as wrong')
  test('locks out player on wrong answer')
  test('awards/deducts points based on validation')

  // Song ending
  test('ends song on correct answer')
  test('ends song when all locked out')
})
```

**TextInputMode.test.ts:**
```typescript
describe('TextInputMode', () => {
  // Levenshtein distance
  test('calculates distance correctly', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
    expect(levenshteinDistance('Queen', 'Quen')).toBe(1)
  })

  // Exact matching
  test('accepts exact match case-insensitive')
  test('rejects completely wrong answer')

  // Fuzzy matching
  test('accepts 1 character difference with threshold 2')
  test('accepts 2 character difference with threshold 2')
  test('rejects 3 character difference with threshold 2')
  test('respects fuzzyMatch disabled flag')

  // No buzzing
  test('always rejects buzz attempts')
  test('allows multiple simultaneous answers')

  // Scoring
  test('awards points for correct title')
  test('awards points for correct artist')
  test('awards no points for incorrect')
})
```

#### GameService Tests

**GameService.test.ts:**
```typescript
describe('GameService - Round Progression', () => {
  // Game start
  test('validates rounds array is required')
  test('validates at least one round')
  test('validates song filters return songs')
  test('creates session and rounds in database')
  test('starts first round automatically')

  // Round progression
  test('transitions to between_rounds after last song')
  test('allows master to start next round')
  test('prevents starting next round from wrong state')
  test('ends game after final round')

  // Score calculation
  test('calculates round scores with correct rankings')
  test('handles tied scores')
  test('calculates final scores across all rounds')
  test('aggregates roundScores array correctly')

  // Edge cases
  test('handles player disconnect during round')
  test('handles all players leaving')
  test('handles round with no correct answers')
})
```

### End-to-End Tests

#### Multi-Round Game Flow

```typescript
describe('E2E: Complete Multi-Round Game', () => {
  test('Quick Game preset (3 rounds)', async () => {
    // Setup: Create room, add 3 players
    // Start game with Quick preset

    // Round 1: Fast Buzz (5 songs)
    // - Player 1 buzzes and answers correctly (master validates)
    // - Player 2 buzzes and answers wrong
    // - Player 3 buzzes and answers correctly
    // - Verify scores after round

    // Transition: between_rounds state
    // - Verify round:between event
    // - Verify leaderboard shows correct rankings
    // - Master starts next round

    // Round 2: Buzz and Choice (7 songs)
    // - Player 1 buzzes, gets title choices, answers correctly
    // - Player 1 gets artist choices, answers correctly
    // - Player 2 buzzes, answers wrong, gets locked out
    // - Verify scores after round

    // Transition: between_rounds state
    // - Master starts next round

    // Round 3: Text Input (5 songs)
    // - Player 1 types exact title
    // - Player 2 types title with typo (fuzzy match)
    // - Player 3 types wrong title
    // - Verify scores after round

    // Game End
    // - Verify game:ended event
    // - Verify final scores aggregate all rounds
    // - Verify rankings correct
  })
})
```

#### Race Condition Tests

```typescript
describe('E2E: Buzz Race Conditions', () => {
  test('simultaneous buzzes from multiple players', async () => {
    // Start song
    // Send buzz from 3 clients with timestamps
    // Verify only earliest timestamp wins
    // Verify other players get rejection
  })

  test('network delay causes out-of-order buzzes', async () => {
    // Player 1 buzzes at T=100ms (arrives at server T=150ms)
    // Player 2 buzzes at T=120ms (arrives at server T=130ms)
    // Verify Player 1 wins despite later arrival
  })
})
```

#### WebSocket Event Tests

```typescript
describe('E2E: WebSocket Event Flow', () => {
  test('all events broadcast correctly', async () => {
    // Track all events received by each client
    // Verify event order and data consistency
    // Verify master sees different data (song answers)
    // Verify players only see their own choices
  })
})
```

## Database Schema

### Sessions Table
```sql
CREATE TABLE game_sessions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  status TEXT DEFAULT 'active'
);
```

### Rounds Table
```sql
CREATE TABLE rounds (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES game_sessions(id),
  index INTEGER NOT NULL,
  mode_type TEXT NOT NULL,
  media_type TEXT NOT NULL,
  song_filters JSON,
  params JSON,
  status TEXT DEFAULT 'pending',
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  current_song_index INTEGER DEFAULT 0
);
```

## Common Issues and Debugging

### Title Choices Not Appearing

**Symptoms:** Player buzzes but doesn't see 4 options

**Debug Steps:**
1. Check server logs for "Generated choices" with titleChoices array
2. Check server logs for "Broadcasting buzz event" with titleChoicesCount
3. Check client console for "[Player] player:buzzed received" with titleChoices
4. Verify `song.titleChoices` is populated before buzz
5. Verify mode is `buzz_and_choice` (other modes don't use choices)

**Fix Applied:** Added playerName to buzz broadcast, ensured titleChoices flow through WebSocket

### Fuzzy Matching Too Strict/Lenient

**Symptoms:** Valid answers rejected or invalid answers accepted

**Debug Steps:**
1. Check `levenshteinDistance` parameter (default: 2)
2. Test with known examples: "Queen" → "Quen" = 1 distance
3. Check if `fuzzyMatch` is enabled
4. Log actual vs expected strings with distances

**Tuning:**
- Distance 1: Very strict, only 1 typo allowed
- Distance 2: Moderate, 2 typos/changes allowed (recommended)
- Distance 3: Lenient, may accept significantly different answers

### Round Progression Stuck

**Symptoms:** Game stays in between_rounds state

**Debug Steps:**
1. Check room status is `between_rounds`
2. Verify master role has permission
3. Check for pending rounds in database
4. Verify `/api/game/:roomId/next-round` endpoint response

**Fix:** Master must explicitly call next-round endpoint (button in UI)

## Performance Considerations

- **Choice Generation:** O(n) where n = total songs, runs once per song
- **Levenshtein Distance:** O(m*n) where m,n = string lengths, runs per answer
- **Buzz Racing:** O(1) timestamp comparison
- **Score Calculation:** O(p*s) where p = players, s = songs per round

**Optimization Tips:**
- Cache generated choices for repeated plays
- Limit Levenshtein to strings under 100 chars
- Use indexed queries for song filtering
- Batch score updates in database

## Conclusion

This multi-round system provides flexible game configuration with three distinct game modes. The architecture separates concerns between game orchestration (GameService), mode logic (mode handlers), and state management (GameStateManager).

For questions or issues, consult the mode handler implementations and add logging at key decision points.
