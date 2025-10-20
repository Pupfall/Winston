import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

/**
 * Custom HTTP error class with status code and optional details
 */
export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(400, message, details);
    this.name = 'ValidationError';
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends HttpError {
  constructor(message = 'Resource not found') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

/**
 * Forbidden error (403)
 */
export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Too many requests error (429)
 */
export class TooManyRequestsError extends HttpError {
  constructor(message = 'Too many requests') {
    super(429, message);
    this.name = 'TooManyRequestsError';
  }
}

/**
 * Internal server error (500)
 */
export class InternalError extends HttpError {
  constructor(message = 'Internal server error', details?: unknown) {
    super(500, message, details);
    this.name = 'InternalError';
  }
}

/**
 * Idempotency mismatch error (409)
 * Thrown when replaying a request with same idempotency key but different parameters
 */
export class IdempotencyMismatchError extends HttpError {
  constructor(message = 'Idempotency key reused with different parameters', details?: unknown) {
    super(409, message, details);
    this.name = 'IdempotencyMismatch';
  }
}

/**
 * Price drift error (409)
 * Thrown when server price differs significantly from client quoted price
 */
export class PriceDriftError extends HttpError {
  constructor(message = 'Server price differs from quoted price', details?: unknown) {
    super(409, message, details);
    this.name = 'PriceDrift';
  }
}

/**
 * Premium not allowed error (400)
 * Thrown when attempting to register a premium domain without allow_premium flag
 */
export class PremiumNotAllowedError extends HttpError {
  constructor(message = 'Premium domains require allow_premium flag', details?: unknown) {
    super(400, message, details);
    this.name = 'PremiumNotAllowed';
  }
}

/**
 * Daily cap exceeded error (400)
 * Thrown when purchase would exceed MAX_DAILY_USD limit
 */
export class DailyCapExceededError extends HttpError {
  constructor(message = 'Daily spending cap exceeded', details?: unknown) {
    super(400, message, details);
    this.name = 'DailyCapExceeded';
  }
}

/**
 * Unsafe label error (400)
 * Thrown when domain label fails homograph/Unicode safety checks
 */
export class UnsafeLabelError extends HttpError {
  constructor(message = 'Domain label failed safety checks', details?: unknown) {
    super(400, message, details);
    this.name = 'UnsafeLabel';
  }
}

/**
 * Non-ASCII not allowed error (400)
 * Thrown when non-ASCII characters are used without allow_unicode flag
 */
export class NonASCIINotAllowedError extends HttpError {
  constructor(message = 'Non-ASCII characters require allow_unicode or include_unicode flag', details?: unknown) {
    super(400, message, details);
    this.name = 'NonASCIINotAllowed';
  }
}

/**
 * Unicode must use punycode error (400)
 * Thrown when Unicode domain is not in punycode format
 */
export class UnicodeMustUsePunycodeError extends HttpError {
  constructor(message = 'Unicode domains must use punycode encoding (xn--)', details?: unknown) {
    super(400, message, details);
    this.name = 'UnicodeMustUsePunycode';
  }
}

/**
 * Unknown DNS template error (400)
 * Thrown when requested DNS template ID does not exist
 */
export class UnknownDnsTemplateError extends HttpError {
  constructor(message = 'DNS template not found', details?: unknown) {
    super(400, message, details);
    this.name = 'UnknownDnsTemplate';
  }
}

/**
 * Nameservers required error (400)
 * Thrown when nameserver_mode is "custom" but nameservers array is missing or invalid
 */
export class NameserversRequiredError extends HttpError {
  constructor(message = 'Nameservers required when using custom nameserver mode', details?: unknown) {
    super(400, message, details);
    this.name = 'NameserversRequired';
  }
}

/**
 * Error response format
 */
interface ErrorResponse {
  error: string;
  message: string;
  details?: unknown;
  status: number;
}

/**
 * Global error handler middleware
 * Catches all errors and formats them consistently
 */
export function errorHandler(
  err: Error | HttpError | ZodError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Import logger dynamically to avoid circular dependency
  const { getLogger } = require('../middleware/logging');
  const log = getLogger(req);

  // Log error with structured logging
  const errorContext: any = {
    event: 'error',
    errorName: err.name,
    errorMessage: err.message,
    path: req.path,
    method: req.method,
  };

  if (err instanceof HttpError) {
    errorContext.status = err.status;
    errorContext.details = err.details;
  }

  if (process.env.NODE_ENV === 'development') {
    errorContext.stack = err.stack;
  }

  log.error(errorContext);

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const response: ErrorResponse = {
      error: 'ValidationError',
      message: 'Request validation failed',
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
        code: e.code,
      })),
      status: 400,
    };

    res.status(400).json(response);
    return;
  }

  // Handle custom HTTP errors
  if (err instanceof HttpError) {
    const response: ErrorResponse = {
      error: err.name,
      message: err.message,
      details: err.details,
      status: err.status,
    };

    res.status(err.status).json(response);
    return;
  }

  // Handle unknown errors
  const response: ErrorResponse = {
    error: 'InternalError',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message,
    status: 500,
  };

  res.status(500).json(response);
}

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(_req: Request, res: Response): void {
  const response: ErrorResponse = {
    error: 'NotFoundError',
    message: 'The requested endpoint does not exist',
    status: 404,
  };

  res.status(404).json(response);
}

/**
 * Async route wrapper to catch errors
 * Eliminates need for try-catch in every route
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
