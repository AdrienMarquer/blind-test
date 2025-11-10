/**
 * Game Mode Routes
 * Handles mode metadata retrieval
 */

import { Elysia } from 'elysia';
import { modeRegistry } from '../modes';
import { logger } from '../utils/logger';

const apiLogger = logger.child({ module: 'API:Modes' });

export const modeRoutes = new Elysia({ prefix: '/api/modes' })
  // Get all available game modes
  .get('/', () => {
    apiLogger.debug('Fetching available modes');

    const modes = modeRegistry.getMetadata();

    return {
      modes,
      count: modes.length,
    };
  })

  // Get specific mode details
  .get('/:modeType', ({ params: { modeType }, error }) => {
    apiLogger.debug('Fetching mode details', { modeType });

    try {
      const handler = modeRegistry.get(modeType as any);

      return {
        type: handler.type,
        name: handler.name,
        description: handler.description,
        defaultParams: handler.defaultParams,
      };
    } catch (err) {
      apiLogger.error('Failed to get mode', err, { modeType });
      return error(404, { error: `Mode not found: ${modeType}` });
    }
  });
