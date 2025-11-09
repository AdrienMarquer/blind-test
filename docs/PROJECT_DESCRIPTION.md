# Blind Test - Product Vision & Game Architecture

## 📋 Project Overview

A **local multiplayer blind test game** where players compete to identify songs using their mobile devices while a master device (laptop) controls music playback through a Bluetooth speaker.

### Core Principles
1. **Local-First**: Uses local MP3 files, no internet required
2. **Master Controls**: Single device manages audio and game flow
3. **Mobile Players**: Join via QR code, play from their phones
4. **Extensible Architecture**: Modular mode system for different gameplay styles
5. **Fair Competition**: Clear rules, transparent scoring, equal opportunity

---

## 🏗 Game Architecture

The system is organized into **three logical layers**:

```
Game Session
  └─ Round 1 (Mode: Buzz + Choice)
      └─ Song 1
      └─ Song 2
      └─ Song 3
  └─ Round 2 (Mode: Fast Buzz)
      └─ Song 4
      └─ Song 5
```

### Layer Definitions

**Game Session**
- The overall play session from start to finish
- Contains multiple rounds
- Defines global settings (player list, master controls, session config)

**Round**
- One phase of play using a specific mode
- Contains multiple songs
- Each round is an instance of a mode with specific parameters

**Mode**
- Self-contained rule set that defines gameplay mechanics
- Determines: player actions, validation, scoring, timers, end conditions
- Treated as a plug-in module that rounds execute

### Parameter Inheritance

Configuration values are resolved with this priority (highest to lowest):

1. **Round-level parameters** (most specific)
2. **Game-level parameters** (session defaults)
3. **Mode-level defaults** (defined by the mode)
4. **System-level defaults** (fallback values)

**Example:**
```
System default: song_duration = 30s
Mode default (Buzz + Choice): song_duration = 15s
Game setting: song_duration = 20s
Round 3 override: song_duration = 10s

→ Round 3 uses 10s, other rounds use 20s
```

This inheritance model ensures:
- ✅ Games can start immediately (defaults everywhere)
- ✅ Advanced users can customize individual rounds
- ✅ New modes can introduce new parameters safely

---

## 👥 User Roles & Permissions

### Master (Host)
**Device**: Laptop connected to Bluetooth speaker

**Responsibilities**:
- Creates game session and generates QR code
- Controls music playback (play/pause/skip)
- Starts rounds and manages game flow
- Views all player answers in real-time
- Can kick players (only in lobby, not during game)
- Ends game and shows final results

**Limitations**:
- Cannot play as a participant
- Pure moderation and control role

### Player
**Device**: Phone or tablet

**Responsibilities**:
- Scans QR code to join room
- Participates in gameplay (buzz, answer, guess)
- Views personal score and round scoreboard
- Can voluntarily leave game

**Limitations**:
- Cannot join mid-game (locked after game starts)
- Maximum 8 players per room
- No control over game flow or music

### Spectator (Future Feature)
- View-only mode
- Sees game state and scores
- Cannot interact or submit answers

---

## 🎮 Room & Session Management

### Creating a Room

1. Master opens app and clicks "Create Room"
2. System generates:
   - Unique room ID
   - QR code for joining
   - Room lobby screen
3. Master configures (optional):
   - Game name
   - Number of rounds
   - Playlist selection
   - Mode sequence

### Joining a Room

1. Player opens app on mobile device
2. Scans QR code displayed on master's screen
3. Enters display name
4. Joins lobby (appears in player list on master screen)
5. Waits for master to start game

**Restrictions**:
- Maximum 8 players
- Must join during lobby phase
- Cannot join after game starts
- Requires same local network as master

### Room States

| State | Description | Players Can Join? | Master Can |
|-------|-------------|-------------------|------------|
| **Lobby** | Waiting for players | ✅ Yes | Configure, start game, kick players |
| **Playing** | Game in progress | ❌ No | Control music, skip, end game |
| **Between Rounds** | Showing scoreboard | ❌ No | Continue to next round |
| **Finished** | Game ended | ❌ No | Show results, play again |

