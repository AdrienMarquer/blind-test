# Blind Test - Game State Machine

## 🎮 State Machine Overview

The Blind Test game follows a hierarchical state machine with three levels:
1. **Room State** - Overall room lifecycle
2. **Game State** - Active game session
3. **Song State** - Individual song within a round

## 🏠 Room State Machine

### States

```
┌─────────┐
│  LOBBY  │ ← Initial state
└────┬────┘
     │ start_game()
     ▼
┌─────────┐
│ PLAYING │
└────┬────┘
     │ round_complete() [more rounds]
     ▼
┌──────────────┐
│BETWEEN_ROUNDS│
└──────┬───────┘
       │ continue()
       ├─────────────> PLAYING (next round)
       │
       │ final_round_complete()
       ▼
┌─────────┐
│FINISHED │ ← Terminal state
└─────────┘
```

### State Definitions

#### `LOBBY`
**Description**: Waiting for players to join

**Allowed Actions**:
- ✅ Player join
- ✅ Player leave
- ✅ Master kick player
- ✅ Master configure game
- ✅ Master start game (if ≥2 players)

**Transitions**:
- `start_game()` → `PLAYING`
- `delete_room()` → Room destroyed

---

#### `PLAYING`
**Description**: Game session active, song playing

**Allowed Actions**:
- ✅ Player buzz
- ✅ Player answer
- ✅ Master pause/resume
- ✅ Master skip song
- ✅ Master end game

**Blocked Actions**:
- ❌ Player join (room locked)
- ❌ Player leave (can disconnect only)
- ❌ Game configuration changes

**Transitions**:
- `round_complete()` → `BETWEEN_ROUNDS`
- `end_game()` → `FINISHED`

---

#### `BETWEEN_ROUNDS`
**Description**: Showing scoreboard between rounds

**Allowed Actions**:
- ✅ View scores
- ✅ Master continue to next round
- ✅ Master end game early

**Blocked Actions**:
- ❌ Player join
- ❌ Gameplay actions

**Transitions**:
- `continue()` → `PLAYING` (next round)
- `end_game()` → `FINISHED`

**Auto-transition**: After 10 seconds (configurable)

---

#### `FINISHED`
**Description**: Game complete, showing final results

**Allowed Actions**:
- ✅ View final scores
- ✅ Master create new game

**Blocked Actions**:
- ❌ All gameplay actions

**Transitions**:
- `play_again()` → New room in `LOBBY`

**Auto-cleanup**: Room deleted after 30 minutes (configurable)

---

## 🎲 Game Session State Machine

### States

```
┌─────────┐
│ WAITING │
└────┬────┘
     │ start_round()
     ▼
┌─────────┐     pause()      ┌────────┐
│ PLAYING │ ◄─────────────── │ PAUSED │
└────┬────┘ ──────────────>  └────────┘
     │         resume()
     │ song_end()
     ▼
┌──────────┐
│SONG_ENDED│
└────┬─────┘
     │ [more songs]
     ├─────────────> PLAYING (next song)
     │
     │ [no more songs]
     ▼
┌────────────┐
│ROUND_ENDED │
└─────┬──────┘
      │
      ├─── [more rounds] ──> WAITING (next round)
      │
      └─── [no more] ─────> FINISHED
```

### State Definitions

#### `WAITING`
**Description**: Between rounds or before first round

**Entry Actions**:
- Load next round configuration
- Initialize mode instance
- Reset player states

**Transitions**:
- `start_round()` → `PLAYING`

---

#### `PLAYING`
**Description**: Song currently playing, players can interact

**Entry Actions**:
- Load current song
- Start song timer
- Enable buzz buttons
- Broadcast `song:started`

**Active Timers**:
- Song duration timer
- Answer timer (when player is active)

**Transitions**:
- `pause()` → `PAUSED`
- `song_end()` → `SONG_ENDED`

---

#### `PAUSED`
**Description**: Game temporarily paused by master

**Entry Actions**:
- Pause all timers
- Broadcast `game:paused`

**Transitions**:
- `resume()` → `PLAYING`
- `end_game()` → `FINISHED`

---

#### `SONG_ENDED`
**Description**: Song completed, processing results

