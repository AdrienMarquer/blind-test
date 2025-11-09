import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";

// Data models
interface Player {
  id: string;
  name: string;
  score: number;
}

interface Room {
  id: string;
  name: string;
  players: Player[];
  currentTrack?: string;
  status: "waiting" | "playing" | "finished";
}

// In-memory storage
const rooms = new Map<string, Room>();

// Utility function to generate unique IDs
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

// Initialize Elysia app
const app = new Elysia()
  .use(cors())
  .get("/", () => {
    return {
      message: "Blind Test API Server",
      status: "running",
      version: "1.0.0"
    };
  })

  // Get all rooms
  .get("/api/rooms", () => {
    console.log(`[GET /api/rooms] Fetching all rooms. Total: ${rooms.size}`);
    return Array.from(rooms.values());
  })

  // Create new room
  .post(
    "/api/rooms",
    ({ body }) => {
      const roomId = generateId();
      const newRoom: Room = {
        id: roomId,
        name: body.name,
        players: [],
        status: "waiting",
      };

      rooms.set(roomId, newRoom);
      console.log(`[POST /api/rooms] Created room: ${newRoom.name} (ID: ${roomId})`);

      return newRoom;
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
      }),
    }
  )

  // Get room by ID
  .get(
    "/api/rooms/:id",
    ({ params: { id }, error }) => {
      const room = rooms.get(id);

      if (!room) {
        console.log(`[GET /api/rooms/${id}] Room not found`);
        return error(404, { message: "Room not found" });
      }

      console.log(`[GET /api/rooms/${id}] Fetching room: ${room.name}`);
      return room;
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )

  // Add player to room
  .post(
    "/api/rooms/:id/players",
    ({ params: { id }, body, error }) => {
      const room = rooms.get(id);

      if (!room) {
        console.log(`[POST /api/rooms/${id}/players] Room not found`);
        return error(404, { message: "Room not found" });
      }

      if (room.status !== "waiting") {
        console.log(`[POST /api/rooms/${id}/players] Cannot add player - game already started`);
        return error(400, { message: "Cannot add player - game already started" });
      }

      const playerId = generateId();
      const newPlayer: Player = {
        id: playerId,
        name: body.name,
        score: 0,
      };

      room.players.push(newPlayer);
      console.log(`[POST /api/rooms/${id}/players] Added player: ${newPlayer.name} (ID: ${playerId})`);

      return newPlayer;
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        name: t.String({ minLength: 1 }),
      }),
    }
  )

  // Remove player from room
  .delete(
    "/api/rooms/:roomId/players/:playerId",
    ({ params: { roomId, playerId }, error }) => {
      const room = rooms.get(roomId);

      if (!room) {
        console.log(`[DELETE /api/rooms/${roomId}/players/${playerId}] Room not found`);
        return error(404, { message: "Room not found" });
      }

      const playerIndex = room.players.findIndex((p) => p.id === playerId);

      if (playerIndex === -1) {
        console.log(`[DELETE /api/rooms/${roomId}/players/${playerId}] Player not found`);
        return error(404, { message: "Player not found" });
      }

      const removedPlayer = room.players.splice(playerIndex, 1)[0];
      console.log(`[DELETE /api/rooms/${roomId}/players/${playerId}] Removed player: ${removedPlayer.name}`);

      return { message: "Player removed successfully", player: removedPlayer };
    },
    {
      params: t.Object({
        roomId: t.String(),
        playerId: t.String(),
      }),
    }
  )

  // Start game
  .post(
    "/api/rooms/:id/start",
    ({ params: { id }, error }) => {
      const room = rooms.get(id);

      if (!room) {
        console.log(`[POST /api/rooms/${id}/start] Room not found`);
        return error(404, { message: "Room not found" });
      }

      if (room.status !== "waiting") {
        console.log(`[POST /api/rooms/${id}/start] Game already started`);
        return error(400, { message: "Game already started" });
      }

      if (room.players.length < 2) {
        console.log(`[POST /api/rooms/${id}/start] Not enough players (need at least 2)`);
        return error(400, { message: "Need at least 2 players to start" });
      }

      room.status = "playing";
      console.log(`[POST /api/rooms/${id}/start] Game started for room: ${room.name}`);

      return room;
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )

  .listen(3007);

console.log(
  `🎵 Blind Test API Server is running at http://${app.server?.hostname}:${app.server?.port}`
);

// Export app type for Eden Treaty
export type App = typeof app;
