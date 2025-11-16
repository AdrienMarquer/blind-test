/**
 * Game Presets - Pre-configured multi-round games
 */

import { DEFAULT_SONG_DURATION, type RoundConfig } from '@blind-test/shared';

export interface GamePreset {
  id: string;
  name: string;
  description: string;
  rounds: RoundConfig[];
}

/**
 * Quick Game - 3 rounds of fast-paced buzzer action
 * Perfect for a quick 10-15 minute game session
 */
const quickGame: GamePreset = {
  id: 'quick',
  name: 'Session express',
  description: '3 manches nerveuses au buzzer (10-15 minutes)',
  rounds: [
    {
      modeType: 'fast_buzz',
      mediaType: 'music',
      songFilters: {
        songCount: 5,
      },
      params: {
        songDuration: DEFAULT_SONG_DURATION,
        answerTimer: 5,
        audioPlayback: 'master',
      },
    },
    {
      modeType: 'fast_buzz',
      mediaType: 'music',
      songFilters: {
        songCount: 5,
      },
      params: {
        songDuration: DEFAULT_SONG_DURATION,
        answerTimer: 5,
        audioPlayback: 'master',
      },
    },
    {
      modeType: 'buzz_and_choice',
      mediaType: 'music',
      songFilters: {
        songCount: 5,
      },
      params: {
        songDuration: DEFAULT_SONG_DURATION,
        answerTimer: 10,
        audioPlayback: 'master',
        numChoices: 4,
        pointsTitle: 1,
        pointsArtist: 1,
      },
    },
  ],
};

/**
 * Classic Game - 5 rounds mixing different game modes
 * A complete 20-30 minute game experience with variety
 */
const classicGame: GamePreset = {
  id: 'classic',
  name: 'Classique',
  description: '5 manches variées pour 20-30 minutes de jeu',
  rounds: [
    {
      modeType: 'buzz_and_choice',
      mediaType: 'music',
      songFilters: {
        songCount: 5,
      },
      params: {
        songDuration: DEFAULT_SONG_DURATION,
        answerTimer: 10,
        audioPlayback: 'master',
        numChoices: 4,
        pointsTitle: 1,
        pointsArtist: 1,
      },
    },
    {
      modeType: 'fast_buzz',
      mediaType: 'music',
      songFilters: {
        songCount: 5,
      },
      params: {
        songDuration: DEFAULT_SONG_DURATION,
        answerTimer: 5,
        audioPlayback: 'master',
      },
    },
    {
      modeType: 'text_input',
      mediaType: 'music',
      songFilters: {
        songCount: 5,
      },
      params: {
        songDuration: DEFAULT_SONG_DURATION,
        answerTimer: 15,
        audioPlayback: 'master',
        fuzzyMatch: true,
        levenshteinDistance: 2,
      },
    },
    {
      modeType: 'buzz_and_choice',
      mediaType: 'music',
      songFilters: {
        songCount: 5,
      },
      params: {
        songDuration: DEFAULT_SONG_DURATION,
        answerTimer: 8,
        audioPlayback: 'master',
        numChoices: 4,
        pointsTitle: 2,
        pointsArtist: 2,
      },
    },
    {
      modeType: 'fast_buzz',
      mediaType: 'music',
      songFilters: {
        songCount: 5,
      },
      params: {
        songDuration: DEFAULT_SONG_DURATION,
        answerTimer: 5,
        audioPlayback: 'master',
      },
    },
  ],
};

/**
 * All available game presets
 */
export const gamePresets: GamePreset[] = [quickGame, classicGame];

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): GamePreset | undefined {
  return gamePresets.find((preset) => preset.id === id);
}

/**
 * Get mode display name
 */
export function getModeDisplayName(modeType: string): string {
  const names: Record<string, string> = {
    buzz_and_choice: 'Buzz + QCM',
    fast_buzz: 'Buzz éclair',
    text_input: 'Réponse texte',
    timed_answer: 'Réponse chronométrée',
  };
  return names[modeType] || modeType;
}

/**
 * Get media type display name
 */
export function getMediaDisplayName(mediaType: string): string {
  const names: Record<string, string> = {
    music: 'Musique',
    picture: 'Image',
    video: 'Vidéo',
    text_question: 'Question texte',
  };
  return names[mediaType] || mediaType;
}
