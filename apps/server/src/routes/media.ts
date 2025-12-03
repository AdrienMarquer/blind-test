/**
 * Media Type Routes
 * Handles media type metadata retrieval
 */

import { Elysia } from 'elysia';
import { mediaRegistry } from '../media';
import { logger } from '../utils/logger';

const apiLogger = logger.child({ module: 'API:Media' });

export const mediaRoutes = new Elysia({ prefix: '/api/media' })
  // Get all available media types
  .get('/', () => {
    apiLogger.debug('Fetching available media types');

    const mediaTypes = mediaRegistry.getMetadata();

    return {
      mediaTypes,
      count: mediaTypes.length,
    };
  })

  // Get specific media type details
  .get('/:mediaType', ({ params: { mediaType }, set }) => {
    apiLogger.debug('Fetching media type details', { mediaType });

    try {
      const handler = mediaRegistry.get(mediaType as any);

      return {
        type: handler.type,
        name: handler.name,
        description: handler.description,
      };
    } catch (err) {
      apiLogger.error('Failed to get media type', err, { mediaType });
      set.status = 404;
      return { error: `Media type not found: ${mediaType}` };
    }
  });
