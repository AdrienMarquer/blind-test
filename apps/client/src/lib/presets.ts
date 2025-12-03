/**
 * Game Mode Helpers
 */

import { DEFAULT_SONG_DURATION, type RoundConfig, type MediaType } from '@blind-test/shared';

/**
 * Available game mode types
 */
export type GameModeType = 'fast_buzz' | 'buzz_and_choice';

export interface GameModeInfo {
  id: GameModeType;
  name: string;
  description: string;
  icon: string;
}

/**
 * Available game modes
 */
export const gameModes: GameModeInfo[] = [
  {
    id: 'fast_buzz',
    name: 'Buzz éclair',
    description: 'Premier à buzzer peut répondre',
    icon: '⚡',
  },
  {
    id: 'buzz_and_choice',
    name: 'QCM',
    description: 'Choix multiples après buzz',
    icon: '📝',
  },
];

/**
 * Media type info
 */
export interface MediaTypeInfo {
  id: MediaType;
  name: string;
  icon: string;
}

/**
 * Available media types
 */
export const mediaTypes: MediaTypeInfo[] = [
  { id: 'music', name: 'Musique', icon: '🎵' },
  { id: 'picture', name: 'Image', icon: '🖼️' },
  { id: 'video', name: 'Vidéo', icon: '🎬' },
  { id: 'text_question', name: 'Question', icon: '❓' },
];

/**
 * Create a default round config for a given mode type
 */
export function createDefaultRound(modeType: GameModeType, mediaType: MediaType = 'music'): RoundConfig {
  const baseConfig: RoundConfig = {
    modeType,
    mediaType,
    songFilters: {
      songCount: 5,
    },
    params: {
      songDuration: DEFAULT_SONG_DURATION,
      answerTimer: modeType === 'fast_buzz' ? 5 : 8,
      audioPlayback: 'master',
      penaltyEnabled: false,
      penaltyAmount: 1,
    },
  };

  if (modeType === 'buzz_and_choice') {
    baseConfig.params = {
      ...baseConfig.params,
      numChoices: 4,
      pointsTitle: 1,
      pointsArtist: 1,
    };
  }

  return baseConfig;
}

/**
 * Get default rounds for a new game (1 Buzz éclair + 1 QCM)
 */
export function getDefaultRounds(): RoundConfig[] {
  return [createDefaultRound('fast_buzz'), createDefaultRound('buzz_and_choice')];
}

/**
 * Get mode display name
 */
export function getModeDisplayName(modeType: string): string {
  const mode = gameModes.find((m) => m.id === modeType);
  return mode?.name || modeType;
}

/**
 * Get mode info
 */
export function getModeInfo(modeType: string): GameModeInfo | undefined {
  return gameModes.find((m) => m.id === modeType);
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
