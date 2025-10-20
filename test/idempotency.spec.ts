/**
 * Idempotency Service Tests
 */

import { IdempotencyStore, stableDigest } from '../src/lib/idem';
import { prisma } from '../src/db/prisma';

describe('IdempotencyStore', () => {
  let store: IdempotencyStore;

  beforeEach(() => {
    store = new IdempotencyStore();
  });

  afterEach(async () => {
    store.destroy();
    // Clean up database entries created during tests
    await prisma.idem.deleteMany({});
  });

  describe('stableDigest', () => {
    it('should generate consistent digest for same object', () => {
      const obj = { domain: 'example.com', years: 1, price: 12.0 };
      const digest1 = stableDigest(obj);
      const digest2 = stableDigest(obj);

      expect(digest1).toBe(digest2);
      expect(digest1).toHaveLength(64); // SHA256 hex
    });

    it('should generate same digest regardless of key order', () => {
      const obj1 = { domain: 'example.com', years: 1, price: 12.0 };
      const obj2 = { price: 12.0, domain: 'example.com', years: 1 };

      const digest1 = stableDigest(obj1);
      const digest2 = stableDigest(obj2);

      expect(digest1).toBe(digest2);
    });

    it('should generate different digest for different values', () => {
      const obj1 = { domain: 'example.com', years: 1 };
      const obj2 = { domain: 'example.com', years: 2 };

      const digest1 = stableDigest(obj1);
      const digest2 = stableDigest(obj2);

      expect(digest1).not.toBe(digest2);
    });
  });

  describe('begin/commit/fail', () => {
    it('should allow first operation', async () => {
      const result = await store.begin('test-key');

      expect(result.ok).toBe(true);
      expect(result.existing).toBeUndefined();
    });

    it('should return existing response on replay', async () => {
      const key = 'test-key';
      const response = { order_id: '123', total: 12.0 };
      const digest = 'test-digest';

      // First call - should allow
      const first = await store.begin(key);
      expect(first.ok).toBe(true);

      // Commit
      await store.commit(key, { response, digest });

      // Second call - should return existing
      const second = await store.begin(key);
      expect(second.ok).toBe(false);
      expect(second.existing?.response).toEqual(response);
      expect(second.existing?.digest).toBe(digest);
    });

    it('should clear entry on fail', async () => {
      const key = 'test-key';

      // Begin
      const first = await store.begin(key);
      expect(first.ok).toBe(true);

      // Fail
      await store.fail(key);

      // Should allow retry
      const second = await store.begin(key);
      expect(second.ok).toBe(true);
    });

    it('should expire entries after TTL', async () => {
      const key = 'test-key';
      const response = { order_id: '123' };
      const digest = 'test-digest';

      // Commit with 1 second TTL
      await store.commit(key, { response, digest }, 1);

      // Immediately - should exist
      const first = await store.begin(key);
      expect(first.ok).toBe(false);

      // Wait 1.5 seconds
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Should be expired
      const second = await store.begin(key);
      expect(second.ok).toBe(true);
    });
  });

  describe('mutex', () => {
    it('should serialize concurrent operations', async () => {
      const key = 'test-key';
      const results: number[] = [];

      // Simulate two concurrent operations
      const op1 = async () => {
        await store.acquire(key);
        results.push(1);
        await new Promise(resolve => setTimeout(resolve, 100));
        results.push(2);
        store.release(key);
      };

      const op2 = async () => {
        await store.acquire(key);
        results.push(3);
        await new Promise(resolve => setTimeout(resolve, 50));
        results.push(4);
        store.release(key);
      };

      // Run concurrently
      await Promise.all([op1(), op2()]);

      // Should be serialized: [1,2,3,4] or [3,4,1,2]
      expect(results).toHaveLength(4);
      const isValid =
        (results[0] === 1 && results[1] === 2 && results[2] === 3 && results[3] === 4) ||
        (results[0] === 3 && results[1] === 4 && results[2] === 1 && results[3] === 2);
      expect(isValid).toBe(true);
    });

    it('should not block different keys', async () => {
      const results: string[] = [];

      const op1 = async () => {
        await store.acquire('key1');
        results.push('a');
        await new Promise(resolve => setTimeout(resolve, 100));
        results.push('b');
        store.release('key1');
      };

      const op2 = async () => {
        await store.acquire('key2');
        results.push('c');
        await new Promise(resolve => setTimeout(resolve, 50));
        results.push('d');
        store.release('key2');
      };

      await Promise.all([op1(), op2()]);

      // Different keys can interleave
      expect(results).toContain('a');
      expect(results).toContain('b');
      expect(results).toContain('c');
      expect(results).toContain('d');
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', async () => {
      const key = 'test-key';
      const response = { order_id: '123' };
      const digest = 'test-digest';

      // Store with 1 second TTL
      await store.commit(key, { response, digest }, 1);

      // Verify entry exists
      const resultBefore = await store.begin(key);
      expect(resultBefore.ok).toBe(false);
      expect(resultBefore.existing?.response).toEqual(response);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Verify expired entry is cleaned up and not returned
      const resultAfter = await store.begin(key);
      expect(resultAfter.ok).toBe(true);
      expect(resultAfter.existing).toBeUndefined();
    });
  });
});
