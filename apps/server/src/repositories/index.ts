/**
 * Repository exports
 */

import { RoomRepository } from './RoomRepository';
import { PlayerRepository } from './PlayerRepository';

// Re-export classes
export { RoomRepository } from './RoomRepository';
export { PlayerRepository } from './PlayerRepository';

// Singleton instances for in-memory storage
export const roomRepository = new RoomRepository();
export const playerRepository = new PlayerRepository();
