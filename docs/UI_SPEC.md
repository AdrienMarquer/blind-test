# Blind Test - UI/UX Specification

## 🎨 Design System

### Color Palette

```css
:root {
  /* Primary Colors */
  --color-primary: #3b82f6;      /* Blue - Primary actions */
  --color-primary-dark: #2563eb;
  --color-primary-light: #60a5fa;

  /* Secondary Colors */
  --color-secondary: #10b981;    /* Green - Success, correct */
  --color-secondary-dark: #059669;

  /* Status Colors */
  --color-waiting: #3b82f6;      /* Blue */
  --color-playing: #10b981;      /* Green */
  --color-paused: #f59e0b;       /* Amber */
  --color-finished: #6b7280;     /* Gray */

  /* Feedback Colors */
  --color-correct: #10b981;      /* Green */
  --color-wrong: #ef4444;        /* Red */
  --color-locked-out: #6b7280;   /* Gray */
  --color-active: #f59e0b;       /* Amber */

  /* Neutral Colors */
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f9fafb;
  --color-bg-tertiary: #f3f4f6;
  --color-text-primary: #1f2937;
  --color-text-secondary: #6b7280;
  --color-text-inverse: #ffffff;

  /* Border & Dividers */
  --color-border: #e5e7eb;
  --color-divider: #d1d5db;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}
```

### Typography

```css
:root {
  /* Font Families */
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace;

  /* Font Sizes */
  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.875rem;   /* 14px */
  --text-base: 1rem;     /* 16px */
  --text-lg: 1.125rem;   /* 18px */
  --text-xl: 1.25rem;    /* 20px */
  --text-2xl: 1.5rem;    /* 24px */
  --text-3xl: 1.875rem;  /* 30px */
  --text-4xl: 2.25rem;   /* 36px */
  --text-5xl: 3rem;      /* 48px */

  /* Font Weights */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
}
```

### Spacing

```css
:root {
  --space-1: 0.25rem;  /* 4px */
  --space-2: 0.5rem;   /* 8px */
  --space-3: 0.75rem;  /* 12px */
  --space-4: 1rem;     /* 16px */
  --space-5: 1.25rem;  /* 20px */
  --space-6: 1.5rem;   /* 24px */
  --space-8: 2rem;     /* 32px */
  --space-10: 2.5rem;  /* 40px */
  --space-12: 3rem;    /* 48px */
  --space-16: 4rem;    /* 64px */
}
```

### Border Radius

```css
:root {
  --radius-sm: 0.25rem;  /* 4px */
  --radius-md: 0.5rem;   /* 8px */
  --radius-lg: 0.75rem;  /* 12px */
  --radius-xl: 1rem;     /* 16px */
  --radius-full: 9999px; /* Fully rounded */
}
```

---

## 📱 Master View (Desktop/Laptop)

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  Header (Room Name, Status Badge)                   │
├──────────┬─────────────────────────────┬────────────┤
│          │                             │            │
│  Player  │      Main Content           │  Master    │
│   List   │      (varies by state)      │  Controls  │
│ (Sidebar)│                             │ (Sidebar)  │
│          │                             │            │
│  250px   │         Flexible            │   200px    │
│          │                             │            │
├──────────┴─────────────────────────────┴────────────┤
│  Footer (Progress, Timer)                           │
└─────────────────────────────────────────────────────┘
```

### Components

#### MasterHeader.svelte
**Purpose**: Room name and status

**Props**:
```typescript
{
  roomName: string;
  status: RoomStatus;
  roomCode: string;
}
```

**Layout**:
```svelte
<header class="master-header">
  <div class="room-info">
    <h1>{roomName}</h1>
    <span class="room-code">Code: {roomCode}</span>
  </div>
  <StatusBadge {status} />
