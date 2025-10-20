/**
 * Prometheus Metrics
 *
 * Provides application metrics for monitoring:
 * - HTTP request counters and duration histograms
 * - Provider call counters
 * - Active mutex locks gauge
 */

import { Registry, Counter, Histogram, Gauge } from 'prom-client';

/**
 * Prometheus registry
 */
export const register = new Registry();

/**
 * HTTP request counter
 * Labels: route, method, status
 */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['route', 'method', 'status'],
  registers: [register],
});

/**
 * HTTP request duration histogram
 * Labels: route, method
 */
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['route', 'method'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/**
 * Provider API call counter
 * Labels: provider, command, status (success/error)
 */
export const providerCallsTotal = new Counter({
  name: 'provider_calls_total',
  help: 'Total number of provider API calls',
  labelNames: ['provider', 'command', 'status'],
  registers: [register],
});

/**
 * Active mutex locks gauge
 */
export const activeMutexLocks = new Gauge({
  name: 'active_mutex_locks',
  help: 'Number of active mutex locks',
  registers: [register],
});

/**
 * Helper: Increment HTTP request counter
 */
export function incHttpRequest(route: string, method: string, status: number): void {
  httpRequestsTotal.inc({
    route: normalizeRoute(route),
    method,
    status: String(status),
  });
}

/**
 * Helper: Observe HTTP request duration
 */
export function observeHttpDuration(route: string, method: string, durationSeconds: number): void {
  httpRequestDuration.observe({
    route: normalizeRoute(route),
    method,
  }, durationSeconds);
}

/**
 * Helper: Increment provider call counter
 */
export function incProviderCall(provider: string, command: string, status: 'success' | 'error'): void {
  providerCallsTotal.inc({
    provider,
    command,
    status,
  });
}

/**
 * Helper: Set active mutex locks count
 */
export function setActiveMutexLocks(count: number): void {
  activeMutexLocks.set(count);
}

/**
 * Normalize route path to remove dynamic segments
 * Example: /status/example.com -> /status/:domain
 */
function normalizeRoute(route: string): string {
  // Replace domain-like patterns
  let normalized = route.replace(/\/[a-zA-Z0-9.-]+\.(com|net|org|io|dev|app|co|xyz|tech|store|online|site|website|space|club|life|world|today|me|us|uk|ca|au|de|fr|it|es|ru|cn|jp|kr|in|br|mx|ar|cl|co\.uk|co\.in|co\.jp|com\.au|com\.br)$/i, '/:domain');

  // Replace UUID-like patterns
  normalized = normalized.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id');

  // Replace numeric IDs
  normalized = normalized.replace(/\/\d+/g, '/:id');

  return normalized;
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * Clear all metrics (for testing)
 */
export function clearMetrics(): void {
  register.clear();
}
