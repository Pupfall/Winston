/**
 * Authentication Middleware
 *
 * Validates API key from Authorization header and attaches user to request.
 *
 * Header format: Authorization: Bearer <api-key>
 */

import { Request, Response, NextFunction } from 'express';
import { getUserByApiKey } from '../db/repo';

/**
 * Extended Express Request with user and accountKey
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
  accountKey?: string;
}

/**
 * Authentication middleware
 *
 * Extracts Bearer token from Authorization header, validates against database,
 * and attaches user info to request.
 *
 * @throws 401 if no token provided or invalid token
 */
export async function auth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract Authorization header
    const authHeader = req.header('Authorization');

    if (!authHeader) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing Authorization header',
        details: {
          expected: 'Authorization: Bearer <api-key>',
        },
      });
      return;
    }

    // Parse Bearer token
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid Authorization header format',
        details: {
          expected: 'Authorization: Bearer <api-key>',
          received: authHeader.substring(0, 20) + '...',
        },
      });
      return;
    }

    const apiKey = match[1].trim();

    if (!apiKey) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Empty API key',
      });
      return;
    }

    // Lookup user by API key
    const user = await getUserByApiKey(apiKey);

    if (!user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key',
        details: {
          hint: 'API key not found or expired',
        },
      });
      return;
    }

    // Attach user and accountKey to request
    const authReq = req as AuthenticatedRequest;
    authReq.user = {
      id: user.id,
      email: user.email,
    };
    authReq.accountKey = user.id;

    // Log authentication for debugging
    console.log(`[Auth] Authenticated user: ${user.email} (${user.id})`);

    next();
  } catch (error) {
    console.error('[Auth] Authentication error:', error);
    res.status(500).json({
      error: 'InternalError',
      message: 'Authentication failed',
    });
  }
}

/**
 * Optional authentication middleware
 *
 * Attempts to authenticate but allows request to proceed even if auth fails.
 * Useful for endpoints that have different behavior for authenticated vs anonymous users.
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.header('Authorization');

    if (!authHeader) {
      // No auth header - proceed as anonymous
      const authReq = req as AuthenticatedRequest;
      authReq.accountKey = 'anon';
      next();
      return;
    }

    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      // Invalid format - proceed as anonymous
      const authReq = req as AuthenticatedRequest;
      authReq.accountKey = 'anon';
      next();
      return;
    }

    const apiKey = match[1].trim();
    const user = await getUserByApiKey(apiKey);

    if (user) {
      // Valid API key - attach user
      const authReq = req as AuthenticatedRequest;
      authReq.user = {
        id: user.id,
        email: user.email,
      };
      authReq.accountKey = user.id;
      console.log(`[Auth] Optional auth succeeded: ${user.email}`);
    } else {
      // Invalid API key - proceed as anonymous
      const authReq = req as AuthenticatedRequest;
      authReq.accountKey = 'anon';
      console.log('[Auth] Optional auth failed - proceeding as anonymous');
    }

    next();
  } catch (error) {
    console.error('[Auth] Optional authentication error:', error);
    // On error, proceed as anonymous
    const authReq = req as AuthenticatedRequest;
    authReq.accountKey = 'anon';
    next();
  }
}
