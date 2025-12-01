/**
 * Authentication Routes
 * Handles admin password verification
 */

import { Elysia, t } from 'elysia';
import { logger } from '../utils/logger';

const authLogger = logger.child({ module: 'API:Auth' });

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  // Verify admin password
  .post('/admin', async ({ body, set }) => {
    if (!ADMIN_PASSWORD) {
      authLogger.warn('ADMIN_PASSWORD not configured - access denied');
      set.status = 503;
      return { valid: false, error: 'Admin authentication not configured' };
    }

    const isValid = body.password === ADMIN_PASSWORD;

    if (isValid) {
      authLogger.info('Admin authentication successful');
    } else {
      authLogger.warn('Admin authentication failed - invalid password');
    }

    return { valid: isValid };
  }, {
    body: t.Object({
      password: t.String({ minLength: 1 }),
    }),
  });

/**
 * Middleware to check admin authentication via header
 * Use: X-Admin-Password header
 */
export function requireAdminAuth(set: { status: number }, headers: Record<string, string | undefined>) {
  if (!ADMIN_PASSWORD) {
    set.status = 503;
    return { error: 'Admin authentication not configured' };
  }

  const providedPassword = headers['x-admin-password'];

  if (!providedPassword || providedPassword !== ADMIN_PASSWORD) {
    set.status = 401;
    return { error: 'Admin authentication required' };
  }

  return null; // Auth passed
}
