---
name: sync-game-interfaces
description: Synchronize changes between MasterPlayerInterface and PlayerGameInterface components. Use after modifying game UI, timers, state handling, or WebSocket event handlers in either file.
---

# Sync Game Interfaces

The blind-test has two parallel game interfaces that share similar logic:
- `MasterPlayerInterface.svelte` - For the game master who is also playing
- `PlayerGameInterface.svelte` - For regular players

Changes to one often need to be mirrored in the other.

## Files to Compare

```
apps/client/src/lib/components/
├── MasterPlayerInterface.svelte  (~700 lines)
└── PlayerGameInterface.svelte    (~1000 lines)
```

## Areas That Must Stay in Sync

### 1. Game State Types
Both files define similar `GameState` types. Ensure states match:

```typescript
type GameState =
  | { status: 'idle' }
  | { status: 'loading'; countdown: number; genre?: string }
  | { status: 'ready_to_buzz'; timeRemaining: number }
  | { status: 'locked_out' }
  | { status: 'answer_reveal'; ... }
  // etc.
```

### 2. WebSocket Event Handlers
These `$effect` blocks should handle events identically:

| Event | What to sync |
|-------|--------------|
| `roundStarted` | Mode type, song count, state reset |
| `songPreparing` | Loading screen, countdown, song index |
| `songStarted` | Timer start, audio playback, state transition |
| `songEnded` | Answer reveal, audio resume |
| `answerResult` | Feedback, state transitions, lock-out handling |
| `gamePaused` / `gameResumed` | Pause state, timer pause/resume |

### 3. Timer/Progress Animation
The smooth timer logic must be identical:

```typescript
// These functions should match:
- startSmoothTimer(duration, elapsed)
- resumeSmoothTimerFromRemaining(remaining)
- stopSmoothTimer()

// These states should match:
- smoothProgress
- pausedProgress
- timerAnimationKey
```

### 4. Loading Screen UI
The loading state rendering should match:
- Song counter: `{currentSongIndex + 1} / {totalSongsInRound}`
- Countdown circle
- Genre badge
- Leaderboard display

### 5. Answer Reveal UI
Both should show:
- Album art
- Correct title/artist
- Winner information

## Sync Checklist

When modifying either interface:

- [ ] Check if the change affects shared logic
- [ ] Copy relevant code to the other file
- [ ] Adjust for interface-specific differences (master has extra controls)
- [ ] Test both interfaces after changes
- [ ] Run `bun run check` to verify no type errors

## Key Differences (Don't Sync These)

| MasterPlayerInterface | PlayerGameInterface |
|-----------------------|---------------------|
| Pause/End game buttons | No game controls |
| Always plays audio | Audio based on `audioPlayback` setting |
| No buzz button (auto-buzz) | Buzz button for players |
| Master-specific feedback | Player-specific feedback |

## Common Sync Mistakes

1. **Forgetting to update song index** - Both need `currentSongIndex = event.songIndex` in `songPreparing`
2. **Timer not resuming** - Both need to call `resumeSmoothTimerFromRemaining()` in same places
3. **Different state names** - Ensure status strings match exactly
4. **Missing event clears** - Both need `socket.events.clear('eventName')` after handling

## Quick Diff Command

To see differences between the two files:
```bash
diff -u apps/client/src/lib/components/MasterPlayerInterface.svelte \
        apps/client/src/lib/components/PlayerGameInterface.svelte | head -200
```
