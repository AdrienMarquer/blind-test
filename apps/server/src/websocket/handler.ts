/**
 * Elysia WebSocket Handler
 * Handles real-time communication for rooms using Elysia's native WebSocket support
 */

import type { ServerWebSocket } from 'bun';
import { roomRepository, playerRepository } from '../repositories';
import type { Player, Room, ClientMessage, ServerMessage } from '@blind-test/shared';
import { gameService } from '../services/GameService';
import { gameStateManager } from '../services/GameStateManager';
import { AuthService } from '../services/AuthService';
import { logger } from '../utils/logger';
import { timerManager } from '../services/TimerManager';

const wsLogger = logger.child({ module: 'WebSocket' });

// Store active connections per room
const roomConnections = new Map<string, Set<ServerWebSocket<{ roomId: string; playerId?: string }>>>();

/**
 * Type-safe helper to send ServerMessage to WebSocket
 */
function sendMessage(ws: ServerWebSocket<any>, message: ServerMessage) {
  ws.send(JSON.stringify(message));
}

export async function handleWebSocket(ws: ServerWebSocket<{ roomId: string; playerId?: string; token?: string }>) {
  // Extract roomId from ws.data which contains the route params
  const roomId = ws.data?.roomId;
  const playerId = ws.data?.playerId;

  if (!roomId) {
    wsLogger.error('WebSocket connection missing roomId');
    ws.close();
    return;
  }

  // Store roomId in ws.data for later use
  if (!ws.data) {
    ws.data = { roomId };
  } else {
    ws.data.roomId = roomId;
  }

  // Add to room connections
  if (!roomConnections.has(roomId)) {
    roomConnections.set(roomId, new Set());
  }
  roomConnections.get(roomId)!.add(ws);

  wsLogger.info('Client connected', { roomId, playerId: playerId || 'new' });

  // Send typed ServerMessage
  sendMessage(ws, {
    type: 'connected',
    data: { roomId }
  });

  // If playerId is provided, try to reconnect the player automatically
  if (playerId) {
    await handlePlayerReconnect(ws, roomId, playerId);
  }
}

export function handleMessage(
  ws: ServerWebSocket<{ roomId: string; playerId?: string }>,
  message: string
) {
  // Extract roomId with single source of truth
  const roomId = ws.data?.roomId;

  if (!roomId) {
    wsLogger.error('Message received without roomId');
    sendMessage(ws, {
      type: 'error',
      data: { message: 'Connection not properly initialized' }
    });
    return;
  }

  try {
    // Parse as typed ClientMessage
    const parsed = JSON.parse(message) as ClientMessage;

    // Handle messages using discriminated union
    switch (parsed.type) {
      case 'state:sync':
        handleStateSync(ws, roomId);
        break;
      case 'player:join':
        handlePlayerJoin(ws, roomId, parsed.data);
        break;
      case 'player:leave':
        handlePlayerLeave(ws, roomId);
        break;
      case 'player:kick':
        handlePlayerKick(ws, roomId, parsed.data);
        break;
      case 'player:buzz':
        handlePlayerBuzz(ws, roomId, parsed.data);
        break;
      case 'player:answer':
        handlePlayerAnswer(ws, roomId, parsed.data);
        break;
      case 'game:pause':
        handleGamePause(ws, roomId);
        break;
      case 'game:resume':
        handleGameResume(ws, roomId);
        break;
      case 'game:restart':
        handleGameRestart(ws, roomId);
        break;
      default:
        // Type exhaustiveness check - TypeScript will error if we miss a case
        const _exhaustive: never = parsed;
        wsLogger.warn('Unknown message type received', { type: (parsed as any).type });
    }
  } catch (error) {
    wsLogger.error('Failed to handle message', error, { roomId });
    sendMessage(ws, {
      type: 'error',
      data: { message: 'Invalid message format' }
    });
  }
}

