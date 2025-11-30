# 🎵 Adriquiz - Blind Test System

## Project Overview
Adriquiz is a local, real-time blind test game where a master server plays music and players compete to guess the song using their mobile devices.

**Key Features:**
- **Real-time Multiplayer:** WebSocket-based communication for low-latency buzzing and scoring.
- **Dual Interface:** Specific UIs for the "Master" (game host/audio controller) and "Players" (mobile buzzers).
- **Music Library:** Supports local file uploads and YouTube imports with automatic metadata enrichment (Spotify/AI).
- **Robust Backend:** Built on Bun and Elysia for high performance.

## 🛠 Technical Stack

*   **Runtime/Package Manager:** [Bun](https://bun.sh)
*   **Monorepo Management:** Bun Workspaces
*   **Frontend:** SvelteKit + Svelte 5 (Vite-based)
*   **Backend:** Elysia.js + Native WebSockets
*   **Database:** PostgreSQL 18 + Drizzle ORM
*   **Type Safety:** End-to-end type safety via Eden Treaty (`@elysiajs/eden`)
*   **Containerization:** Docker (for PostgreSQL)

## 📂 Project Structure

The project uses a monorepo structure managed by Bun:

```text
/
├── apps/
│   ├── client/         # Frontend application (SvelteKit)
│   └── server/         # Backend API & WebSocket server (Elysia)
├── packages/
│   └── shared/         # Shared TypeScript types & utilities
├── docs/               # Detailed architectural documentation
└── scripts/            # Utility scripts (e.g., bulk uploads)
```

## 🚀 Getting Started

### Prerequisites
*   **Bun** installed globally.
*   **Docker** installed (for the database).

### Installation
1.  **Install dependencies:**
    ```bash
    bun install
    ```
2.  **Start the Database:**
    ```bash
    bun run db:start
    ```
3.  **Apply Migrations:**
    ```bash
    bun run db:migrate
    ```

### Running the Application
*   **Full Stack (Server + Client):**
    ```bash
    bun run dev
    ```
*   **Server Only (Port 3007):**
    ```bash
    bun run dev:server
    ```
*   **Client Only (Port 5173):**
    ```bash
    bun run dev:client
    ```

## 💻 Development Workflows

### Database Management (Drizzle ORM)
The project uses Drizzle ORM with PostgreSQL.
*   **Schema Definition:** `apps/server/src/db/schema.ts`
*   **Generate Migration:**
    ```bash
    cd apps/server
    bunx drizzle-kit generate --name <descriptive-name>
    ```
*   **Apply Migrations:**
    ```bash
    bun run db:migrate
    ```
*   **Database GUI:**
    ```bash
    bun run db:studio
    ```

### Type Safety (Eden Treaty)
The backend exports its type definition, which the client consumes to ensure compile-time safety for API calls.
1.  **Backend:** Defines routes in `apps/server/src/index.ts` and exports `type App`.
2.  **Client:** Imports this type in `apps/client/src/lib/api.ts`.
3.  **Result:** Changing a backend route immediately flags type errors in the frontend client.

### Music Import
Songs can be imported via CLI scripts or the Web UI.
*   **Bulk Local Import:** `bun scripts/bulk-upload-songs.ts <path-to-folder>`
*   **YouTube/Spotify:** Handled via the Web UI + Backend services (`YouTubeDownloadService`, `MetadataEnrichmentService`).

## 📐 Architecture Highlights

*   **Communication:** purely WebSocket-based for game state (`/ws/rooms/:roomId`). REST API is used for initial resource fetching and management (Songs, Playlists).
*   **State Management:**
    *   **Server:** In-memory game state (Rooms, Players, Round logic) backed by Postgres for persistence.
    *   **Client:** Svelte Stores (`$room`, `$game`, `$player`) sync state from WebSocket events.
*   **Shared Code:** Core types (`Room`, `Player`, `Song`) and validation logic live in `packages/shared` to prevent duplication.

## 📚 Documentation References
*   `CLAUDE.md`: Detailed coding guidelines and developer cheatsheet.
*   `docs/00_ARCHITECTURE.md`: High-level system design.
*   `docs/API.md`: REST API specification.
*   `docs/WEBSOCKETS.md`: Real-time event protocol.
*   `docs/DATABASE.md`: Data models and schema details.