</header>
```

---

#### MasterLobby.svelte
**Purpose**: Pre-game lobby screen

**Props**:
```typescript
{
  room: Room;
  players: Player[];
  onStartGame: () => void;
  onKickPlayer: (playerId: string) => void;
  onConfigure: () => void;
}
```

**Layout**:
```
┌────────────────────────────────────────┐
│                                        │
│           Large QR Code                │
│           (300x300px)                  │
│                                        │
│     Scan to join or visit:             │
│     http://192.168.1.100:3007/...      │
│                                        │
├────────────────────────────────────────┤
│  Players (0/8)                         │
│  ┌──────────────────────────────────┐ │
│  │ 👤 Alice               [Kick]   │ │
│  │ 👤 Bob                 [Kick]   │ │
│  │ 👤 Charlie             [Kick]   │ │
│  └──────────────────────────────────┘ │
├────────────────────────────────────────┤
│  [Configure Game]    [Start Game]     │
└────────────────────────────────────────┘
```

---

#### MasterGameView.svelte
**Purpose**: Active game screen

**Props**:
```typescript
{
  session: GameSession;
  currentSong: RoundSong;
  players: Player[];
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onEnd: () => void;
}
```

**Layout**:
```
┌─────────────────────────────────────────────────┐
│  🎵 Song 3 of 10                                │
│                                                  │
│  [Title and artist hidden during play]          │
│  [Revealed after song ends]                     │
│                                                  │
│  ┌─────────────────────────────────────────┐   │
│  │ ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░  60% (9s / 15s)  │   │
│  └─────────────────────────────────────────┘   │
│                                                  │
│  Current Player: [None / Alice (answering)]     │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

#### PlayerListSidebar.svelte
**Purpose**: Real-time player status

**Props**:
```typescript
{
  players: Player[];
  activePlayerId?: string;
  lockedOutPlayerIds: string[];
}
```

**Layout**:
```
┌──────────────────────┐
│  Players             │
├──────────────────────┤
│ 🟢 Alice      12 pts │  ← Active (answering)
│    [ANSWERING...]    │
├──────────────────────┤
│ 🔵 Bob        8 pts  │  ← Available to buzz
├──────────────────────┤
│ 🔴 Charlie    5 pts  │  ← Locked out
│    [LOCKED OUT]      │
├──────────────────────┤
│ 🟡 Dave       10 pts │  ← Disconnected
│    [OFFLINE]         │
└──────────────────────┘
```

**Status Indicators**:
- 🟢 Green: Active player (answering)
- 🔵 Blue: Available to buzz
- 🔴 Red: Locked out
- 🟡 Yellow: Disconnected
- ⚪ White: Waiting/idle

---

#### MasterControls.svelte
**Purpose**: Game control buttons

**Props**:
```typescript
{
  gameStatus: GameStatus;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onEnd: () => void;
}
```

**Layout**:
```
┌───────────────────┐
│  Master Controls  │
├───────────────────┤
│  [⏸ Pause]       │
│  [⏭ Skip Song]   │
│  [🛑 End Game]   │
├───────────────────┤
│  Volume:          │
│  ▓▓▓▓▓▓▓░░░ 70%  │
└───────────────────┘
```

---

#### RoundScoreboard.svelte
**Purpose**: Between-round scoreboard

**Props**:
```typescript
{
  round: Round;
  roundIndex: number;
  finalScores: FinalScore[];
  onContinue: () => void;
}
```

**Layout**:
```
┌───────────────────────────────────────────┐
│           Round 1 Complete!               │
├───────────────────────────────────────────┤
│  Rank  Player      Round   Total          │
│  🥇 1.  Alice        +5      15 pts       │
│  🥈 2.  Bob          +3      11 pts       │
│  🥉 3.  Charlie      +2       7 pts       │
│     4.  Dave         +1       5 pts       │
├───────────────────────────────────────────┤
│           [Continue to Round 2]           │
│                                            │
│           Auto-starting in 10s...          │
└───────────────────────────────────────────┘
```

---

## 📱 Player View (Mobile - Portrait)

### Layout Structure

```
┌─────────────────┐
│  Header         │
│  (Room, Status) │
├─────────────────┤
│                 │
│                 │
│   Main Content  │
│   (Full Height) │
│                 │
│                 │
├─────────────────┤
│  Footer         │
│  (Your Score)   │
└─────────────────┘
```

### Components

#### PlayerLobby.svelte
**Purpose**: Waiting room for players

**Props**:
```typescript
{
  room: Room;
  player: Player;
  players: Player[];
}
```