**Entry Actions**:
- Stop all timers
- Calculate scores
- Reveal song info
- Update player scores
- Broadcast `song:ended`

**Exit Actions**:
- Reset player active/lockout states
- Increment song index

**Transitions**:
- `next_song()` → `PLAYING` (if more songs)
- `round_complete()` → `ROUND_ENDED` (if last song)

---

#### `ROUND_ENDED`
**Description**: All songs in round complete

**Entry Actions**:
- Calculate round scores
- Update overall scores
- Generate scoreboard
- Broadcast `round:ended`

**Transitions**:
- `next_round()` → `WAITING` (if more rounds)
- `game_complete()` → `FINISHED` (if last round)

---

#### `FINISHED`
**Description**: All rounds complete

**Entry Actions**:
- Calculate final scores
- Apply tiebreakers
- Generate final rankings
- Broadcast `game:ended`

**Terminal State**: No further transitions

---

## 🎵 Song State Machine (Buzz + Choice Mode)

### States

```
┌────────────────┐
│ WAITING_TO_BUZZ│ ← Initial
└────────┬───────┘
         │ player_buzz()
         ▼
┌────────────────┐
│ ANSWERING_TITLE│
└────────┬───────┘
         │
         ├─ TITLE CORRECT ──────┐
         │                       ▼
         │              ┌─────────────────┐
         │              │ANSWERING_ARTIST │
         │              └────────┬────────┘
         │                       │
         │                       ├─ ARTIST CORRECT ─────┐
         │                       │                       │
         │                       ├─ ARTIST WRONG ────┐  │
         │                       │                    │  │
         │                       └─ TIMEOUT ─────────┤  │
         │                                            │  │
         ├─ TITLE WRONG ──────────────────────────┐  │  │
         │                                         │  │  │
         └─ TIMEOUT ──────────────────────────────┤  │  │
                                                   ▼  ▼  ▼
                                            ┌──────────────┐
                                            │ SONG_COMPLETE│
                                            └──────────────┘
```

### Detailed State Definitions

#### `WAITING_TO_BUZZ`
**Description**: Song playing, waiting for first buzz

**Active Elements**:
- Song timer running
- Buzz button enabled (for non-locked players)
- Song audio playing

**Player Actions**:
- `buzz()` → First player becomes active

**Transitions**:
- `player_buzz()` → `ANSWERING_TITLE`
- `song_timer_expired()` → `SONG_COMPLETE`
- `all_players_locked()` → `SONG_COMPLETE`

---

#### `ANSWERING_TITLE`
**Description**: Active player selecting song title

**Entry Actions**:
- Generate title choices (1 correct, 3 wrong)
- Start answer timer (5s default)
- Display choices to active player
- Broadcast `buzz:locked`

**Active Timers**:
- Song timer (continues)
- Answer timer

**Player Actions** (active player only):
- `submit_title(choice)` → Validate answer

**Validation Logic**:
```typescript
if (choice === correctTitle) {
  awardPoints(player, params.pointsTitle);
  transition_to('ANSWERING_ARTIST');
} else {
  if (params.penaltyEnabled) {
    deductPoints(player, params.penaltyAmount);
  }
  lockoutPlayer(player);

  if (params.allowRebuzz && remainingPlayers > 0) {
    transition_to('WAITING_TO_BUZZ');
    broadcast('buzz:unlocked');
  } else {
    transition_to('SONG_COMPLETE');
  }
}
```

**Transitions**:
- `title_correct()` → `ANSWERING_ARTIST`
- `title_wrong() + rebuzz_allowed` → `WAITING_TO_BUZZ`
- `title_wrong() + no_rebuzz` → `SONG_COMPLETE`
- `answer_timeout()` → Same logic as wrong answer

---

#### `ANSWERING_ARTIST`
**Description**: Active player selecting artist name

**Entry Actions**:
- Generate artist choices (1 correct, 3 wrong)
- Reset answer timer (5s default)
- Display choices to active player

**Active Timers**:
- Song timer (continues)
- Answer timer

**Player Actions** (active player only):
- `submit_artist(choice)` → Validate answer