---

## 🎯 Mode System

### What is a Mode?

A **mode** is a self-contained gameplay rule set that defines:
1. What the player must do (buzz, choose, type, etc.)
2. How correctness is validated
3. How points are awarded
4. When a song ends
5. When a round ends
6. Which timers apply and their durations

Modes are **modular plug-ins** that rounds execute.

### Mode Documentation Template

Every mode must define:
- **Objective**: What players are trying to achieve
- **Core Interaction**: Primary player action
- **Time Structure**: Timers and duration rules
- **Song End Conditions**: When to move to next song
- **Round End Conditions**: When the round is complete
- **Scoring Logic**: Point calculation rules
- **Configurable Parameters**: Available customization options

---

## 🎵 Mode #1: "Buzz + Choice"

**Status**: Default mode, fully implemented

### Objective
Players race to buzz in, then correctly identify both the song title and artist from multiple-choice options.

### Gameplay Flow (Per Song)

```
Song starts playing (15s default)
    ↓
[Players can buzz at any time]
    ↓
First player buzzes → becomes active player
    ↓
Show 4 song title options (5s to choose)
    ↓
┌─ CORRECT TITLE ────────┐  ┌─ WRONG TITLE ──────────┐
│  +1 point              │  │  Locked out            │
│  Show 4 artist options │  │  Others can buzz again │
│  (5s to choose)        │  └────────────────────────┘
│         ↓              │
│  ┌─ CORRECT ARTIST ─┐ │
│  │  +1 point        │ │
│  │  Song ends       │ │
│  │  Next song →     │ │
│  └──────────────────┘ │
│         ↓              │
│  ┌─ WRONG ARTIST ───┐ │
│  │  Keep +1 (title) │ │
│  │  Locked out      │ │
│  │  Others can buzz │ │
│  └──────────────────┘ │
└────────────────────────┘
```

### Core Rules

**Buzzing**:
- Any player can buzz while the song is playing
- First buzz locks in that player
- Player has 5 seconds to view and select from options
- Song continues playing during answer selection

**Answer Sequence**:
1. Show 4 song titles (1 correct, 3 wrong)
2. Player selects one
3. If correct → show 4 artist names
4. If wrong → player locked out, others can buzz

**Scoring**:
- **+1 point** for correct song title
- **+1 point** for correct artist name
- **No penalty** for wrong answers (default)
- Maximum **2 points** per song

**Lockout Rules**:
- Wrong answer on title → locked out for entire song
- Wrong answer on artist (but correct title) → locked out, keeps +1 point
- Locked out players cannot buzz again for that song

**Song End Conditions** (first to occur):
1. A player correctly identifies both title and artist
2. Song timer expires (15s default)
3. All players are locked out

**Round End Conditions**:
- All songs in the round's playlist have been played

### Configurable Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `song_duration` | 15s | 5-60s | How long the song plays |
| `answer_timer` | 5s | 3-15s | Time to select from options |
| `penalty_enabled` | false | bool | Enable point deduction for wrong answers |
| `penalty_amount` | 0 | -5 to 0 | Points deducted (if enabled) |
| `num_choices` | 4 | 2-6 | Number of multiple choice options |
| `points_title` | 1 | 0-10 | Points for correct title |
| `points_artist` | 1 | 0-10 | Points for correct artist |
| `allow_rebuzz` | true | bool | Allow others to buzz after wrong answer |

### Multiple Choice Generation

**Title Options**:
- 1 correct title
- 3 wrong titles from similar genre/era

**Artist Options**:
- 1 correct artist
- 3 wrong artists from similar genre/era

**Requirements**:
- All options must be clearly distinct
- No duplicate options
- Randomize option order
- Ensure at least some plausibility in wrong answers

---

## 📊 Scoring System