**Layout**:
```
┌─────────────────────────┐
│  Welcome, Alice!        │
│                         │
│  Waiting for game...    │
│                         │
│  Players: 3/8           │
│  ┌────────────────────┐ │
│  │ Alice (you)        │ │
│  │ Bob                │ │
│  │ Charlie            │ │
│  └────────────────────┘ │
│                         │
│  Game will start soon   │
└─────────────────────────┘
```

---

#### PlayerWaitingView.svelte
**Purpose**: Song playing, waiting to buzz

**Props**:
```typescript
{
  song: RoundSong;
  canBuzz: boolean;
  timeRemaining: number;
}
```

**Layout**:
```
┌─────────────────────────┐
│  ♫♫♫ Song Playing ♫♫♫  │
│                         │
│  ╔════════════════╗    │
│  ║                 ║    │
│  ║   Waveform      ║    │
│  ║   Animation     ║    │
│  ║                 ║    │
│  ╚════════════════╝    │
│                         │
│  ┌───────────────────┐ │
│  │                   │ │
│  │    🔔 BUZZ!      │ │  ← Large button (120px height)
│  │                   │ │
│  └───────────────────┘ │
│                         │
│  Time: 9s remaining     │
└─────────────────────────┘
```

**Button States**:
- **Enabled**: Large, bright, pulsing animation
- **Disabled (locked out)**: Grayed out, "LOCKED OUT" text
- **Disabled (someone else active)**: "Alice is answering..."

---

#### PlayerAnswerView.svelte
**Purpose**: Active player selecting answer

**Props**:
```typescript
{
  question: string;
  choices: string[];
  timeRemaining: number;
  onSubmit: (choice: string) => void;
}
```

**Layout**:
```
┌─────────────────────────┐
│  Select the song title: │
│                         │
│  ⏱ 4s remaining         │
│                         │
│  ┌───────────────────┐ │
│  │  Thriller         │ │  ← 60px height each
│  └───────────────────┘ │
│  ┌───────────────────┐ │
│  │  Beat It          │ │
│  └───────────────────┘ │
│  ┌───────────────────┐ │
│  │  Billie Jean      │ │
│  └───────────────────┘ │
│  ┌───────────────────┐ │
│  │  Smooth Criminal  │ │
│  └───────────────────┘ │
└─────────────────────────┘
```

**Interaction**:
- Tap to select
- Selected choice highlights immediately
- Submits automatically on tap
- Visual feedback (green checkmark or red X)

---

#### PlayerLockedOutView.svelte
**Purpose**: Player is locked out

**Props**:
```typescript
{
  reason: string;
  activePlayerName?: string;
  pointsKept?: number;
}
```

**Layout**:
```
┌─────────────────────────┐
│  🔒 LOCKED OUT          │
│                         │
│  You selected the       │
│  wrong title            │
│                         │
│  Alice is now           │
│  answering...           │
│                         │
│  ┌───────────────────┐ │
│  │  Alice    [●●○]   │ │  ← Animated dots
│  └───────────────────┘ │
│                         │
│  Points kept: +1        │
└─────────────────────────┘
```

---

#### PlayerScoreboard.svelte
**Purpose**: Personal scoreboard (minimized during play)

**Props**:
```typescript
{
  player: Player;
  rankings: FinalScore[];
}
```

**Layout (Collapsed)**:
```
┌─────────────────────────┐
│  Your Score: 12 pts     │
│  Rank: 2nd of 4         │
│  [Tap to expand]        │
└─────────────────────────┘
```

**Layout (Expanded)**:
```
┌─────────────────────────┐
│  1. Alice     15 pts    │
│  2. You       12 pts ←  │
│  3. Charlie    7 pts    │
│  4. Dave       5 pts    │
└─────────────────────────┘
```

---

#### FeedbackOverlay.svelte
**Purpose**: Instant feedback on answer

**Props**:
```typescript
{
  isCorrect: boolean;
  pointsAwarded: number;
  message?: string;
}
```

**Animation**:
```
Correct:
┌─────────────────────────┐
│                         │
│        ✓✓✓✓✓           │
│                         │
│      CORRECT!           │
│        +1 pt            │
│                         │
└─────────────────────────┘
Fade in → hold 1s → fade out

Wrong:
┌─────────────────────────┐
│                         │
│        ✗✗✗✗✗           │
│                         │
│       WRONG!            │
│                         │
└─────────────────────────┘
Shake animation → fade out
```

