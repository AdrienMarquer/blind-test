/**
 * Game Presets - Pre-configured game setups for quick start
 */

import { DEFAULT_SONG_DURATION, type RoundConfig } from '@blind-test/shared';

export interface GamePreset {
	id: string;
	name: string;
	description: string;
	icon: string;
	gradient: string;
	estimatedMinutes: number;
	rounds: RoundConfig[];
	audioPlayback: 'master' | 'players' | 'all';
}

/**
 * Calculate total songs across all rounds
 */
export function getTotalSongs(rounds: RoundConfig[]): number {
	return rounds.reduce((sum, r) => sum + (r.songFilters?.songCount || 5), 0);
}

/**
 * Estimate game duration in minutes based on rounds
 * Assumes ~2 minutes per song (playback + answers + transition)
 */
export function estimateDuration(rounds: RoundConfig[]): number {
	const totalSongs = getTotalSongs(rounds);
	return Math.ceil(totalSongs * 2);
}

/**
 * Available game presets
 */
export const gamePresets: GamePreset[] = [
	{
		id: 'classic',
		name: 'Soirée classique',
		description: 'Le format idéal pour commencer',
		icon: '🎉',
		gradient: 'linear-gradient(135deg, #ef4c83, #f47a20)',
		estimatedMinutes: 20,
		audioPlayback: 'master',
		rounds: [
			{
				modeType: 'fast_buzz',
				mediaType: 'music',
				songFilters: { songCount: 5 },
				params: {
					songDuration: DEFAULT_SONG_DURATION,
					answerTimer: 5,
					penaltyEnabled: false,
					penaltyAmount: 1
				}
			},
			{
				modeType: 'buzz_and_choice',
				mediaType: 'music',
				songFilters: { songCount: 5 },
				params: {
					songDuration: DEFAULT_SONG_DURATION,
					answerTimer: 8,
					numChoices: 4,
					pointsTitle: 1,
					pointsArtist: 1,
					penaltyEnabled: false,
					penaltyAmount: 1
				}
			}
		]
	},
	{
		id: 'quick',
		name: 'Mode rapide',
		description: 'Une partie express',
		icon: '⚡',
		gradient: 'linear-gradient(135deg, #f8c027, #f47a20)',
		estimatedMinutes: 8,
		audioPlayback: 'master',
		rounds: [
			{
				modeType: 'fast_buzz',
				mediaType: 'music',
				songFilters: { songCount: 5 },
				params: {
					songDuration: 20,
					answerTimer: 4,
					penaltyEnabled: false,
					penaltyAmount: 1
				}
			}
		]
	},
	{
		id: 'marathon',
		name: 'Marathon musical',
		description: 'Pour les vrais fans',
		icon: '🏆',
		gradient: 'linear-gradient(135deg, #009daa, #0ec58f)',
		estimatedMinutes: 60,
		audioPlayback: 'master',
		rounds: [
			{
				modeType: 'fast_buzz',
				mediaType: 'music',
				songFilters: { songCount: 10 },
				params: {
					songDuration: DEFAULT_SONG_DURATION,
					answerTimer: 5,
					penaltyEnabled: false,
					penaltyAmount: 1
				}
			},
			{
				modeType: 'buzz_and_choice',
				mediaType: 'music',
				songFilters: { songCount: 10 },
				params: {
					songDuration: DEFAULT_SONG_DURATION,
					answerTimer: 8,
					numChoices: 4,
					pointsTitle: 1,
					pointsArtist: 1,
					penaltyEnabled: false,
					penaltyAmount: 1
				}
			},
			{
				modeType: 'fast_buzz',
				mediaType: 'music',
				songFilters: { songCount: 10 },
				params: {
					songDuration: DEFAULT_SONG_DURATION,
					answerTimer: 5,
					penaltyEnabled: false,
					penaltyAmount: 1
				}
			},
			{
				modeType: 'buzz_and_choice',
				mediaType: 'music',
				songFilters: { songCount: 10 },
				params: {
					songDuration: DEFAULT_SONG_DURATION,
					answerTimer: 8,
					numChoices: 4,
					pointsTitle: 1,
					pointsArtist: 1,
					penaltyEnabled: false,
					penaltyAmount: 1
				}
			}
		]
	}
];

/**
 * Default preset for master playing mode
 * Single QCM round since fast_buzz requires manual validation
 */
export const masterPlayingPreset: GamePreset = {
	id: 'master-playing',
	name: 'Mode joueur',
	description: 'Une manche QCM simple',
	icon: '🎮',
	gradient: 'linear-gradient(135deg, #ef4c83, #f8c027)',
	estimatedMinutes: 20,
	audioPlayback: 'all',
	rounds: [
		{
			modeType: 'buzz_and_choice',
			mediaType: 'music',
			songFilters: { songCount: 10 },
			params: {
				songDuration: DEFAULT_SONG_DURATION,
				answerTimer: 8,
				numChoices: 4,
				pointsTitle: 1,
				pointsArtist: 1,
				penaltyEnabled: false,
				penaltyAmount: 1
			}
		}
	]
};

/**
 * Get a preset adjusted for master playing mode
 * Converts fast_buzz rounds to buzz_and_choice since fast_buzz requires manual validation
 */
export function getPresetForMasterPlaying(preset: GamePreset): GamePreset {
	return {
		...preset,
		rounds: preset.rounds.map((round) => {
			if (round.modeType === 'fast_buzz') {
				return {
					...round,
					modeType: 'buzz_and_choice' as const,
					params: {
						...round.params,
						answerTimer: 8,
						numChoices: 4,
						pointsTitle: 1,
						pointsArtist: 1
					}
				};
			}
			return round;
		})
	};
}

/**
 * Deep clone rounds from a preset
 */
export function cloneRounds(rounds: RoundConfig[]): RoundConfig[] {
	return rounds.map((round) => ({
		...round,
		songFilters: round.songFilters ? { ...round.songFilters } : undefined,
		params: round.params ? { ...round.params } : undefined
	}));
}

/**
 * Get preset by ID
 */
export function getPresetById(id: string): GamePreset | undefined {
	return gamePresets.find((p) => p.id === id);
}
