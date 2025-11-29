import { treaty } from '@elysiajs/eden';
import type { App } from '../../../server/src/index';

// Use current origin in browser (production), localhost in SSR/dev
const getApiUrl = () => {
  if (typeof window !== 'undefined') {
    // Browser: use same origin (works for both dev proxy and production)
    return window.location.origin;
  }
  // SSR: use localhost for server-side requests
  return 'http://localhost:3007';
};

// Create the type-safe API client
export const api = treaty<App>(getApiUrl());
