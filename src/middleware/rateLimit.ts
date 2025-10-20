/**
 * Rate Limiting Middleware
 *
 * Implements token bucket algorithm with sliding window timestamps.
 * Limits requests per account/IP to prevent abuse.
 */

import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { getLogger } from './logging';

/**
 * Token bucket for a single key
 */
interface TokenBucket {
  tokens: number;
  lastRefill: number;
  requestTimestamps: number[]; // Sliding window
}

/**
 * Rate limiter configuration
 */
interface RateLimiterConfig {
  requestsPerMinute: number;
  burstSize: number;
}

/**
 * Rate Limiter
 *
 * Uses token bucket algorithm with sliding window for accurate rate limiting.
 */
export class RateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private config: RateLimiterConfig;
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: RateLimiterConfig) {
    this.config = config;

    // Clean up old buckets every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check if request is allowed and consume token
   *
   * @param key - Account key or IP address
   * @returns { allowed: boolean, retryAfterSec?: number }
   */
  consume(key: string): { allowed: boolean; retryAfterSec?: number } {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window

    let bucket = this.buckets.get(key);

    if (!bucket) {
      // First request from this key
      bucket = {
        tokens: this.config.burstSize - 1, // Consume one token
        lastRefill: now,
        requestTimestamps: [now],
      };
      this.buckets.set(key, bucket);
      return { allowed: true };
    }

    // Remove timestamps outside the sliding window
    bucket.requestTimestamps = bucket.requestTimestamps.filter(
      (ts) => now - ts < windowMs
    );

    // Check if within rate limit using sliding window
    if (bucket.requestTimestamps.length >= this.config.requestsPerMinute) {
      // Calculate retry-after based on oldest timestamp in window
      const oldestTimestamp = bucket.requestTimestamps[0];
      const retryAfterMs = windowMs - (now - oldestTimestamp);
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);

      return { allowed: false, retryAfterSec };
    }

    // Refill tokens based on time elapsed
    const elapsedMs = now - bucket.lastRefill;
    const refillRate = this.config.requestsPerMinute / 60000; // tokens per ms
    const tokensToAdd = Math.floor(elapsedMs * refillRate);

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(
        bucket.tokens + tokensToAdd,
        this.config.burstSize
      );
      bucket.lastRefill = now;
    }

    // Check if we have tokens available for burst
    if (bucket.tokens <= 0) {
      // No burst tokens, but might be allowed by sliding window
      // Already checked above
      const retryAfterSec = Math.ceil(
        (60000 / this.config.requestsPerMinute) * 1000
      ) / 1000;
      return { allowed: false, retryAfterSec };
    }

    // Consume token and add timestamp
    bucket.tokens -= 1;
    bucket.requestTimestamps.push(now);

    return { allowed: true };
  }

  /**
   * Clean up old buckets
   */
  private cleanup(): void {
    const now = Date.now();
    const expiryMs = 10 * 60 * 1000; // 10 minutes
    let cleaned = 0;

    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > expiryMs) {
        this.buckets.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[RateLimit] Cleaned up ${cleaned} expired buckets`);
    }
  }

  /**
   * Get current bucket count (for monitoring)
   */
  size(): number {
    return this.buckets.size;
  }

  /**
   * Clear all buckets (for testing)
   */
  clear(): void {
    this.buckets.clear();
  }

  /**
   * Destroy rate limiter
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.buckets.clear();
  }
}

/**
 * Rate limiting middleware factory
 *
 * @param limiter - RateLimiter instance
 * @returns Express middleware
 */
export function rateLimitMiddleware(limiter: RateLimiter) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const log = getLogger(req);

    // Get rate limit key: account key (user ID or "anon") or IP fallback
    const key = authReq.accountKey || req.ip || 'unknown';

    // Check rate limit
    const result = limiter.consume(key);

    if (!result.allowed) {
      log.warn({
        event: 'rate_limit_exceeded',
        key,
        retryAfterSec: result.retryAfterSec,
      });

      res.set('Retry-After', String(result.retryAfterSec || 60));
      res.status(429).json({
        error: 'RateLimited',
        message: 'Too many requests',
        retryAfterSec: result.retryAfterSec || 60,
      });
      return;
    }

    next();
  };
}