**Validation Logic**:
```typescript
if (choice === correctArtist) {
  awardPoints(player, params.pointsArtist);
  transition_to('SONG_COMPLETE');
  broadcast('song:ended', { reason: 'correct_answer' });
} else {
  if (params.penaltyEnabled) {
    deductPoints(player, params.penaltyAmount);
  }
  lockoutPlayer(player);
  // Player keeps points from correct title

  if (params.allowRebuzz && remainingPlayers > 0) {
    transition_to('WAITING_TO_BUZZ');
    broadcast('buzz:unlocked');
  } else {
    transition_to('SONG_COMPLETE');
  }
}
```

**Transitions**:
- `artist_correct()` → `SONG_COMPLETE`
- `artist_wrong() + rebuzz_allowed` → `WAITING_TO_BUZZ`
- `artist_wrong() + no_rebuzz` → `SONG_COMPLETE`
- `answer_timeout()` → Same logic as wrong answer

---

#### `SONG_COMPLETE`
**Description**: Song finished, processing results

**Entry Actions**:
- Stop song audio
- Stop all timers
- Reveal song info (title, artist)
- Calculate final scores for song
- Broadcast `song:ended` with results

**Exit Actions**:
- Clear active player
- Clear all lockouts
- Increment song index

**Transitions**:
- `next_song()` → New song in `WAITING_TO_BUZZ`
- `last_song()` → Parent `ROUND_ENDED`

---

## 🔀 State Transition Guards

### Guard Conditions
Conditions that must be true for a transition:

```typescript
// Can start game?
canStartGame(room: Room): boolean {
  return room.status === 'lobby'
    && room.players.length >= 2
    && room.players.length <= room.maxPlayers;
}

// Can player buzz?
canBuzz(player: Player, song: RoundSong): boolean {
  return !player.isLockedOut
    && !player.isActive
    && song.status === 'playing'
    && song.activePlayerId === null;
}

// Can submit answer?
canSubmitAnswer(player: Player, answerType: AnswerType): boolean {
  return player.isActive
    && !answerTimerExpired()
    && isExpectedAnswerType(answerType);
}

// Can skip song?
canSkipSong(role: PlayerRole): boolean {
  return role === 'master';
}

// Can pause game?
canPauseGame(role: PlayerRole, status: GameStatus): boolean {
  return role === 'master' && status === 'playing';
}
```

## ⏱ Timer Management

### Active Timers

```typescript
interface Timer {
  id: string;
  type: 'song' | 'answer' | 'auto_continue';
  duration: number;     // Total duration in ms
  remaining: number;    // Time left in ms
  startedAt: Date;
  pausedAt?: Date;
  onComplete: () => void;
}
```

### Timer Lifecycle

```typescript
class TimerManager {
  private timers = new Map<string, Timer>();

  start(timer: Timer): void {
    this.timers.set(timer.id, timer);
    this.runTimer(timer);
  }

  pause(timerId: string): void {
    const timer = this.timers.get(timerId);
    if (timer && !timer.pausedAt) {
      timer.pausedAt = new Date();
      timer.remaining = this.calculateRemaining(timer);
    }
  }

  resume(timerId: string): void {
    const timer = this.timers.get(timerId);
    if (timer && timer.pausedAt) {
      timer.pausedAt = undefined;
      timer.startedAt = new Date();
      this.runTimer(timer);
    }
  }

  stop(timerId: string): void {
    this.timers.delete(timerId);
  }

  stopAll(): void {
    this.timers.clear();
  }

  private runTimer(timer: Timer): void {
    setTimeout(() => {
      if (!timer.pausedAt) {
        timer.onComplete();
        this.timers.delete(timer.id);
      }
    }, timer.remaining);
  }

  private calculateRemaining(timer: Timer): number {
    const elapsed = Date.now() - timer.startedAt.getTime();
    return Math.max(0, timer.duration - elapsed);
  }
}
```

### Timer Types & Durations

| Timer Type | Default Duration | Triggers |
|------------|------------------|----------|
| `song` | 15s | Song ends, proceed based on state |
| `answer` | 5s | Answer timeout, lock out player |
| `auto_continue` | 10s | Auto-advance to next round |

---

