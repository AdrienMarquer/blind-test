/**
 * Room Cleanup Service
 * Automatically deletes rooms older than 3 days at midnight every day
 */

import { RoomRepository } from '../repositories/RoomRepository';
import { logger } from '../utils/logger';

const cleanupLogger = logger.child({ module: 'RoomCleanup' });

const DAYS_TO_KEEP = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calculate milliseconds until next midnight
 */
function getMillisecondsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0); // Next midnight
  return midnight.getTime() - now.getTime();
}

class RoomCleanupService {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private roomRepository: RoomRepository;

  constructor() {
    this.roomRepository = new RoomRepository();
  }

  /**
   * Run the cleanup task
   */
  private async runCleanup(): Promise<void> {
    try {
      cleanupLogger.info('Starting room cleanup');
      const deletedCount = await this.roomRepository.deleteOlderThan(DAYS_TO_KEEP);
      cleanupLogger.info(`Room cleanup completed`, { deletedCount, daysThreshold: DAYS_TO_KEEP });
    } catch (error) {
      cleanupLogger.error('Room cleanup failed', { error });
    }
  }

  /**
   * Start the cleanup scheduler
   * - Schedules first run at midnight
   * - Repeats every 24 hours after that
   */
  start(): void {
    const msUntilMidnight = getMillisecondsUntilMidnight();
    const nextRun = new Date(Date.now() + msUntilMidnight);

    cleanupLogger.info('Room cleanup service starting', {
      nextRun: nextRun.toISOString(),
      msUntilMidnight,
      daysThreshold: DAYS_TO_KEEP,
    });

    // Schedule first run at midnight
    this.timeoutId = setTimeout(() => {
      this.runCleanup();

      // Then repeat every 24 hours
      this.intervalId = setInterval(() => {
        this.runCleanup();
      }, MS_PER_DAY);
    }, msUntilMidnight);
  }

  /**
   * Stop the cleanup scheduler
   */
  stop(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    cleanupLogger.info('Room cleanup service stopped');
  }
}

export const roomCleanupService = new RoomCleanupService();
