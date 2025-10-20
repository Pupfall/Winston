/**
 * Authentication and Account Utilities
 *
 * Extracts account identifiers from requests for spend tracking
 */

import { Request } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';

/**
 * Derive account key from request
 *
 * Uses req.accountKey set by auth middleware.
 * Falls back to "anon" if not authenticated.
 *
 * @param req - Express request object
 * @returns Account identifier (user ID or "anon")
 */
export function accountKey(req: Request): string {
  const authReq = req as AuthenticatedRequest;
  return authReq.accountKey || 'anon';
}

/**
 * Check if request is authenticated
 *
 * @param req - Express request object
 * @returns true if user is authenticated, false otherwise
 */
export function isAuthenticated(req: Request): boolean {
  const authReq = req as AuthenticatedRequest;
  return !!authReq.user;
}

/**
 * Get authenticated user from request
 *
 * @param req - Express request object
 * @returns User object if authenticated, null otherwise
 */
export function getUser(req: Request): { id: string; email: string } | null {
  const authReq = req as AuthenticatedRequest;
  return authReq.user || null;
}
