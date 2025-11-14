/**
 * Game State Manager - In-Memory Game State Storage
 *
 * Tracks active game sessions and their current state.
 * This is a temporary in-memory solution - will be persisted to DB in later phases.
 */

import type { GameSession, Round, RoundSong } from '@blind-test/shared';
import { logger } from '../utils/logger';

const stateLogger = logger.child({ module: 'GameState' });

interface ActiveGameState {
  session: GameSession;
  currentRound: Round;
  roomId: string;
}

class GameStateManager {
  private activeSessions = new Map<string, ActiveGameState>(); // sessionId -> state
  private roomSessions = new Map<string, string>(); // roomId -> sessionId

  /**
   * Register an active game session
   */
  setActiveSession(roomId: string, session: GameSession, currentRound: Round): void {
    const state: ActiveGameState = {
      session,
      currentRound,
      roomId,
    };

    this.activeSessions.set(session.id, state);
    this.roomSessions.set(roomId, session.id);

    stateLogger.debug('Registered session', { sessionId: session.id, roomId });
  }

  /**
   * Get active session by room ID
   */
  getSessionByRoom(roomId: string): ActiveGameState | null {
    const sessionId = this.roomSessions.get(roomId);
    if (!sessionId) return null;

    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Get active session by session ID
   */
  getSession(sessionId: string): ActiveGameState | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Get current round for a room
   */
  getCurrentRound(roomId: string): Round | null {
    const state = this.getSessionByRoom(roomId);
    return state?.currentRound || null;
  }

  /**
   * Get active session for a room
   */
  getActiveSession(roomId: string): GameSession | null {
    const state = this.getSessionByRoom(roomId);
    return state?.session || null;
  }

  /**
   * Update current round
   */
  updateRound(roomId: string, round: Round): void {
    const state = this.getSessionByRoom(roomId);
    if (state) {
      state.currentRound = round;
    }
  }

  /**
   * Get current song for a room
   */
  getCurrentSong(roomId: string): RoundSong | null {
    const round = this.getCurrentRound(roomId);
    if (!round) return null;

    return round.songs[round.currentSongIndex] || null;
  }

  /**
   * Remove session (when game ends)
   */
  removeSession(roomId: string): void {
    const sessionId = this.roomSessions.get(roomId);
    if (sessionId) {
      this.activeSessions.delete(sessionId);
      this.roomSessions.delete(roomId);
      stateLogger.debug('Removed session', { sessionId, roomId });
    }
  }

  /**
   * Check if room has active game
   */
  hasActiveGame(roomId: string): boolean {
    return this.roomSessions.has(roomId);
  }

  /**
   * Get all active session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this.activeSessions.keys());
  }
}

// Export singleton instance
export const gameStateManager = new GameStateManager();
