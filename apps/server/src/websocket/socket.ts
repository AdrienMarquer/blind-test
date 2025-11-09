/**
 * Socket.io WebSocket Server
 * Handles real-time communication for rooms
 */

import { Server as SocketIOServer } from 'socket.io';
import { roomRepository, playerRepository } from '../repositories';
import type { Player, Room } from '@blind-test/shared';

export function setupWebSocket(httpServer: any) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*', // For development - restrict in production
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'], // Allow both transports for Bun compatibility
  });

  console.log('✓ WebSocket server initialized');

  // Room namespaces - dynamic namespaces for each room
  io.of(/^\/rooms\/[\w-]+$/).on('connection', async (socket) => {
    const namespace = socket.nsp;
    const roomId = namespace.name.replace('/rooms/', '');

    console.log(`Player connected to room ${roomId}: ${socket.id}`);

    // Get auth data
    const { playerId, playerName, role } = socket.handshake.auth as {
      playerId?: string;
      playerName?: string;
      role?: 'master' | 'player';
    };

    // Verify room exists
    const room = await roomRepository.findById(roomId);
    if (!room) {
      socket.emit('error', {
        code: 'ROOM_NOT_FOUND',
        message: 'Room does not exist',
      });
      socket.disconnect();
      return;
    }

    // Player join event
    socket.on('player:join', async (data: { name: string }) => {
      try {
        // Check if room is full
        const playerCount = await playerRepository.countConnected(roomId);
        if (playerCount >= room.maxPlayers) {
          socket.emit('error', {
            code: 'ROOM_FULL',
            message: 'Room is full',
          });
          return;
        }

        // Check if game already started
        if (room.status !== 'lobby') {
          socket.emit('error', {
            code: 'GAME_STARTED',
            message: 'Cannot join - game already in progress',
          });
          return;
        }

        // Check for duplicate name
        const existing = await playerRepository.findByRoomAndName(roomId, data.name);
        if (existing) {
          socket.emit('error', {
            code: 'DUPLICATE_NAME',
            message: 'Name already taken in this room',
          });
          return;
        }

        // Create player
        const player = await playerRepository.create({
          roomId,
          name: data.name,
          role: 'player',
        });

        // Send confirmation to joining player
        socket.emit('player:joined', { player, room });

        // Broadcast to others
        socket.broadcast.emit('player:joined', { player, room });

        console.log(`Player ${player.name} joined room ${roomId}`);
      } catch (error) {
        socket.emit('error', {
          code: 'JOIN_FAILED',
          message: error instanceof Error ? error.message : 'Failed to join room',
        });
      }
    });

    // Player leave event
    socket.on('player:leave', async () => {
      if (!playerId) return;

      try {
        const player = await playerRepository.findById(playerId);
        if (!player) return;

        await playerRepository.delete(playerId);

        socket.broadcast.emit('player:left', {
          playerId: player.id,
          playerName: player.name,
          remainingPlayers: await playerRepository.countConnected(roomId),
        });

        console.log(`Player ${player.name} left room ${roomId}`);
      } catch (error) {
        console.error('Error handling player leave:', error);
      }
    });

    // Player kick event (master only)
    socket.on('player:kick', async (data: { playerId: string }) => {
      if (role !== 'master') {
        socket.emit('error', {
          code: 'PERMISSION_DENIED',
          message: 'Only master can kick players',
        });
        return;
      }

      try {
        const player = await playerRepository.findById(data.playerId);
        if (!player) return;

        await playerRepository.delete(data.playerId);

        // Notify kicked player
        namespace.to(data.playerId).emit('player:kicked', {
          reason: 'Removed by host',
        });

        // Broadcast to others
        socket.broadcast.emit('player:left', {
          playerId: player.id,
          playerName: player.name,
          remainingPlayers: await playerRepository.countConnected(roomId),
        });

        console.log(`Player ${player.name} kicked from room ${roomId}`);
      } catch (error) {
        socket.emit('error', {
          code: 'KICK_FAILED',
          message: 'Failed to kick player',
        });
      }
    });

    // State sync event
    socket.on('state:sync', async () => {
      try {
        const room = await roomRepository.findById(roomId);
        const players = await playerRepository.findByRoom(roomId);

        socket.emit('state:synced', {
          room,
          players,
          // session and currentRound will be added in future phases
        });
      } catch (error) {
        socket.emit('error', {
          code: 'SYNC_FAILED',
          message: 'Failed to sync state',
        });
      }
    });

    // Disconnect handler
    socket.on('disconnect', async (reason) => {
      console.log(`Player disconnected from room ${roomId}: ${socket.id} (${reason})`);

      if (playerId) {
        try {
          const player = await playerRepository.findById(playerId);
          if (player) {
            // Mark as disconnected
            await playerRepository.update(playerId, { connected: false });

            socket.broadcast.emit('player:disconnected', {
              playerId: player.id,
              playerName: player.name,
              canRejoin: true,
            });
          }
        } catch (error) {
          console.error('Error handling disconnect:', error);
        }
      }
    });
  });

  return io;
}
