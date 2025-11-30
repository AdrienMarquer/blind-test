# Repository Guidelines

## Project Structure & Module Organization
The codebase is organized as a Bun monorepo. `apps/server` hosts the Elysia API, websocket handlers, Drizzle schema (`src/db`) and background job logic (`src/services`). `apps/client` contains the SvelteKit UI with assets in `static/` and routes/layouts in `src/`. Shared TypeScript contracts live in `packages/shared`. Integration docs and specs are under `docs/`, while automation scripts (bulk audio import, VPS sync) sit in `scripts/`. Keep new assets inside the relevant app directory so builds remain hermetic.

## Build, Test & Development Commands
Use Bun scripts from the repository root:
- `bun install` — install workspace dependencies.
- `bun run dev` — launch server on :3007 and client on :5173 simultaneously.
- `bun run build` — produce production builds for both apps.
- `bun run test` / `bun run test:watch` / `bun run test:coverage` — run server-side unit + e2e suites once, in watch mode, or with coverage.
- `bun run db:migrate` and `bun run db:studio` — apply migrations or inspect the schema via Drizzle Studio.
- `bun scripts/bulk-upload-songs.ts <path>` — CLI helper to ingest local media.

## Coding Style & Naming Conventions
Write modern TypeScript (ESM, async/await). Use 2-space indentation, prefer named exports, and keep route/service files colocated by domain (see `apps/server/src/routes/*`). UI components follow Svelte 5 runes; stateful helpers belong in `src/lib`. Reuse shared Zod/Drizzle types rather than redefining shapes. Run `bunx svelte-check` inside the client if you touch Svelte files, and format code with the editor settings already checked into the repo (VS Code config enforces import sorting and quote style).

## Testing Guidelines
Tests live in `apps/server/tests`, split into `unit/` and `e2e/`. Name specs after the subject (e.g., `GameService.test.ts`). Prefer Bun's built-in test runner with `describe/it` semantics and keep factories/mocks under `tests/utils`. When adding gameplay logic, supply at least one unit test documenting edge cases plus, when applicable, an e2e test covering websocket flows. Target full coverage for new modules and avoid skipping tests—CI treats `.skip` as a failure.

## Commit & Pull Request Guidelines
Follow Conventional Commits (`feat:`, `fix:`, `refactor:`) as seen in `git log`. Commits should be scoped to a single concern and include schema or asset updates when relevant. Pull requests must describe intent, list test evidence (`bun run test` output, manual smoke checks), and link to any tracking issue. Include screenshots or terminal captures for UI or CLI changes, and mention migration impacts or ops steps so deploys remain smooth.

## Configuration & Environment
Secrets live in `apps/server/.env`; copy `.env.example` and never commit filled files. `DATABASE_URL` must point to PostgreSQL 18 and the job queue assumes background workers start with the API. When syncing to a VPS, run `bun scripts/sync-to-vps.ts --dry-run` first to verify rsync targets and firewall rules.