export function handleClose(ws: ServerWebSocket<{ roomId: string; playerId?: string }>) {
  // Extract roomId with fallback
  const roomId = ws.data?.roomId || ws.data?.params?.roomId;
  const playerId = ws.data?.playerId;

  if (!roomId) {
    wsLogger.debug('Connection closed without roomId');
    return;
  }

  // Remove from room connections
  const connections = roomConnections.get(roomId);
  if (connections) {
    connections.delete(ws);
    if (connections.size === 0) {
      roomConnections.delete(roomId);
    }
  }

  wsLogger.info('Client disconnected', { roomId, playerId });

  // Handle player disconnection
  if (playerId) {
    handlePlayerDisconnect(roomId, playerId);
  }
}

// Helper functions

async function handleStateSync(ws: ServerWebSocket<{ roomId: string; playerId?: string }>, roomId: string) {
  try {
    const room = await roomRepository.findById(roomId);
    const players = await playerRepository.findByRoom(roomId);

    sendMessage(ws, {
      type: 'state:synced',
      data: { room, players }
    });
  } catch (error) {
    wsLogger.error('State sync failed', error, { roomId });
    sendMessage(ws, {
      type: 'error',
      data: { message: 'Failed to sync state' }
    });
  }
}

async function handlePlayerJoin(
  ws: ServerWebSocket<{ roomId: string; playerId?: string }>,
  roomId: string,
  data: { name: string }
) {
  try {
    const room = await roomRepository.findById(roomId);
    if (!room) {
      sendMessage(ws, {
        type: 'error',
        data: { code: 'ROOM_NOT_FOUND', message: 'Room not found' }
      });
      return;
    }

    // Check if room is full
    const playerCount = await playerRepository.countConnected(roomId);
    if (playerCount >= room.maxPlayers) {
      sendMessage(ws, {
        type: 'error',
        data: { code: 'ROOM_FULL', message: 'Room is full' }
      });
      return;
    }

    // Check if game already started
    if (room.status !== 'lobby') {
      sendMessage(ws, {
        type: 'error',
        data: { code: 'GAME_STARTED', message: 'Cannot join - game already in progress' }
      });
      return;
    }

    // Check for duplicate name
    const existing = await playerRepository.findByRoomAndName(roomId, data.name);
    if (existing) {
      sendMessage(ws, {
        type: 'error',
        data: { code: 'DUPLICATE_NAME', message: 'Name already taken in this room' }
      });
      return;
    }

    // Create player
    const player = await playerRepository.create({
      roomId,
      name: data.name,
      role: 'player',
    });

    // Store player ID in WebSocket data
    ws.data.playerId = player.id;

    // Send confirmation to joining player
    sendMessage(ws, {
      type: 'player:joined',
      data: { player, room }
    });

    // Broadcast to others in the room
    broadcastToRoom(roomId, {
      type: 'player:joined',
      data: { player, room }
    }, ws);

    wsLogger.info('Player joined', { roomId, playerId: player.id, playerName: player.name });
  } catch (error) {
    sendMessage(ws, {
      type: 'error',
      data: { message: error instanceof Error ? error.message : 'Failed to join room' }
    });
  }
}

async function handlePlayerLeave(
  ws: ServerWebSocket<{ roomId: string; playerId?: string }>,
  roomId: string
) {
  const { playerId } = ws.data;
  if (!playerId) return;

  try {
    const player = await playerRepository.findById(playerId);
    if (!player) return;

    await playerRepository.delete(playerId);

    const remainingPlayers = await playerRepository.countConnected(roomId);

    broadcastToRoom(roomId, {
      type: 'player:left',
      data: {
        playerId: player.id,
        playerName: player.name,
        remainingPlayers
      }
    });

    wsLogger.info('Player left', { roomId, playerId: player.id, playerName: player.name });
  } catch (error) {
    wsLogger.error('Failed to handle player leave', error, { roomId, playerId });
  }
}

