import { treaty } from '@elysiajs/eden';
import type { App } from '../../../server/src/index';

/**
 * Get the API base URL
 * - Browser: uses current origin (works for both dev proxy and production)
 * - SSR: uses localhost for server-side requests
 */
export const getApiUrl = (): string => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:3007';
};

/**
 * Get the WebSocket base URL
 * - Production (no port): uses wss://host
 * - Local network (custom port): uses ws://host:3007
 * - Localhost: uses ws://localhost:3007
 */
export const getWsUrl = (): string => {
  if (typeof window === 'undefined') return 'ws://localhost:3007';

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  const port = window.location.port;

  // Production: no port needed, goes through reverse proxy
  if (host !== 'localhost' && host !== '127.0.0.1' && !port) {
    return `${protocol}//${host}`;
  }

  // Local network with custom port (e.g., 192.168.x.x:5173)
  if (host !== 'localhost' && host !== '127.0.0.1') {
    return `${protocol}//${host}:3007`;
  }

  return 'ws://localhost:3007';
};

// Create the type-safe API client
export const api = treaty<App>(getApiUrl());
