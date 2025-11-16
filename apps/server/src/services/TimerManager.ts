/**
 * Timer Manager Service
 *
 * Centralized timer management for game flow.
 * Handles song timers and answer timers with pause/resume capabilities.
 *
 * Responsibilities:
 * - Create and manage countdown timers
 * - Broadcast timer updates to clients
 * - Support pause/resume for manual validation modes
 * - Clean up timers on song/round end
 */

import type { Round, RoundSong } from '@blind-test/shared';
import { broadcastToRoom } from '../websocket/handler';
import { logger } from '../utils/logger';

const timerLogger = logger.child({ module: 'TimerManager' });

/**
 * Timer types for tracking different countdown scenarios
 */
export type TimerType = 'song' | 'answer';

/**
 * Callback signatures for timer events
 */
export type SongTimerCallback = (roomId: string, round: Round, songIndex: number) => Promise<void>;
export type AnswerTimerCallback = (roomId: string, round: Round, songIndex: number, playerId: string) => Promise<void>;

/**
 * Internal state for a song timer
 */
interface SongTimerState {
	type: 'song';
	timerId: NodeJS.Timeout;
	endTime: number;
	broadcastInterval: NodeJS.Timeout;
	paused: boolean;
	pausedTimeRemaining?: number;
	// Context for resume
	round: Round;
	songIndex: number;
	durationSeconds: number;
	onExpire: SongTimerCallback;
}

/**
 * Internal state for an answer timer
 */
interface AnswerTimerState {
	type: 'answer';
	timerId: NodeJS.Timeout;
	endTime: number;
	broadcastInterval: NodeJS.Timeout;
	playerId: string;
	// Context
	round: Round;
	songIndex: number;
	durationSeconds: number;
	onExpire: AnswerTimerCallback;
}

type TimerState = SongTimerState | AnswerTimerState;

/**
 * Timer Manager
 * Manages all game timers with support for pause/resume
 */
export class TimerManager {
	// Map of roomId → active timer
	private songTimers = new Map<string, SongTimerState>();
	private answerTimers = new Map<string, AnswerTimerState>();

	// ========================================================================
	// Song Timer Methods
	// ========================================================================

	/**
	 * Start a song timer with countdown broadcasts
	 *
	 * @param roomId - The room ID
	 * @param round - The current round (for context)
	 * @param songIndex - The song index
	 * @param durationSeconds - How long the timer should run
	 * @param onExpire - Callback when timer expires
	 */
	startSongTimer(
		roomId: string,
		round: Round,
		songIndex: number,
		durationSeconds: number,
		onExpire: SongTimerCallback
	): void {
		// Clear any existing song timer for this room
		this.clearSongTimer(roomId);

		const endTime = Date.now() + (durationSeconds * 1000);

		// Create main timer
		const timerId = setTimeout(async () => {
			timerLogger.info('Song timer expired', { roomId, songIndex, durationSeconds });

			// Stop broadcasting
			const timer = this.songTimers.get(roomId);
			if (timer?.broadcastInterval) {
				clearInterval(timer.broadcastInterval);
			}

			// Execute callback
			await onExpire(roomId, round, songIndex);

			// Clean up
			this.songTimers.delete(roomId);
		}, durationSeconds * 1000);

		// Create broadcast interval (every second)
		const broadcastInterval = setInterval(() => {
			const timer = this.songTimers.get(roomId);
			if (!timer) {
				clearInterval(broadcastInterval);
				return;
			}

			const timeRemaining = Math.max(0, Math.ceil((timer.endTime - Date.now()) / 1000));

			broadcastToRoom(roomId, {
				type: 'timer:song',
				data: { timeRemaining },
			});

			// Stop broadcasting when timer reaches 0
			if (timeRemaining <= 0) {
				clearInterval(broadcastInterval);
			}
		}, 1000);

		// Store timer state
		this.songTimers.set(roomId, {
			type: 'song',
			timerId,
			endTime,
			broadcastInterval,
			paused: false,
			round,
			songIndex,
			durationSeconds,
			onExpire
		});

		timerLogger.debug('Song timer started', { roomId, songIndex, durationSeconds });
	}

	/**
	 * Pause the song timer (for manual validation)
	 * Preserves remaining time for resume
	 */
	pauseSongTimer(roomId: string): boolean {
		const timer = this.songTimers.get(roomId);
		if (!timer || timer.paused) {
			timerLogger.debug('Cannot pause song timer - not found or already paused', { roomId });
			return false;
		}

		// Calculate remaining time
		const timeRemaining = Math.max(0, Math.ceil((timer.endTime - Date.now()) / 1000));

		// Clear the timeout and interval
		clearTimeout(timer.timerId);
		clearInterval(timer.broadcastInterval);

		// Update state to paused
		timer.paused = true;
		timer.pausedTimeRemaining = timeRemaining;

		timerLogger.debug('Song timer paused', { roomId, timeRemaining });

		// Broadcast pause to clients
		broadcastToRoom(roomId, {
			type: 'game:paused',
			data: { timestamp: Date.now() }
		});

		return true;
	}