async function handlePlayerKick(
  ws: ServerWebSocket<{ roomId: string; playerId?: string; token?: string }>,
  roomId: string,
  data: { playerId: string }
) {
  // Verify master authorization
  if (!await isMaster(ws, roomId)) {
    sendMessage(ws, {
      type: 'error',
      data: { message: 'Unauthorized: Only the room master can kick players' }
    });
    return;
  }

  try {
    const player = await playerRepository.findById(data.playerId);
    if (!player) return;

    await playerRepository.delete(data.playerId);

    const remainingPlayers = await playerRepository.countConnected(roomId);

    // Notify kicked player
    sendToPlayer(roomId, data.playerId, {
      type: 'player:kicked',
      data: { reason: 'Removed by host' }
    });

    // Broadcast to others
    broadcastToRoom(roomId, {
      type: 'player:left',
      data: {
        playerId: player.id,
        playerName: player.name,
        remainingPlayers
      }
    });

    wsLogger.info('Player kicked', { roomId, playerId: player.id, playerName: player.name });
  } catch (error) {
    sendMessage(ws, {
      type: 'error',
      data: { message: 'Failed to kick player' }
    });
  }
}

async function handlePlayerDisconnect(roomId: string, playerId: string) {
  try {
    const player = await playerRepository.findById(playerId);
    if (player) {
      // Mark as disconnected
      await playerRepository.update(playerId, { connected: false });

      // Clean up any active game timers for this player
      await gameService.handlePlayerDisconnect(roomId, playerId);

      broadcastToRoom(roomId, {
        type: 'player:disconnected',
        data: {
          playerId: player.id,
          playerName: player.name,
          canRejoin: true
        }
      });
    }
  } catch (error) {
    wsLogger.error('Failed to handle disconnect', error, { roomId, playerId });
  }
}

/**
 * Handle player reconnection
 * Called when a WebSocket connection includes a playerId (returning player)
 */
async function handlePlayerReconnect(
  ws: ServerWebSocket<{ roomId: string; playerId?: string; token?: string }>,
  roomId: string,
  playerId: string
) {
  try {
    // Check if player exists and belongs to this room
    const player = await playerRepository.findById(playerId);

    if (!player) {
      wsLogger.info('Reconnect failed - player not found', { roomId, playerId });
      return; // Player will need to join as new player
    }

    if (player.roomId !== roomId) {
      wsLogger.info('Reconnect failed - player belongs to different room', {
        roomId,
        playerId,
        actualRoomId: player.roomId
      });
      return;
    }

    // Mark player as connected
    await playerRepository.update(playerId, { connected: true });

    // Store player ID in WebSocket data
    ws.data.playerId = playerId;

    wsLogger.info('Player reconnected', {
      roomId,
      playerId,
      playerName: player.name,
      wasConnected: player.connected
    });

    // Get updated room and player info
    const room = await roomRepository.findById(roomId);
    const updatedPlayer = await playerRepository.findById(playerId);

    if (!room || !updatedPlayer) {
      wsLogger.error('Failed to get room or player after reconnect', { roomId, playerId });
      return;
    }

    // Send confirmation to reconnecting player
    sendMessage(ws, {
      type: 'player:joined',
      data: { player: updatedPlayer, room }
    });

    // Broadcast reconnection to others in the room
    broadcastToRoom(roomId, {
      type: 'player:reconnected',
      data: {
        playerId: player.id,
        playerName: player.name
      }
    }, ws);

  } catch (error) {
    wsLogger.error('Failed to handle reconnect', error, { roomId, playerId });
  }
}

// Utility functions

/**
 * Validate if WebSocket connection has master authorization
 * Lightweight friendly-server auth - prevents accidental tampering
 */
async function isMaster(
  ws: ServerWebSocket<{ roomId: string; playerId?: string; token?: string }>,
  roomId: string
): Promise<boolean> {
  const providedToken = ws.data?.token;
  if (!providedToken) return false;

  const masterToken = await roomRepository.getMasterToken(roomId);
  if (!masterToken) return false;

  return AuthService.validateMasterToken(providedToken, masterToken);
}

export function broadcastToRoom(
  roomId: string,
  message: ServerMessage,
  excludeWs?: ServerWebSocket<{ roomId: string; playerId?: string }>
) {
  const connections = roomConnections.get(roomId);
  if (!connections) {
    wsLogger.warn('No connections found for room', { roomId, messageType: message.type });
    return;
  }

  const messageStr = JSON.stringify(message);
  let sentCount = 0;
  connections.forEach(ws => {
    if (ws !== excludeWs) {
      ws.send(messageStr);
      sentCount++;
    }
  });

  wsLogger.debug('Broadcast message to room', {
    roomId,
    messageType: message.type,
    totalConnections: connections.size,
    sentTo: sentCount
  });
}