### General Principles

- **Transparent**: Points visible immediately after each song
- **Fair**: All players have equal opportunity
- **Cumulative**: Scores carry across rounds
- **No Negative Scores**: Minimum score is 0 (even with penalties)

### Scoreboard Display

**During a Round** (Player View):
- Current round scores only
- Personal position in current round
- Number of songs remaining in round

**Between Rounds** (All Views):
- **Overall Scores**: Total points from all rounds
- **Round Breakdown**: Points earned per round
- **Ranking**: Current position (1st, 2nd, 3rd, etc.)
- **Statistics**: Correct answers, buzzer success rate, etc.

**Master View** (Always Visible):
- Live scoreboard with all players
- Real-time answer status during songs
- Round progress indicator

### Tiebreaker Rules

If multiple players have the same final score:
1. **Most correct answers** (buzzer success rate)
2. **Fewest wrong answers**
3. **Fastest average answer time**
4. If still tied → **shared victory**

---

## 🎵 Music Management

### Music Source
**Type**: Local MP3 files stored on master's laptop

**Requirements**:
- Supported formats: MP3, M4A, WAV, FLAC
- Minimum quality: 128kbps
- Each file must have proper metadata (title, artist, album)

### Playlist Creation

**Pre-Game**:
1. Master selects folder with MP3 files
2. System scans and extracts metadata
3. Master creates/edits playlists
4. Playlists saved locally for reuse

**Playlist Structure**:
```json
{
  "id": "playlist_001",
  "name": "80s Hits",
  "songs": [
    {
      "file_path": "/music/80s/thriller.mp3",
      "title": "Thriller",
      "artist": "Michael Jackson",
      "duration": 357,
      "clip_start": 30
    }
  ]
}
```

**Clip Selection**:
- Each song has a configurable start point
- Default: play from 30s mark (skip intro)
- Master can adjust per-song during setup

### Playback Controls (Master Only)

- **Play/Pause**: Start or pause current song
- **Skip**: Move to next song (forfeits current song scoring)
- **Replay**: Restart current song (rare, for technical issues)
- **Volume**: Adjust playback volume
- **Stop Game**: End session immediately

---

## 🖥 Technical Requirements

### Real-Time Communication

**Technology**: WebSockets (Socket.io or native WebSockets)

**Events**:
- `player:joined` - Player enters lobby
- `player:left` - Player disconnects
- `game:started` - Master starts game
- `round:started` - New round begins
- `song:started` - New song plays
- `player:buzzed` - Player pressed buzzer
- `answer:submitted` - Player selected choice
- `song:ended` - Song finished
- `round:ended` - Round completed
- `scores:updated` - Scoreboard changed

### Audio Playback

**Master Side**:
- Use Web Audio API or native audio library
- Controls: play, pause, stop, seek, volume
- Must support local file playback
- Output to Bluetooth speaker

**Player Side**:
- No audio playback required
- Visual indicators only (e.g., waveform animation)

### Answer Validation

**Multiple Choice**:
- Simple ID matching (no fuzzy logic needed)
- Options pre-generated from music metadata

**Future Text Input Modes**:
- Fuzzy string matching (Levenshtein distance ≤ 2)
- Case-insensitive
- Remove special characters
- Accept common abbreviations

### Data Persistence

**MVP** (In-Memory):
- Game state stored in memory
- Lost on server restart
- No history

**Future** (SQLite):
- Persistent room state
- Game history
- Player statistics
- Playlist library

### Network Requirements

