/**
 * Repository exports
 */

import { RoomRepository } from './RoomRepository';
import { PlayerRepository } from './PlayerRepository';
import { SongRepository } from './SongRepository';
import { GameSessionRepository } from './GameSessionRepository';
import { ArtistRepository } from './ArtistRepository';

// Re-export classes
export { RoomRepository } from './RoomRepository';
export { PlayerRepository } from './PlayerRepository';
export { SongRepository } from './SongRepository';
export { GameSessionRepository } from './GameSessionRepository';
export { ArtistRepository } from './ArtistRepository';

// Singleton instances for SQLite storage
export const roomRepository = new RoomRepository();
export const playerRepository = new PlayerRepository();
export const songRepository = new SongRepository();
export const gameSessionRepository = new GameSessionRepository();
export const artistRepository = new ArtistRepository();
