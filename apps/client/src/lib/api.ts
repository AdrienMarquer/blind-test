import { treaty } from '@elysiajs/eden';
import type { App } from '../../../server/src/index';

// Create the type-safe API client
export const api = treaty<App>('http://localhost:3007');
