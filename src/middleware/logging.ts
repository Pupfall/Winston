/**
 * Structured Logging Middleware
 *
 * Provides request-scoped logging with:
 * - Unique request IDs (UUID v4)
 * - Request/response logging with latency
 * - User context (if authenticated)
 * - Error logging integration
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import pino from 'pino';
import { AuthenticatedRequest } from './auth';

/**
 * Extended Request with logging context
 */
export interface LoggedRequest extends Request {
  id: string;
  startTime: number;
  log: pino.Logger;
}

/**
 * Create Pino logger instance
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
});

/**
 * Logging middleware
 *
 * Attaches unique request ID and logger to each request.
 * Logs request start and completion with latency.
 */
export function loggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const loggedReq = req as LoggedRequest;
  const authReq = req as AuthenticatedRequest;

  // Assign unique request ID
  loggedReq.id = randomUUID();
  loggedReq.startTime = Date.now();

  // Create request-scoped logger
  loggedReq.log = logger.child({
    reqId: loggedReq.id,
    method: req.method,
    path: req.path,
    ip: req.ip,
  });

  // Log request start
  loggedReq.log.info({
    event: 'request_start',
    method: req.method,
    url: req.url,
    userAgent: req.get('user-agent'),
  });

  // Capture response finish
  const originalSend = res.send;
  res.send = function (data: any) {
    const latency = Date.now() - loggedReq.startTime;

    // Add user context if authenticated
    const logContext: any = {
      event: 'request_finish',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      latency,
    };

    if (authReq.user) {
      logContext.userId = authReq.user.id;
      logContext.userEmail = authReq.user.email;
    }

    if (authReq.accountKey) {
      logContext.accountKey = authReq.accountKey;
    }

    // Log with appropriate level based on status code
    if (res.statusCode >= 500) {
      loggedReq.log.error(logContext);
    } else if (res.statusCode >= 400) {
      loggedReq.log.warn(logContext);
    } else {
      loggedReq.log.info(logContext);
    }

    return originalSend.call(this, data);
  };

  next();
}

/**
 * Get logger from request
 */
export function getLogger(req: Request): pino.Logger {
  const loggedReq = req as LoggedRequest;
  return loggedReq.log || logger;
}

/**
 * Get request ID from request
 */
export function getRequestId(req: Request): string {
  const loggedReq = req as LoggedRequest;
  return loggedReq.id || 'unknown';
}
