/**
 * Vercel Serverless API Entry Point
 *
 * This file wraps the Express app from src/app.ts for deployment to Vercel.
 * All routes are automatically available under /api/ prefix (handled by Vercel routing).
 *
 * Environment variables required (set in Vercel dashboard):
 * - PORKBUN_API_KEY
 * - PORKBUN_SECRET_KEY
 * - DATABASE_URL
 * - WINSTON_CONTACT_EMAIL
 *
 * Optional environment variables:
 * - DEFAULT_PROVIDER (default: porkbun)
 * - DRY_RUN (default: false)
 * - MAX_PER_TXN_USD (default: 100)
 * - MAX_DAILY_USD (default: 500)
 * - RATE_LIMIT_RPM (default: 60)
 * - RATE_LIMIT_BURST (default: 30)
 * - ALLOWED_TLDS (default: com,net,org,io,app)
 *
 * Endpoints exposed under /api/:
 * - GET  /api/          → API documentation
 * - GET  /api/health    → Health check
 * - GET  /api/metrics   → Prometheus metrics
 * - POST /api/search    → Domain search
 * - POST /api/buy       → Domain purchase (requires Bearer token)
 * - GET  /api/status/:domain → Domain status lookup
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import serverless from 'serverless-http';
import { app } from '../src/app';

/**
 * Serverless handler for Vercel
 *
 * Vercel automatically routes:
 * - /api/health → handler (Express sees /api/health)
 * - /api/search → handler (Express sees /api/search)
 * - /api/* → handler (Express sees /api/*)
 *
 * The Express app in src/app.ts defines routes at the root level (/health, /search, etc.),
 * so we need to strip the /api prefix before passing to Express.
 */
const handler = serverless(app);

export default async function (req: VercelRequest, res: VercelResponse) {
  // Strip /api prefix from URL path so Express routes match correctly
  // Vercel routes /api/health → this handler with req.url = '/api/health'
  // Express expects req.url = '/health'
  if (req.url && req.url.startsWith('/api')) {
    req.url = req.url.replace(/^\/api/, '') || '/';
  }

  return handler(req, res);
}
