# Game Modes

## Buzz + Multiple Choice (`buzz_and_choice`)

### Overview
Players race to buzz in first, then identify the artist and title from multiple choice options.

### Flow

```
Song starts playing
    │
    ▼
┌─────────────────────────────────────┐
│  Players can buzz at any time       │
│  (song continues playing)           │
└──────────────┬──────────────────────┘
               │
               ▼ First player buzzes
┌─────────────────────────────────────┐
│  Song PAUSES                        │
│  4 artist choices shown (6s timer)  │
└──────────────┬──────────────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
   WRONG ARTIST    CORRECT ARTIST
       │               │
       ▼               ▼
┌──────────────┐  ┌──────────────────────┐
│ Player is    │  │ SONG IS WON!         │
│ locked out   │  │ +1 point (artist)    │
│              │  │                      │
│ Song RESUMES │  │ 4 title choices      │
│ Others can   │  │ shown (6s timer)     │
│ buzz         │  │ (optional bonus)     │
└──────────────┘  └──────────┬───────────┘
                             │
                    ┌────────┼────────┐
                    ▼        ▼        ▼
               CORRECT   WRONG    TIMEOUT
               TITLE     TITLE
                    │        │        │
                    ▼        ▼        ▼
               +1 bonus   Keep      Keep
               point      artist    artist
                          point     point
                    │        │        │
                    └────────┴────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │   SONG ENDS    │
                    │ (winner found) │
                    └────────────────┘
```

### Rules

1. **Buzzing**
   - Any player can buzz while the song is playing
   - First player to buzz (by client timestamp) gets to answer
   - Locked out players cannot buzz again for this song

2. **Artist Question (First Question)**
   - 4 choices displayed, 6 seconds to answer
   - **Correct**: Player wins the song, gets +1 point, proceeds to title question
   - **Wrong**: Player is locked out, song resumes, others can buzz
   - **Timeout**: Player is locked out, song resumes, others can buzz

3. **Title Question (Bonus - Optional)**
   - Only shown if artist was correct
   - 4 choices displayed, 6 seconds to answer
   - **Correct**: +1 bonus point, song ends
   - **Wrong**: Keep artist point, song ends
   - **Timeout**: Keep artist point, song ends

4. **Song Ends When**
   - A player answers the artist correctly (they win, title is bonus)
   - All players are locked out (no winner)
   - Song timer expires (no winner)

### Points

| Action | Points |
|--------|--------|
| Correct artist | +1 |
| Correct title (after correct artist) | +1 (bonus) |
| Wrong answer | 0 (or penalty if enabled) |

### Key Behaviors

- **Song pauses on buzz**: When a player buzzes, the song pauses while they answer
- **Song resumes on wrong answer**: If the buzzing player answers wrong, the song resumes and others can try
- **Artist = Win condition**: Getting the artist right means you've won the song. The title question is purely for bonus points.
- **No second chances**: Once locked out, a player cannot buzz again for this song

### Configuration Options

| Parameter | Default | Description |
|-----------|---------|-------------|
| `songDuration` | 30s | How long the song plays before timeout |
| `answerTimer` | 6s | Time to answer each question |
| `numChoices` | 4 | Number of multiple choice options |
| `pointsArtist` | 1 | Points for correct artist |
| `pointsTitle` | 1 | Bonus points for correct title |
| `penaltyEnabled` | false | Enable penalty for wrong answers |
| `penaltyAmount` | 0 | Points deducted for wrong answer |
| `allowRebuzz` | true | (Reserved for future use) |

---

## Future Modes

### Classic Mode (Planned)
Traditional blind test where players type their answers freely.

### Speed Mode (Planned)
Fastest correct answer wins extra points.

### Team Mode (Planned)
Players compete in teams with shared buzzer.
