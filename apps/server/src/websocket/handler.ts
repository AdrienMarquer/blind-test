/**
 * Elysia WebSocket Handler
 * Handles real-time communication for rooms using Elysia's native WebSocket support
 */

import type { ServerWebSocket } from 'bun';
import { roomRepository, playerRepository } from '../repositories';
import type { Player, Room } from '@blind-test/shared';

// Store active connections per room
const roomConnections = new Map<string, Set<ServerWebSocket<{ roomId: string; playerId?: string }>>>();

export interface WebSocketMessage {
  type: string;
  data?: any;
}

export function handleWebSocket(ws: any) {
  // Extract roomId from ws.data which contains the route params
  const roomId = ws.data?.roomId;

  if (!roomId) {
    console.error('No roomId found in WebSocket connection');
    ws.close();
    return;
  }

  // Store roomId in ws.data for later use
  if (!ws.data) {
    ws.data = {};
  }
  ws.data.roomId = roomId;

  // Add to room connections
  if (!roomConnections.has(roomId)) {
    roomConnections.set(roomId, new Set());
  }
  roomConnections.get(roomId)!.add(ws);

  console.log(`WebSocket connected to room ${roomId}`);

  ws.send(JSON.stringify({
    type: 'connected',
    data: { roomId }
  }));
}

export function handleMessage(
  ws: ServerWebSocket<{ roomId: string; playerId?: string }>,
  message: string
) {
  const roomId = ws.data?.roomId;

  try {
    const parsed: WebSocketMessage = JSON.parse(message);

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
      case 'game:skip':
        handleGameSkip(ws, roomId);
        break;
      default:
        console.log(`Unknown message type: ${parsed.type}`);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Invalid message format' }
    }));
  }
}

export function handleClose(ws: ServerWebSocket<{ roomId: string; playerId?: string }>) {
  const { roomId, playerId } = ws.data;

  // Remove from room connections
  const connections = roomConnections.get(roomId);
  if (connections) {
    connections.delete(ws);
    if (connections.size === 0) {
      roomConnections.delete(roomId);
    }
  }

  console.log(`WebSocket disconnected from room ${roomId}`);

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

    ws.send(JSON.stringify({
      type: 'state:synced',
      data: { room, players }
    }));
  } catch (error) {
    console.error('[State Sync] Error:', error);
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Failed to sync state' }
    }));
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
      ws.send(JSON.stringify({
        type: 'error',
        data: { code: 'ROOM_NOT_FOUND', message: 'Room not found' }
      }));
      return;
    }

    // Check if room is full
    const playerCount = await playerRepository.countConnected(roomId);
    if (playerCount >= room.maxPlayers) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { code: 'ROOM_FULL', message: 'Room is full' }
      }));
      return;
    }

    // Check if game already started
    if (room.status !== 'lobby') {
      ws.send(JSON.stringify({
        type: 'error',
        data: { code: 'GAME_STARTED', message: 'Cannot join - game already in progress' }
      }));
      return;
    }

    // Check for duplicate name
    const existing = await playerRepository.findByRoomAndName(roomId, data.name);
    if (existing) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { code: 'DUPLICATE_NAME', message: 'Name already taken in this room' }
      }));
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
    ws.send(JSON.stringify({
      type: 'player:joined',
      data: { player, room }
    }));

    // Broadcast to others in the room
    broadcastToRoom(roomId, {
      type: 'player:joined',
      data: { player, room }
    }, ws);

    console.log(`Player ${player.name} joined room ${roomId}`);
  } catch (error) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: error instanceof Error ? error.message : 'Failed to join room' }
    }));
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

    console.log(`Player ${player.name} left room ${roomId}`);
  } catch (error) {
    console.error('Error handling player leave:', error);
  }
}

async function handlePlayerKick(
  ws: ServerWebSocket<{ roomId: string; playerId?: string }>,
  roomId: string,
  data: { playerId: string }
) {
  // TODO: Add role checking for master-only actions
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

    console.log(`Player ${player.name} kicked from room ${roomId}`);
  } catch (error) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Failed to kick player' }
    }));
  }
}

async function handlePlayerDisconnect(roomId: string, playerId: string) {
  try {
    const player = await playerRepository.findById(playerId);
    if (player) {
      // Mark as disconnected
      await playerRepository.update(playerId, { connected: false });

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
    console.error('Error handling disconnect:', error);
  }
}

// Utility functions

export function broadcastToRoom(
  roomId: string,
  message: WebSocketMessage,
  excludeWs?: ServerWebSocket<{ roomId: string; playerId?: string }>
) {
  const connections = roomConnections.get(roomId);
  if (!connections) return;

  const messageStr = JSON.stringify(message);
  connections.forEach(ws => {
    if (ws !== excludeWs) {
      ws.send(messageStr);
    }
  });
}

function sendToPlayer(
  roomId: string,
  playerId: string,
  message: WebSocketMessage
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
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Not authenticated' }
    }));
    return;
  }

  try {
    // TODO: Implement with GameService
    console.log(`[Buzz] Player ${playerId} buzzed on song ${data.songIndex}`);

    // Placeholder: Broadcast buzz to all clients
    broadcastToRoom(roomId, {
      type: 'player:buzzed',
      data: {
        playerId,
        songIndex: data.songIndex,
        timestamp: Date.now(),
      }
    });
  } catch (error) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Failed to process buzz' }
    }));
  }
}

async function handlePlayerAnswer(
  ws: ServerWebSocket<{ roomId: string; playerId?: string }>,
  roomId: string,
  data: { songIndex: number; answerType: 'title' | 'artist'; value: string }
) {
  const { playerId } = ws.data;
  if (!playerId) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Not authenticated' }
    }));
    return;
  }

  try {
    // TODO: Implement with GameService and ModeHandler
    console.log(`[Answer] Player ${playerId} answered ${data.answerType}: ${data.value}`);

    // Placeholder: Validate and broadcast result
    const isCorrect = false; // TODO: Real validation
    const pointsAwarded = 0;

    ws.send(JSON.stringify({
      type: 'answer:result',
      data: {
        isCorrect,
        pointsAwarded,
        answerType: data.answerType,
      }
    }));

    broadcastToRoom(roomId, {
      type: 'answer:submitted',
      data: {
        playerId,
        answerType: data.answerType,
        isCorrect,
        pointsAwarded,
      }
    }, ws);
  } catch (error) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Failed to process answer' }
    }));
  }
}

async function handleGamePause(
  ws: ServerWebSocket<{ roomId: string; playerId?: string }>,
  roomId: string
) {
  // TODO: Check if player is master
  console.log(`[Game] Pause requested for room ${roomId}`);

  broadcastToRoom(roomId, {
    type: 'game:paused',
    data: { timestamp: Date.now() }
  });
}

async function handleGameResume(
  ws: ServerWebSocket<{ roomId: string; playerId?: string }>,
  roomId: string
) {
  // TODO: Check if player is master
  console.log(`[Game] Resume requested for room ${roomId}`);

  broadcastToRoom(roomId, {
    type: 'game:resumed',
    data: { timestamp: Date.now() }
  });
}

async function handleGameSkip(
  ws: ServerWebSocket<{ roomId: string; playerId?: string }>,
  roomId: string
) {
  // TODO: Check if player is master
  console.log(`[Game] Skip requested for room ${roomId}`);

  broadcastToRoom(roomId, {
    type: 'game:skipped',
    data: { timestamp: Date.now() }
  });
}
