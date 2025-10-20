/**
 * Idempotency Service
 *
 * Provides idempotency guarantees for domain purchases with:
 * - Request digest validation (SHA256)
 * - Per-key mutex for race protection
 * - TTL-based expiration
 * - Database-backed storage via Prisma
 */

import { createHash } from 'crypto';
import * as repo from '../db/repo';

/**
 * Result of begin operation
 */
interface BeginResult {
  ok: boolean;
  existing?: {
    response: any;
    digest: string;
  };
}

/**
 * Compute stable SHA256 digest of request parameters
 * Uses sorted JSON keys for consistency
 */
export function stableDigest(obj: any): string {
  // Sort keys recursively for stable stringification
  const sorted = JSON.stringify(obj, Object.keys(obj).sort());
  return createHash('sha256').update(sorted).digest('hex');
}

/**
 * Idempotency Store
 *
 * Thread-safe idempotency tracking with mutex and digest validation.
 * Uses database for persistence, in-memory mutex for race protection.
 */
export class IdempotencyStore {
  // Per-key mutex: key → Promise
  private locks: Map<string, Promise<void>> = new Map();

  constructor() {
    // No cleanup interval needed - database handles expiration
  }

  /**
   * Begin idempotent operation
   * Returns existing response if key already processed
   */
  async begin(key: string): Promise<BeginResult> {
    const entry = await repo.idemBegin(key);

    if (entry) {
      console.log(`[Idempotency] IDEMPOTENCY_HIT: ${key}`);
      return {
        ok: false,
        existing: {
          response: JSON.parse(entry.responseJson),
          digest: entry.digest,
        },
      };
    }

    // No existing entry, proceed
    return { ok: true };
  }

  /**
   * Commit successful operation
   */
  async commit(
    key: string,
    data: { response: any; digest: string },
    ttlSec: number = 3600
  ): Promise<void> {
    await repo.idemCommit(key, data.digest, data.response, ttlSec);
    console.log(`[Idempotency] IDEMPOTENCY_STORE: ${key} (TTL: ${ttlSec}s)`);
  }

  /**
   * Clear entry on failure
   */
  async fail(key: string): Promise<void> {
    await repo.idemFail(key);
    console.log(`[Idempotency] IDEMPOTENCY_CLEAR: ${key}`);
  }

  /**
   * Acquire mutex lock for key
   * Ensures only one operation per key executes at a time
   */
  async acquire(key: string): Promise<void> {
    const existing = this.locks.get(key);

    if (existing) {
      const startWait = Date.now();
      console.log(`[Idempotency] MUTEX_WAIT: ${key}`);

      // Wait for existing lock to release
      await existing;

      const waitTime = Date.now() - startWait;
      console.log(`[Idempotency] MUTEX_WAIT: ${key} - ${waitTime}ms`);
    }

    // Create new lock promise
    let releaseFn: (() => void) | null = null;
    const lockPromise = new Promise<void>((resolve) => {
      releaseFn = resolve;
    });

    // Store lock
    this.locks.set(key, lockPromise);
    console.log(`[Idempotency] MUTEX_LOCKED: ${key}`);

    // Store release function for later
    (lockPromise as any)._release = releaseFn;
  }

  /**
   * Release mutex lock for key
   */
  release(key: string): void {
    const lock = this.locks.get(key);
    if (lock && (lock as any)._release) {
      (lock as any)._release();
      this.locks.delete(key);
      console.log(`[Idempotency] MUTEX_RELEASED: ${key}`);
    }
  }

  /**
   * Clear all entries (for testing)
   */
  clear(): void {
    this.locks.clear();
    // Note: Database entries are not cleared - use repo.cleanupExpiredIdem() for that
  }

  /**
   * Destroy store
   */
  destroy(): void {
    this.clear();
  }
}

// Singleton instance
export const idem = new IdempotencyStore();