## 🎯 Multiple Choice Generation

### Algorithm

```typescript
async function generateChoices(
  correctValue: string,
  type: 'title' | 'artist',
  numChoices: number = 4
): Promise<string[]> {
  const wrongChoices: string[] = [];

  // Get all songs from same genre/era
  const candidateSongs = await getSimilarSongs(currentSong);

  // Extract values of specified type
  const candidates = candidateSongs
    .map(s => type === 'title' ? s.title : s.artist)
    .filter(v => v !== correctValue)  // Exclude correct answer
    .filter(distinct);  // Remove duplicates

  // Randomly select wrong answers
  wrongChoices = shuffle(candidates).slice(0, numChoices - 1);

  // If not enough candidates, use random songs
  if (wrongChoices.length < numChoices - 1) {
    const additional = await getRandomSongs(numChoices - 1 - wrongChoices.length);
    wrongChoices.push(...additional.map(s => type === 'title' ? s.title : s.artist));
  }

  // Combine and shuffle
  const allChoices = [correctValue, ...wrongChoices];
  return shuffle(allChoices);
}
```

### Choice Validation

```typescript
// Ensure choices are distinct
function ensureDistinctChoices(choices: string[]): boolean {
  return new Set(choices).size === choices.length;
}

// Similarity check (for better wrong answers)
function areChoicesSimilar(correct: string, wrong: string): boolean {
  // Same decade, genre, or artist style
  return compareGenre(correct, wrong)
    || compareEra(correct, wrong)
    || comparePopularity(correct, wrong);
}
```

---

## 📊 Score Calculation

### Point Award Flow

```typescript
function awardPoints(
  player: Player,
  points: number,
  reason: string
): void {
  player.roundScore += points;
  player.score += points;

  recordAnswer({
    playerId: player.id,
    pointsAwarded: points,
    reason: reason,
  });

  broadcastScoreUpdate({
    playerId: player.id,
    newScore: player.score,
    pointsAdded: points,
  });
}

function deductPoints(
  player: Player,
  penalty: number
): void {
  const deduction = Math.abs(penalty);
  player.roundScore = Math.max(0, player.roundScore - deduction);
  player.score = Math.max(0, player.score - deduction);

  broadcastScoreUpdate({
    playerId: player.id,
    newScore: player.score,
    pointsDeducted: deduction,
  });
}
```

### Final Score Calculation

```typescript
function calculateFinalScores(players: Player[]): FinalScore[] {
  return players
    .map(player => ({
      playerId: player.id,
      playerName: player.name,
      totalScore: player.score,
      roundScores: player.roundScores,
      correctAnswers: player.stats.correctAnswers,
      wrongAnswers: player.stats.wrongAnswers,
      averageAnswerTime: player.stats.averageAnswerTime,
    }))
    .sort((a, b) => {
      // 1. Total score
      if (a.totalScore !== b.totalScore) {
        return b.totalScore - a.totalScore;
      }
      // 2. Most correct answers
      if (a.correctAnswers !== b.correctAnswers) {
        return b.correctAnswers - a.correctAnswers;
      }
      // 3. Fewest wrong answers
      if (a.wrongAnswers !== b.wrongAnswers) {
        return a.wrongAnswers - b.wrongAnswers;
      }
      // 4. Fastest average time
      return a.averageAnswerTime - b.averageAnswerTime;
    })
    .map((score, index) => ({
      ...score,
      rank: index + 1,
    }));
}
```

---

## 🔄 State Persistence

### Save State on Transitions

```typescript
async function transitionState(
  from: State,
  to: State,
  context: StateContext
): Promise<void> {
  // Validate transition
  if (!isValidTransition(from, to)) {
    throw new Error(`Invalid transition: ${from} → ${to}`);
  }

  // Execute exit actions
  await executeExitActions(from, context);

  // Update state
  context.currentState = to;

  // Persist to database (if enabled)
  await saveState(context);

  // Execute entry actions
  await executeEntryActions(to, context);

  // Broadcast state change
  broadcast('state:changed', {
    from,
    to,
    timestamp: new Date(),
  });
}
```

---

**Last Updated**: 2024-11-09
**Version**: 1.0
