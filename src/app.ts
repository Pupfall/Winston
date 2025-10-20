import express, { Express, Request, Response, NextFunction } from 'express';
import domainRoutes from './routes/domains';
import { errorHandler, notFoundHandler } from './lib/errors';
import { getAllowedTlds, MAX_PER_TXN_USD, MAX_DAILY_USD, RATE_LIMIT_RPM, RATE_LIMIT_BURST } from './config';
import { optionalAuth } from './middleware/auth';
import { loggingMiddleware } from './middleware/logging';
import { RateLimiter, rateLimitMiddleware } from './middleware/rateLimit';
import { getMetrics, incHttpRequest, observeHttpDuration } from './metrics';

/**
 * Create and configure Express application
 */
export function createApp(): Express {
  const app = express();

  // Create rate limiter instance
  const rateLimiter = new RateLimiter({
    requestsPerMinute: RATE_LIMIT_RPM,
    burstSize: RATE_LIMIT_BURST,
  });

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS for GPT Actions and external access
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Structured logging middleware (adds req.id and req.log)
  app.use(loggingMiddleware);

  // Metrics middleware (track request duration and count)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const originalSend = res.send;

    res.send = function (data: any) {
      const duration = (Date.now() - startTime) / 1000; // seconds
      const route = req.route?.path || req.path;

      // Record metrics
      incHttpRequest(route, req.method, res.statusCode);
      observeHttpDuration(route, req.method, duration);

      return originalSend.call(this, data);
    };

    next();
  });

  // Metrics endpoint (no auth required for monitoring)
  app.get('/metrics', async (_req: Request, res: Response) => {
    res.set('Content-Type', 'text/plain');
    res.send(await getMetrics());
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Root endpoint with API documentation
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'Winston',
      version: '1.0.0',
      description: 'Domain search and registration API',
      authentication: {
        type: 'Bearer token',
        header: 'Authorization: Bearer <api-key>',
        note: 'All domain operations require authentication',
      },
      endpoints: {
        health: 'GET /health',
        metrics: 'GET /metrics',
        search: 'POST /search (body: { candidates?: string[], prompt?: string, tlds?: string[], price_ceiling?: number, limit?: number })',
        buy: 'POST /buy (body: { domain, years?, whois_privacy?, quoted_total_usd, confirmation_code, idempotency_key })',
        status: 'GET /status/:domain',
      },
      limits: {
        max_per_transaction_usd: MAX_PER_TXN_USD,
        max_daily_usd: MAX_DAILY_USD,
        rate_limit_rpm: RATE_LIMIT_RPM,
        rate_limit_burst: RATE_LIMIT_BURST,
      },
      config: {
        allowed_tlds: getAllowedTlds(),
        provider: 'porkbun',
      },
    });
  });

  // Apply optional authentication to all routes
  // This allows endpoints to work for both authenticated and anonymous users
  // Individual routes can check req.user to require authentication
  app.use(optionalAuth);

  // Apply rate limiting after authentication (so we can use accountKey)
  app.use(rateLimitMiddleware(rateLimiter));

  // Mount domain routes
  app.use('/', domainRoutes);

  // 404 handler (must come before error handler)
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Singleton app instance for Vercel serverless deployment
 * For local development, use createApp() in src/index.ts instead
 */
export const app = createApp();

export default createApp;