function sendToPlayer(
  roomId: string,
  playerId: string,
  message: ServerMessage
) {
  const connections = roomConnections.get(roomId);
  if (!connections) return;

  const messageStr = JSON.stringify(message);
  connections.forEach(ws => {
    if (ws.data.playerId === playerId) {
      ws.send(messageStr);
    }
  });
}

/**
 * Broadcast job event to all connected clients
 * (Job events are global, not room-specific)
 */
export function broadcastJobEvent(message: ServerMessage) {
  const messageStr = JSON.stringify(message);
  let sentCount = 0;

  // Broadcast to all connections across all rooms
  roomConnections.forEach((connections) => {
    connections.forEach(ws => {
      ws.send(messageStr);
      sentCount++;
    });
  });

  wsLogger.debug('Broadcast job event', {
    messageType: message.type,
    sentTo: sentCount
  });
}

// ============================================================================
// Gameplay Event Handlers
// ============================================================================

async function handlePlayerBuzz(
  ws: ServerWebSocket<{ roomId: string; playerId?: string }>,
  roomId: string,
  data: { songIndex: number }
) {
  const { playerId } = ws.data;
  if (!playerId) {
    sendMessage(ws, {
      type: 'error',
      data: { message: 'Not authenticated' }
    });
    return;
  }

  try {
    wsLogger.debug('Player buzzed', { roomId, playerId, songIndex: data.songIndex });

    // Process buzz through GameService
    const accepted = await gameService.handleBuzz(roomId, data.songIndex, playerId);

    if (!accepted) {
      sendMessage(ws, {
        type: 'buzz:rejected',
        data: { playerId, reason: 'Cannot buzz at this time' }
      });
    }
  } catch (error) {
    wsLogger.error('Failed to process buzz', error, { roomId, playerId, songIndex: data.songIndex });
    sendMessage(ws, {
      type: 'error',
      data: { message: 'Failed to process buzz' }
    });
  }
}

async function handlePlayerAnswer(
  ws: ServerWebSocket<{ roomId: string; playerId?: string; token?: string }>,
  roomId: string,
  data: { songIndex: number; answerType: 'title' | 'artist'; value: string }
) {
  const { playerId } = ws.data;

  // Check if this is a master validation (value is 'correct' or 'wrong')
  const isMasterValidation = data.value === 'correct' || data.value === 'wrong';

  // For master validation, allow even without playerId (master uses token auth)
  // For regular answers, playerId is required
  if (!playerId && !isMasterValidation) {
    sendMessage(ws, {
      type: 'error',
      data: { message: 'Not authenticated' }
    });
    return;
  }

  try {
    wsLogger.debug('Player answered', { roomId, playerId, answerType: data.answerType, value: data.value, isMasterValidation });

    // Get current game state to populate answer fields
    const round = gameService.getCurrentRound(roomId);
    if (!round) {
      sendMessage(ws, {
        type: 'error',
        data: { message: 'No active round' }
      });
      return;
    }

    const song = round.songs[data.songIndex];
    if (!song) {
      sendMessage(ws, {
        type: 'error',
        data: { message: 'Invalid song index' }
      });
      return;
    }

    // FIX: Check if this is master validation
    // If answer value is 'correct' or 'wrong', this is master validation
    // Use the activePlayerId from the song instead of the WebSocket playerId
    let actualPlayerId: string;
    if (isMasterValidation) {
      // Master validation - must use activePlayerId
      if (!song.activePlayerId) {
        wsLogger.error('Master validation but no activePlayerId set', {
          roomId,
          songIndex: data.songIndex
        });
        sendMessage(ws, {
          type: 'error',
          data: { message: 'No active player to validate' }
        });
        return;
      }
      wsLogger.debug('Master validation detected - using activePlayerId', {
        roomId,
        masterId: playerId || 'master',
        actualPlayerId: song.activePlayerId,
        validation: data.value
      });
      actualPlayerId = song.activePlayerId;
    } else {
      // Regular player answer - use their playerId
      if (!playerId) {
        sendMessage(ws, {
          type: 'error',
          data: { message: 'Not authenticated - playerId required' }
        });
        return;
      }
      actualPlayerId = playerId;
    }

    // Calculate time to answer from buzz timestamp
    const buzzTimestamp = song.buzzTimestamps?.get(actualPlayerId) || Date.now();
    const timeToAnswer = Date.now() - buzzTimestamp;

    // Create answer object with all required fields
    const answer = {
      id: `answer_${Date.now()}_${actualPlayerId}`,
      playerId: actualPlayerId,
      roundId: round.id,
      songId: song.song.id,
      type: data.answerType,
      value: data.value,
      submittedAt: new Date(),
      timeToAnswer,
      isCorrect: false, // Will be set by validation
      pointsAwarded: 0, // Will be set by scoring
    };

    // Process answer through GameService
    await gameService.handleAnswer(roomId, actualPlayerId, answer);
  } catch (error) {
    wsLogger.error('Failed to process answer', error, { roomId, playerId });
    sendMessage(ws, {
      type: 'error',
      data: { message: 'Failed to process answer' }
    });
  }
}