---

## 🎨 Component Library

### Shared Components

#### StatusBadge.svelte
**Purpose**: Show room/game status

**Props**:
```typescript
{
  status: 'lobby' | 'playing' | 'paused' | 'finished';
  size?: 'sm' | 'md' | 'lg';
}
```

**Variants**:
```svelte
<StatusBadge status="lobby" />     <!-- Blue pill -->
<StatusBadge status="playing" />   <!-- Green pill -->
<StatusBadge status="paused" />    <!-- Amber pill -->
<StatusBadge status="finished" />  <!-- Gray pill -->
```

---

#### Timer.svelte
**Purpose**: Countdown timer

**Props**:
```typescript
{
  duration: number;      // Total seconds
  remaining: number;     // Seconds left
  type?: 'song' | 'answer';
  showProgress?: boolean;
}
```

**Variants**:
```svelte
<!-- Circular progress -->
<Timer type="answer" showProgress={true} />

<!-- Linear bar -->
<Timer type="song" showProgress={false} />
```

---

#### QRCode.svelte
**Purpose**: Display QR code for joining

**Props**:
```typescript
{
  url: string;
  size?: number;  // Default: 300
}
```

**Usage**:
```svelte
<QRCode
  url="http://192.168.1.100:3007/player/abc123"
  size={300}
/>
```

---

#### ProgressBar.svelte
**Purpose**: Visual progress indicator

**Props**:
```typescript
{
  current: number;
  total: number;
  label?: string;
}
```

**Example**:
```svelte
<ProgressBar current={3} total={10} label="Song" />
<!-- Renders: "Song 3 / 10" with progress bar -->
```

---

## 🎭 Animations & Transitions

### Page Transitions

```css
/* Slide in from right */
.page-enter {
  transform: translateX(100%);
  opacity: 0;
}

.page-enter-active {
  transform: translateX(0);
  opacity: 1;
  transition: all 300ms ease-out;
}

.page-exit {
  transform: translateX(0);
  opacity: 1;
}

.page-exit-active {
  transform: translateX(-100%);
  opacity: 0;
  transition: all 300ms ease-in;
}
```

### Button Pulse (Buzz Button)

```css
@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 0 0 10px rgba(59, 130, 246, 0);
  }
}

.buzz-button:not(:disabled) {
  animation: pulse 2s infinite;
}
```

### Feedback Shake

```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); }
  20%, 40%, 60%, 80% { transform: translateX(10px); }
}

.wrong-answer {
  animation: shake 0.5s;
}
```

### Score Count-Up

```typescript
// Animate score changes
function animateScore(from: number, to: number, duration: number = 500) {
  const startTime = performance.now();
  const difference = to - from;

  function update() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const current = from + (difference * easeOutQuad(progress));

    displayScore(Math.round(current));

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

function easeOutQuad(t: number): number {
  return t * (2 - t);
}
```

---

## ♿ Accessibility

### Touch Targets
- Minimum size: **44x44px** (Apple HIG)
- Spacing: **8px** between interactive elements

### Color Contrast
- Text: **4.5:1** minimum (WCAG AA)
- Large text: **3:1** minimum
- Interactive elements: **3:1** minimum

### Keyboard Navigation
- Tab order follows visual flow
- All interactive elements focusable
- Visible focus indicators
- Escape key dismisses modals

### Screen Reader Support
```svelte
<!-- Semantic HTML -->
<button aria-label="Buzz to answer">
  🔔 BUZZ!
</button>

<!-- Live regions for updates -->
<div aria-live="polite" aria-atomic="true">
  {playerName} is now answering
</div>

<!-- Status updates -->
<div role="status">
  {timeRemaining} seconds remaining
</div>
```

---

## 📐 Responsive Breakpoints

```css
/* Mobile (default) */
@media (max-width: 767px) {
  /* Player view optimized */
}

/* Tablet */
@media (min-width: 768px) and (max-width: 1023px) {
  /* Hybrid view */
}

/* Desktop (Master view) */
@media (min-width: 1024px) {
  /* Three-column layout */
}

/* Large Desktop */
@media (min-width: 1440px) {
  /* Max content width: 1400px */
}
```

---

**Last Updated**: 2024-11-09
**Version**: 1.0
