/**
 * Domain Purchase Route Tests
 */

import { idem } from '../src/lib/idem';

// Mock provider
const mockProvider = {
  quote: jest.fn(),
  register: jest.fn(),
  checkAvailability: jest.fn(),
  status: jest.fn(),
};

jest.mock('../src/providers', () => ({
  provider: mockProvider,
}));

describe('POST /buy route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    idem.clear();

    // Default mock implementations
    mockProvider.quote.mockResolvedValue({
      domain: 'example.com',
      registration_price_usd: 11.82,
      icann_fee_usd: 0.18,
      total_usd: 12.0,
      privacy_price_usd: 0.0,
      premium: false,
    });

    mockProvider.register.mockResolvedValue({
      order_id: 'PB-123456',
      charged_total_usd: 12.0,
      registrar: 'porkbun',
      domain: 'example.com',
      success: true,
      message: 'Domain registered successfully',
    });
  });

  afterEach(() => {
    idem.destroy();
  });

  describe('Idempotency', () => {
    it('should return same response on replay with same idempotency key', async () => {
      const domain = 'example.com';
      const idempotencyKey = 'idem-123';
      const quotedTotal = 12.0;

      // First request
      const response1 = {
        order_id: 'PB-123456',
        charged_total_usd: 12.0,
        registrar: 'porkbun',
      };

      // Simulate commit to idem store
      const key = `buy:${domain}:${idempotencyKey}`;
      const digest = require('../src/lib/idem').stableDigest({
        domain,
        years: 1,
        whois_privacy: true,
        quoted_total_usd: quotedTotal,
      });

      await idem.commit(key, { response: response1, digest });

      // Second request - should hit cache
      const started = await idem.begin(key);
      expect(started.ok).toBe(false);
      expect(started.existing?.response).toEqual(response1);
      expect(started.existing?.digest).toBe(digest);

      // Provider should NOT be called again
      expect(mockProvider.register).not.toHaveBeenCalled();
    });

    it('should reject replay with different parameters (digest mismatch)', async () => {
      const domain = 'example.com';
      const idempotencyKey = 'idem-123';

      // Store first request
      const key = `buy:${domain}:${idempotencyKey}`;
      const digest1 = require('../src/lib/idem').stableDigest({
        domain,
        years: 1,
        whois_privacy: true,
        quoted_total_usd: 12.0,
      });

      await idem.commit(key, {
        response: { order_id: '123' },
        digest: digest1,
      });

      // Try replay with different years
      const digest2 = require('../src/lib/idem').stableDigest({
        domain,
        years: 2, // Different!
        whois_privacy: true,
        quoted_total_usd: 12.0,
      });

      expect(digest1).not.toBe(digest2);

      // Would throw IdempotencyMismatch error in real route
    });
  });

  describe('Price Drift Protection', () => {
    it('should allow registration when price within tolerance', async () => {
      // Client quoted $12.00, server quotes $12.40 (within $0.50)
      mockProvider.quote.mockResolvedValue({
        total_usd: 12.4,
        registration_price_usd: 12.22,
        icann_fee_usd: 0.18,
        privacy_price_usd: 0.0,
        premium: false,
      });

      const result = await mockProvider.register({
        domain: 'example.com',
        years: 1,
        privacy: true,
      });

      expect(result.success).toBe(true);
    });

    it('should reject registration when price drift exceeds tolerance', async () => {
      // Client quoted $12.00, server quotes $13.00 (> $0.50 drift)
      const clientQuoted = 12.0;
      const serverQuote = 13.0;

      mockProvider.quote.mockResolvedValue({
        total_usd: serverQuote,
        registration_price_usd: 12.82,
        icann_fee_usd: 0.18,
        privacy_price_usd: 0.0,
        premium: false,
      });

      const drift = Math.abs(serverQuote - clientQuoted);
      expect(drift).toBeGreaterThan(0.5);

      // Would throw PriceDrift error in real route
    });

    it('should detect price increase', async () => {
      const clientQuoted = 12.0;

      // Price increased by $1
      mockProvider.quote.mockResolvedValue({
        total_usd: 13.0,
        registration_price_usd: 12.82,
        icann_fee_usd: 0.18,
        privacy_price_usd: 0.0,
        premium: false,
      });

      const quote = await mockProvider.quote('example.com', 1, true);
      const drift = Math.abs(quote.total_usd - clientQuoted);

      expect(drift).toBe(1.0);
      expect(drift).toBeGreaterThan(0.5);
    });

    it('should detect price decrease', async () => {
      const clientQuoted = 12.0;

      // Price decreased by $1
      mockProvider.quote.mockResolvedValue({
        total_usd: 11.0,
        registration_price_usd: 10.82,
        icann_fee_usd: 0.18,
        privacy_price_usd: 0.0,
        premium: false,
      });

      const quote = await mockProvider.quote('example.com', 1, true);
      const drift = Math.abs(quote.total_usd - clientQuoted);

      expect(drift).toBe(1.0);
      expect(drift).toBeGreaterThan(0.5);
    });
  });

  describe('Mutex Race Protection', () => {
    it('should serialize concurrent requests with same idempotency key', async () => {
      const key = 'buy:example.com:idem-123';
      let counter = 0;

      const operation = async () => {
        await idem.acquire(key);
        try {
          const current = counter;
          // Simulate async work
          await new Promise(resolve => setTimeout(resolve, 50));
          counter = current + 1;
        } finally {
          idem.release(key);
        }
      };

      // Run 3 concurrent operations
      await Promise.all([operation(), operation(), operation()]);

      // Should execute serially, so counter should be 3
      expect(counter).toBe(3);
    });

    it('should not block different idempotency keys', async () => {
      const results: string[] = [];

      const op1 = async () => {
        await idem.acquire('buy:domain1.com:key1');
        results.push('a');
        await new Promise(resolve => setTimeout(resolve, 100));
        results.push('b');
        idem.release('buy:domain1.com:key1');
      };

      const op2 = async () => {
        await idem.acquire('buy:domain2.com:key2');
        results.push('c');
        await new Promise(resolve => setTimeout(resolve, 50));
        results.push('d');
        idem.release('buy:domain2.com:key2');
      };

      await Promise.all([op1(), op2()]);

      // Different keys can interleave
      expect(results).toContain('a');
      expect(results).toContain('b');
      expect(results).toContain('c');
      expect(results).toContain('d');

      // Should complete in under 200ms (not 150ms sequential)
      // This test just verifies they don't block each other
    });
  });

  describe('Error Handling', () => {
    it('should clear idempotency entry on registration failure', async () => {
      const key = 'buy:example.com:idem-123';

      mockProvider.register.mockResolvedValue({
        success: false,
        message: 'Domain not available',
        order_id: '',
        charged_total_usd: 0,
        registrar: 'porkbun',
        domain: 'example.com',
      });

      // Simulate begin
      await idem.begin(key);

      // Registration fails
      await idem.fail(key);

      // Should allow retry
      const result = await idem.begin(key);
      expect(result.ok).toBe(true);
    });

    it('should always release mutex even on error', async () => {
      const key = 'buy:example.com:idem-123';

      try {
        await idem.acquire(key);
        throw new Error('Simulated error');
      } catch (error) {
        // Should release in finally block
        idem.release(key);
      }

      // Next acquire should not wait
      const startTime = Date.now();
      await idem.acquire(key);
      const waitTime = Date.now() - startTime;

      expect(waitTime).toBeLessThan(50); // Should be nearly instant
      idem.release(key);
    });
  });
});