**Architecture**: Master-Client (Star topology)
- Master = Server + Client (localhost)
- Players = Clients (connected to master's local network)

**Requirements**:
- Same WiFi/LAN network
- Master's IP must be accessible to players
- QR code contains connection info (IP:PORT)

---

## 📱 UI/UX Guidelines

### Master View (Laptop - Large Screen)

**Lobby Screen**:
- Large QR code (center)
- Room code (large text, easy to read across room)
- Player list (shows names as they join)
- Start Game button (enabled when ≥2 players)
- Settings button (configure rounds, modes, playlist)

**Game Screen**:
- **Main Area**: Song info (title/artist hidden during play)
- **Left Sidebar**: Player list with live status
  - Who buzzed (highlighted)
  - Answer status (thinking, correct, wrong)
  - Current round scores
- **Right Sidebar**: Controls
  - Pause/Resume
  - Skip Song
  - End Game
- **Bottom Bar**: Progress (Song X of Y)

**Between Rounds**:
- Full-screen scoreboard
- Round summary (top performers)
- Continue button

### Player View (Mobile - Portrait)

**Lobby Screen**:
- Welcome message
- Player name confirmation
- Waiting indicator
- Player count

**Game Screen - Waiting**:
- Song playing indicator (animated)
- Large **BUZZ** button (disabled if locked out)
- Small scoreboard (collapsed)
- Personal score prominent

**Game Screen - Active** (after buzzing):
- Timer countdown (5s)
- 4 large buttons (multiple choice)
- Clear visual feedback on selection

**Game Screen - Locked Out**:
- "Locked Out" message
- Show who's currently answering
- Small scoreboard visible

**Between Rounds**:
- Personal performance summary
- Overall scoreboard
- Ranking position
- "Next Round Starting..." indicator

### Design Principles

- **Mobile-first**: Player UI optimized for phones
- **High contrast**: Readable in party lighting
- **Large touch targets**: Minimum 44x44px
- **Minimal text**: Icons and colors over words
- **Instant feedback**: Visual response to all actions
- **Accessibility**: Color is not the only indicator

---

## 🚀 Future Modes (Extensible System)

The mode system is designed to support any gameplay style. Here are planned modes:

### Mode #2: "Fast Buzz"
- **Objective**: Buzz in and verbally answer (no multiple choice)
- **Flow**: Players buzz → Master validates answer manually
- **Scoring**: +1 for correct, -1 for wrong (configurable)
- **Speed**: 10s per song

### Mode #3: "Text Input"
- **Objective**: Type artist and title
- **Flow**: Song plays → text input field → fuzzy matching
- **Scoring**: +2 for both, +1 for one correct
- **Speed**: 30s per song

### Mode #4: "Picture Round"
- **Objective**: Identify song from album cover + clip
- **Flow**: Show album art → play 5s clip → multiple choice
- **Visual**: Emphasizes visual memory
- **Speed**: 20s per song

### Mode #5: "Backwards Mode"
- **Objective**: Identify song played in reverse
- **Flow**: Reverse audio playback → text/choice answer
- **Challenge**: High difficulty
- **Speed**: 15s per song

### Mode #6: "Speed Round"
- **Objective**: Quick succession of 5s clips
- **Flow**: Rapid-fire songs → immediate buzz required
- **Scoring**: Bonus for speed
- **Speed**: 5s per song

### Mode #7: "Team Mode"
- **Objective**: Players form teams (2v2 or 3v3)
- **Flow**: Team members collaborate on answers
- **Scoring**: Shared team score
- **Social**: Encourages discussion

---

## 🗓 Development Roadmap

### Phase 1: MVP (Current)
- ✅ Basic room creation and joining
- ✅ QR code generation
- ✅ "Buzz + Choice" mode (fully functional)
- ✅ Local MP3 playback
- ✅ Real-time scoring
- ✅ Between-round scoreboard

### Phase 2: Polish & Persistence
- 🔲 WebSocket implementation (replace polling)
- 🔲 SQLite database (save playlists, game history)
- 🔲 Improved music library management
- 🔲 Player statistics tracking
- 🔲 Custom sound effects and animations

### Phase 3: Additional Modes
- 🔲 "Fast Buzz" mode
- 🔲 "Text Input" mode
- 🔲 Mode selection per round
- 🔲 Custom mode parameters per game

### Phase 4: Advanced Features
- 🔲 "Picture Round" mode
- 🔲 Team mode
- 🔲 Tournament bracket system
- 🔲 Spectator view
- 🔲 Export game results (PDF/CSV)

### Phase 5: Polish & UX
- 🔲 Themes and customization
- 🔲 Sound effects library
- 🔲 Achievement system
- 🔲 Player profiles and avatars
- 🔲 Mobile app packaging (Capacitor)

---

## 📝 Decision Log

Document all major product decisions here for future reference.

### ✅ Why Local MP3 Files Only?
**Decision**: Use local files instead of Spotify/YouTube integration for MVP

**Reasoning**:
- No API dependencies or rate limits
- Works 100% offline
- No authentication flow needed
- Simpler implementation
- Master owns the music library
- Can add streaming later without breaking architecture

### ✅ Why QR Code for Joining?
**Decision**: Use QR code instead of manual room code entry

**Reasoning**:
- Faster to join (one scan vs. typing 6 characters)
- Fewer errors (no typos)
- Better UX for party setting
- Still can fallback to manual IP entry if needed
- QR code can embed IP:PORT directly

### ✅ Why Buzzer Lockout?
**Decision**: Lock out players after wrong answer in Buzz + Choice mode

**Reasoning**:
- Prevents random guessing
- Rewards strategic buzzing (wait if unsure)
- Gives other players opportunity
- More engaging than unlimited attempts
- Maintains game pace

### ✅ Why 8 Player Maximum?
**Decision**: Limit rooms to 8 concurrent players

**Reasoning**:
- Keeps gameplay engaging (everyone gets chances)
- Easier scoreboard display
- Manageable for master to moderate
- Typical party size (4-8 people)
- Can increase later if needed

### ✅ Why No Mid-Game Joining?
**Decision**: Lock room once game starts

**Reasoning**:
- Fair scoring (everyone starts at 0)
- Simpler state management
- No mid-game disruption
- Clear game boundaries
- Players can join next game

### ✅ Why Master Cannot Play?
**Decision**: Master is pure moderator role

**Reasoning**:
- Avoids conflict of interest (controls music)
- Master manages technical issues
- Clearer role separation
- Better game moderation
- Can add "Master as Player" mode later

---

## 🎯 Open Questions

Track unresolved product questions here:

### Scoring & Penalties
- Should there be bonus points for perfect rounds (all songs correct)?
- Penalty for leaving mid-game?

### Music & Playback
- Allow master to adjust clip start time on-the-fly?
- Crossfade between songs?
- Support YouTube/Spotify in future?

### Modes & Customization
- Should players vote on which mode to play next?
- Allow mixing modes within a single round?

### Social Features
- In-game chat?
- Reaction emojis during gameplay?
- Post-game sharing (screenshot scoreboard)?

---

## 📚 Glossary

- **Master**: The host device (laptop) running the server and controlling music
- **Player**: Participant using mobile device to play the game
- **Room**: A game session instance (lobby + game)
- **Round**: One phase of gameplay using a specific mode
- **Mode**: Rule set defining gameplay mechanics
- **Song**: Single track played during a round
- **Buzz**: Action of locking in to answer
- **Lockout**: State where player cannot buzz for remainder of song
- **Clip**: Portion of song played (e.g., 15s from 0:30-0:45)
- **Playlist**: Collection of songs for a game session
- **QR Code**: Visual code containing room connection info

---

## 🔗 Related Documentation

- Technical Architecture: `/docs/00_ARCHITECTURE.md`
- Database Schema: `/docs/DATABASE.md`
- API Specification: `/docs/API.md`
- WebSocket Events: `/docs/WEBSOCKETS.md`
- Game State Machine: `/docs/GAME_STATE.md`
- UI Components: `/docs/UI_SPEC.md`

---

**Last Updated**: 2024-11-09  
**Version**: 1.0  
**Status**: Active Development (Phase 1)