	/**
	 * Resume the song timer (after wrong answer in manual validation)
	 * Restarts with remaining time
	 */
	resumeSongTimer(roomId: string): boolean {
		const timer = this.songTimers.get(roomId);
		if (!timer || !timer.paused || timer.pausedTimeRemaining === undefined) {
			timerLogger.debug('Cannot resume song timer - not found or not paused', { roomId });
			return false;
		}

		const remainingTime = timer.pausedTimeRemaining;

		timerLogger.debug('Resuming song timer', { roomId, remainingTime });

		// Clear paused state
		timer.paused = false;
		delete timer.pausedTimeRemaining;

		// Restart timer with remaining time
		this.startSongTimer(
			roomId,
			timer.round,
			timer.songIndex,
			remainingTime,
			timer.onExpire
		);

		// Broadcast resume to clients
		broadcastToRoom(roomId, {
			type: 'game:resumed',
			data: { timestamp: Date.now() }
		});

		return true;
	}

	/**
	 * Clear the song timer for a room
	 */
	clearSongTimer(roomId: string): void {
		const timer = this.songTimers.get(roomId);
		if (timer) {
			clearTimeout(timer.timerId);
			clearInterval(timer.broadcastInterval);
			this.songTimers.delete(roomId);
			timerLogger.debug('Song timer cleared', { roomId });
		}
	}

	/**
	 * Get remaining time on song timer (0 if not active)
	 */
	getSongTimeRemaining(roomId: string): number {
		const timer = this.songTimers.get(roomId);
		if (!timer) return 0;

		if (timer.paused && timer.pausedTimeRemaining !== undefined) {
			return timer.pausedTimeRemaining;
		}

		return Math.max(0, Math.ceil((timer.endTime - Date.now()) / 1000));
	}

	// ========================================================================
	// Answer Timer Methods
	// ========================================================================

	/**
	 * Start an answer timer for a specific player
	 *
	 * @param roomId - The room ID
	 * @param round - The current round
	 * @param songIndex - The song index
	 * @param playerId - The player who is answering
	 * @param durationSeconds - How long they have to answer
	 * @param onExpire - Callback when timer expires
	 */
	startAnswerTimer(
		roomId: string,
		round: Round,
		songIndex: number,
		playerId: string,
		durationSeconds: number,
		onExpire: AnswerTimerCallback
	): void {
		// Clear any existing answer timer for this room
		this.clearAnswerTimer(roomId);

		const endTime = Date.now() + (durationSeconds * 1000);

		// Create main timer
		const timerId = setTimeout(async () => {
			timerLogger.info('Answer timer expired', { roomId, songIndex, playerId });

			// Stop broadcasting
			const timer = this.answerTimers.get(roomId);
			if (timer?.broadcastInterval) {
				clearInterval(timer.broadcastInterval);
			}

			// Execute callback
			await onExpire(roomId, round, songIndex, playerId);

			// Clean up
			this.answerTimers.delete(roomId);
		}, durationSeconds * 1000);

		// Create broadcast interval (every second)
		const broadcastInterval = setInterval(() => {
			const timer = this.answerTimers.get(roomId);
			if (!timer) {
				clearInterval(broadcastInterval);
				return;
			}

			const timeRemaining = Math.max(0, Math.ceil((timer.endTime - Date.now()) / 1000));

			broadcastToRoom(roomId, {
				type: 'timer:answer',
				data: { playerId, timeRemaining },
			});

			// Stop broadcasting when timer reaches 0
			if (timeRemaining <= 0) {
				clearInterval(broadcastInterval);
			}
		}, 1000);

		// Store timer state
		this.answerTimers.set(roomId, {
			type: 'answer',
			timerId,
			endTime,
			broadcastInterval,
			playerId,
			round,
			songIndex,
			durationSeconds,
			onExpire
		});

		timerLogger.debug('Answer timer started', { roomId, playerId, durationSeconds });
	}

	/**
	 * Clear the answer timer for a room
	 */
	clearAnswerTimer(roomId: string): void {
		const timer = this.answerTimers.get(roomId);
		if (timer) {
			clearTimeout(timer.timerId);
			clearInterval(timer.broadcastInterval);
			this.answerTimers.delete(roomId);
			timerLogger.debug('Answer timer cleared', { roomId });
		}
	}

	/**
	 * Get remaining time on answer timer (0 if not active)
	 */
	getAnswerTimeRemaining(roomId: string): number {
		const timer = this.answerTimers.get(roomId);
		if (!timer) return 0;
		return Math.max(0, Math.ceil((timer.endTime - Date.now()) / 1000));
	}

	/**
	 * Get the player ID for the active answer timer
	 */
	getAnswerTimerPlayerId(roomId: string): string | null {
		const timer = this.answerTimers.get(roomId);
		return timer?.playerId || null;
	}

	// ========================================================================
	// Cleanup Methods
	// ========================================================================

	/**
	 * Clear all timers for a room (both song and answer)
	 */
	clearAllTimers(roomId: string): void {
		this.clearSongTimer(roomId);
		this.clearAnswerTimer(roomId);
		timerLogger.debug('All timers cleared for room', { roomId });
	}

	/**
	 * Clear all timers globally (for shutdown/testing)
	 */
	clearAll(): void {
		// Clear all song timers
		for (const [roomId] of this.songTimers) {
			this.clearSongTimer(roomId);
		}

		// Clear all answer timers
		for (const [roomId] of this.answerTimers) {
			this.clearAnswerTimer(roomId);
		}

		timerLogger.info('All timers cleared globally');
	}
}

// Export singleton instance
export const timerManager = new TimerManager();
