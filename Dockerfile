# =============================================================================
# Stage 1: Build Client (SvelteKit)
# =============================================================================
FROM oven/bun:1 AS client-builder

WORKDIR /app

# Copy workspace configuration and package files
COPY package.json bun.lock ./
COPY apps/client/package.json ./apps/client/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY apps/client ./apps/client
COPY packages/shared ./packages/shared

# Build client to static files
WORKDIR /app/apps/client
RUN bun run build

# Verify build output
RUN ls -la /app/apps/client/build

# =============================================================================
# Stage 2: Build Server (Elysia)
# =============================================================================
FROM oven/bun:1 AS server-builder

WORKDIR /app

# Copy workspace configuration and package files
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY apps/server ./apps/server
COPY packages/shared ./packages/shared

# Build server
WORKDIR /app/apps/server
RUN bun run build

# Verify build output
RUN ls -la /app/apps/server/dist

# =============================================================================
# Stage 3: Production Image
# =============================================================================
FROM oven/bun:1-debian AS production

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp (for YouTube downloads)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Verify installations
RUN ffmpeg -version && yt-dlp --version

# Create app user (security best practice)
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Set working directory
WORKDIR /app

# Copy package files
COPY --chown=appuser:appuser package.json bun.lock ./
COPY --chown=appuser:appuser apps/server/package.json ./apps/server/
COPY --chown=appuser:appuser packages/shared/package.json ./packages/shared/

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Copy built server from server-builder
COPY --from=server-builder --chown=appuser:appuser /app/apps/server/dist ./apps/server/dist
COPY --from=server-builder --chown=appuser:appuser /app/apps/server/drizzle ./apps/server/drizzle
COPY --from=server-builder --chown=appuser:appuser /app/packages/shared ./packages/shared

# Copy built client from client-builder to server's client build directory
COPY --from=client-builder --chown=appuser:appuser /app/apps/client/build ./apps/client/build

# Create directories for uploads and database
RUN mkdir -p /app/apps/server/uploads /app/apps/server/db \
    && chown -R appuser:appuser /app/apps/server/uploads /app/apps/server/db

# Switch to non-root user
USER appuser

# Set working directory to server
WORKDIR /app/apps/server

# Environment variables (can be overridden at runtime)
ENV NODE_ENV=production \
    PORT=3007 \
    YTDLP_PATH=/usr/local/bin/yt-dlp

# Expose port
EXPOSE 3007

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3007/health || exit 1

# Start server
CMD ["bun", "run", "dist/index.js"]