async function handleGamePause(
  ws: ServerWebSocket<{ roomId: string; playerId?: string; token?: string }>,
  roomId: string
) {
  // Verify master authorization
  if (!await isMaster(ws, roomId)) {
    sendMessage(ws, {
      type: 'error',
      data: { message: 'Unauthorized: Only the room master can pause the game' }
    });
    return;
  }

  wsLogger.info('Game paused', { roomId });

  const paused = timerManager.pauseSongTimer(roomId);

  if (!paused) {
    broadcastToRoom(roomId, {
      type: 'game:paused',
      data: { timestamp: Date.now() }
    });
  }
}

async function handleGameResume(
  ws: ServerWebSocket<{ roomId: string; playerId?: string; token?: string }>,
  roomId: string
) {
  // Verify master authorization
  if (!await isMaster(ws, roomId)) {
    sendMessage(ws, {
      type: 'error',
      data: { message: 'Unauthorized: Only the room master can resume the game' }
    });
    return;
  }

  wsLogger.info('Game resumed', { roomId });

  const resumed = timerManager.resumeSongTimer(roomId);

  if (!resumed) {
    broadcastToRoom(roomId, {
      type: 'game:resumed',
      data: { timestamp: Date.now() }
    });
  }
}

async function handleGameRestart(
  ws: ServerWebSocket<{ roomId: string; playerId?: string; token?: string }>,
  roomId: string
) {
  // Verify master authorization
  if (!await isMaster(ws, roomId)) {
    sendMessage(ws, {
      type: 'error',
      data: { message: 'Unauthorized: Only the room master can restart the game' }
    });
    return;
  }

  wsLogger.info('Game restart requested', { roomId });

  try {
    // Clear any active timers
    timerManager.clearAllTimers(roomId);

    // Remove game session from state manager
    gameStateManager.removeSession(roomId);

    // Reset room status to lobby
    await roomRepository.update(roomId, { status: 'lobby' });

    // Reset all player scores
    const players = await playerRepository.findByRoom(roomId);
    for (const player of players) {
      if (player.role === 'player') {
        await playerRepository.update(player.id, {
          score: 0,
          roundScore: 0,
          isLockedOut: false
        });
      }
    }

    // Get updated room and players
    const updatedRoom = await roomRepository.findById(roomId);
    const updatedPlayers = await playerRepository.findByRoom(roomId);

    if (!updatedRoom) {
      wsLogger.error('Room not found after restart', { roomId });
      sendMessage(ws, {
        type: 'error',
        data: { message: 'Room not found after restart' }
      });
      return;
    }

    wsLogger.info('Game restarted - returning to lobby', {
      roomId,
      playerCount: updatedPlayers.length
    });

    // Broadcast to all clients to return to lobby
    broadcastToRoom(roomId, {
      type: 'game:restarted',
      data: {
        room: updatedRoom,
        players: updatedPlayers
      }
    });
  } catch (error) {
    wsLogger.error('Failed to restart game', error, { roomId });
    sendMessage(ws, {
      type: 'error',
      data: { message: 'Failed to restart game' }
    });
  }
}

