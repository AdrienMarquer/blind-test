---
name: test-game-flow
description: Test the complete game flow from lobby to final results. Use this proactively when verifying game modes, scoring, multi-player interactions, or after making changes to game logic.
---

# Test Game Flow

Comprehensive testing guide for the blind-test game.

## Quick Start

```bash
# Terminal 1: Start server
bun run dev:server

# Terminal 2: Start client
bun run dev:client

# Open browser tabs:
# - Master: http://localhost:5173
# - Player 1: http://localhost:5173 (or use phone on same network)
# - Player 2: http://localhost:5173 (optional)
```

## Test Scenarios

### Scenario 1: Basic Game (Master as Spectator)

- [ ] Create room from home page
- [ ] Verify room code is displayed
- [ ] Verify QR code is generated
- [ ] Join as Player 1 (enter name)
- [ ] Verify player appears in master's lobby
- [ ] Configure game (default settings)
- [ ] Start game
- [ ] Verify loading countdown (3...2...1)
- [ ] Verify song plays on master device
- [ ] Player buzzes
- [ ] Player answers (correct/wrong)
- [ ] Verify scoring updates
- [ ] Complete all songs
- [ ] Verify final leaderboard

### Scenario 2: Master Playing Mode

- [ ] Create room
- [ ] Toggle "Je joue aussi" (I'm playing too)
- [ ] Enter master player name
- [ ] Verify master appears in player list
- [ ] Start game
- [ ] Verify master can buzz and answer
- [ ] Verify master's score updates
- [ ] Verify master appears in leaderboard

### Scenario 3: Multi-Player Competition

- [ ] Create room with 3+ players
- [ ] Player 1 buzzes first → gets to answer
- [ ] Other players see "Player 1 répond..."
- [ ] If wrong: Player 1 locked out, others can buzz
- [ ] If correct: Song ends, points awarded
- [ ] Verify correct player gets points

### Scenario 4: Pause/Resume

- [ ] Start game with song playing
- [ ] Master clicks pause button
- [ ] Verify audio pauses
- [ ] Verify timer stops
- [ ] Verify players see paused state
- [ ] Master clicks play button
- [ ] Verify audio resumes
- [ ] Verify timer continues from where it stopped

### Scenario 5: Player Disconnect/Reconnect

- [ ] Player joins and game starts
- [ ] Player closes browser tab
- [ ] Verify player shows as "offline" in master view
- [ ] Player reopens the room URL
- [ ] Verify player reconnects and can continue playing

### Scenario 6: Game Restart

- [ ] Complete a full game
- [ ] Click "Nouvelle partie" (New game)
- [ ] Verify scores reset to 0
- [ ] Verify players remain in lobby
- [ ] Start new game
- [ ] Verify game works normally

## UI Elements to Verify

### Loading Screen
- [ ] Song counter shows correct number (e.g., "1/10")
- [ ] Countdown animation works (3...2...1)
- [ ] Genre badge displays (if configured)
- [ ] Mini leaderboard shows current scores

### Playing State
- [ ] Timer bar animates smoothly
- [ ] Time remaining displays correctly
- [ ] Buzz button is prominent and clickable
- [ ] Locked-out players see "Tu es bloqué" message

### Answer Reveal
- [ ] Album art displays
- [ ] Title and artist shown
- [ ] Winner name highlighted
- [ ] Audio continues playing during reveal

### Final Results
- [ ] All players ranked by score
- [ ] Winner highlighted
- [ ] "Nouvelle partie" button works

## Common Issues to Check

| Issue | What to verify |
|-------|----------------|
| Song counter wrong | Should show `songIndex + 1` |
| Timer not moving | Check `timerStates` includes current state |
| Audio not playing | Check `audioPlayback` setting |
| Player not in list | Check `masterPlaying` reactivity |
| Scores not updating | Check WebSocket `answerResult` handler |
| Pause icon wrong | Check `isPaused` state reset on song start |

## Debug Tools

### Browser Console
```javascript
// Watch WebSocket messages
// Open DevTools → Network → WS → click connection → Messages tab
```

### Server Logs
```bash
# Server logs show all WebSocket events
# Look for [WS], [Room], [Game] prefixes
```

### Check Game State
```javascript
// In browser console on player page:
// State is logged on each transition
// Look for "[Player]" or "[MasterPlayer]" prefixes
```

## Performance Checks

- [ ] Loading screen appears within 1 second of song end
- [ ] Buzz registers within 100ms
- [ ] Timer animation is smooth (60fps)
- [ ] No memory leaks after multiple rounds (check DevTools → Memory)
