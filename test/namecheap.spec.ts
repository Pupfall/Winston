/**
 * Namecheap Provider Tests
 *
 * Unit tests with mocked HTTP responses
 * Integration tests run only when RUN_NAMECHEAP_SANDBOX=1
 */

import { NamecheapProvider } from '../src/providers/namecheap';

// Mock fetch globally
global.fetch = jest.fn();

describe('NamecheapProvider', () => {
  let provider: NamecheapProvider;

  beforeEach(() => {
    provider = new NamecheapProvider({
      apiUser: 'test_user',
      apiKey: 'test_key',
      username: 'test_user',
      clientIp: '127.0.0.1',
      baseUrl: 'https://api.sandbox.namecheap.com/xml.response',
    });

    // Clear mock calls
    (fetch as jest.Mock).mockClear();
  });

  describe('checkAvailability', () => {
    it('should parse available domain correctly', async () => {
      // Mock pricing response
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.users.getPricing">
              <UserGetPricingResult>
                <ProductType Name="domains">
                  <ProductCategory Name="domains">
                    <Product Name="com">
                      <Price Duration="1" DurationType="YEAR" Price="10.98" YourPrice="10.98" />
                    </Product>
                  </ProductCategory>
                </ProductType>
              </UserGetPricingResult>
            </CommandResponse>
          </ApiResponse>`,
      });

      // Mock availability check response
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.domains.check">
              <DomainCheckResult Domain="testdomain123.com" Available="true" IsPremiumName="false" />
            </CommandResponse>
          </ApiResponse>`,
      });

      const results = await provider.checkAvailability(['testdomain123.com']);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        domain: 'testdomain123.com',
        available: true,
        premium: false,
      });
      expect(results[0].price_usd).toBeGreaterThan(0);
    });

    it('should parse unavailable domain correctly', async () => {
      // Mock pricing
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.users.getPricing">
              <UserGetPricingResult>
                <ProductType Name="domains">
                  <ProductCategory Name="domains">
                    <Product Name="com">
                      <Price Duration="1" DurationType="YEAR" Price="10.98" />
                    </Product>
                  </ProductCategory>
                </ProductType>
              </UserGetPricingResult>
            </CommandResponse>
          </ApiResponse>`,
      });

      // Mock availability
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.domains.check">
              <DomainCheckResult Domain="google.com" Available="false" IsPremiumName="false" />
            </CommandResponse>
          </ApiResponse>`,
      });

      const results = await provider.checkAvailability(['google.com']);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        domain: 'google.com',
        available: false,
        premium: false,
      });
    });

    it('should detect premium domains', async () => {
      // Mock pricing
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.users.getPricing">
              <UserGetPricingResult>
                <ProductType Name="domains">
                  <ProductCategory Name="domains">
                    <Product Name="com">
                      <Price Duration="1" DurationType="YEAR" Price="10.98" />
                    </Product>
                  </ProductCategory>
                </ProductType>
              </UserGetPricingResult>
            </CommandResponse>
          </ApiResponse>`,
      });

      // Mock availability with premium
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.domains.check">
              <DomainCheckResult Domain="ai.com" Available="true" IsPremiumName="true" PremiumRegistrationPrice="50000.00" />
            </CommandResponse>
          </ApiResponse>`,
      });

      const results = await provider.checkAvailability(['ai.com']);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        domain: 'ai.com',
        available: true,
        premium: true,
      });
      expect(results[0].price_usd).toBeGreaterThan(1000);
    });

    it('should handle API errors gracefully', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="ERROR" xmlns="http://api.namecheap.com/xml.response">
            <Errors>
              <Error Number="2011170">API Key is invalid or API access has not been enabled</Error>
            </Errors>
          </ApiResponse>`,
      });

      await expect(provider.checkAvailability(['test.com'])).rejects.toThrow();
    });
  });

  describe('quote', () => {
    it('should return valid quote for standard domain', async () => {
      // Mock pricing
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.users.getPricing">
              <UserGetPricingResult>
                <ProductType Name="domains">
                  <ProductCategory Name="domains">
                    <Product Name="com">
                      <Price Duration="1" DurationType="YEAR" Price="10.98" />
                    </Product>
                  </ProductCategory>
                </ProductType>
              </UserGetPricingResult>
            </CommandResponse>
          </ApiResponse>`,
      });

      // Mock availability (for premium check)
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.domains.check">
              <DomainCheckResult Domain="testdomain.com" Available="true" IsPremiumName="false" />
            </CommandResponse>
          </ApiResponse>`,
      });

      const quote = await provider.quote('testdomain.com', 1, true);

      expect(quote).toMatchObject({
        domain: 'testdomain.com',
        premium: false,
      });
      expect(quote.total_usd).toBeGreaterThan(0);
      expect(quote.icann_fee_usd).toBe(0.18);
    });

    it('should calculate multi-year pricing correctly', async () => {
      // Mock pricing
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.users.getPricing">
              <UserGetPricingResult>
                <ProductType Name="domains">
                  <ProductCategory Name="domains">
                    <Product Name="com">
                      <Price Duration="1" DurationType="YEAR" Price="10.00" />
                    </Product>
                  </ProductCategory>
                </ProductType>
              </UserGetPricingResult>
            </CommandResponse>
          </ApiResponse>`,
      });

      // Mock availability
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.domains.check">
              <DomainCheckResult Domain="test.com" Available="true" IsPremiumName="false" />
            </CommandResponse>
          </ApiResponse>`,
      });

      const quote = await provider.quote('test.com', 3, false);

      expect(quote.registration_price_usd).toBeCloseTo(30.0, 1);
      expect(quote.icann_fee_usd).toBeCloseTo(0.54, 2);
    });
  });

  describe('register', () => {
    it('should successfully register a domain', async () => {
      // Mock pricing
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.users.getPricing">
              <UserGetPricingResult>
                <ProductType Name="domains">
                  <ProductCategory Name="domains">
                    <Product Name="com">
                      <Price Duration="1" DurationType="YEAR" Price="10.98" />
                    </Product>
                  </ProductCategory>
                </ProductType>
              </UserGetPricingResult>
            </CommandResponse>
          </ApiResponse>`,
      });

      // Mock availability for quote
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.domains.check">
              <DomainCheckResult Domain="newdomain.com" Available="true" IsPremiumName="false" />
            </CommandResponse>
          </ApiResponse>`,
      });

      // Mock pricing (again for quote)
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.users.getPricing">
              <UserGetPricingResult>
                <ProductType Name="domains">
                  <ProductCategory Name="domains">
                    <Product Name="com">
                      <Price Duration="1" DurationType="YEAR" Price="10.98" />
                    </Product>
                  </ProductCategory>
                </ProductType>
              </UserGetPricingResult>
            </CommandResponse>
          </ApiResponse>`,
      });

      // Mock availability for register
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.domains.check">
              <DomainCheckResult Domain="newdomain.com" Available="true" IsPremiumName="false" />
            </CommandResponse>
          </ApiResponse>`,
      });

      // Mock registration
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.domains.create">
              <DomainCreateResult Domain="newdomain.com" Registered="true" OrderID="12345" TransactionID="67890" ChargedAmount="11.16" />
            </CommandResponse>
          </ApiResponse>`,
      });

      const result = await provider.register({
        domain: 'newdomain.com',
        years: 1,
        privacy: true,
      });

      expect(result.success).toBe(true);
      expect(result.order_id).toBe('12345');
      expect(result.charged_total_usd).toBeGreaterThan(0);
    });

    it('should fail registration for unavailable domain', async () => {
      // Mock pricing
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.users.getPricing">
              <UserGetPricingResult>
                <ProductType Name="domains">
                  <ProductCategory Name="domains">
                    <Product Name="com">
                      <Price Duration="1" DurationType="YEAR" Price="10.98" />
                    </Product>
                  </ProductCategory>
                </ProductType>
              </UserGetPricingResult>
            </CommandResponse>
          </ApiResponse>`,
      });

      // Mock availability
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.domains.check">
              <DomainCheckResult Domain="google.com" Available="false" IsPremiumName="false" />
            </CommandResponse>
          </ApiResponse>`,
      });

      // Mock pricing (for quote check)
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.users.getPricing">
              <UserGetPricingResult>
                <ProductType Name="domains">
                  <ProductCategory Name="domains">
                    <Product Name="com">
                      <Price Duration="1" DurationType="YEAR" Price="10.98" />
                    </Product>
                  </ProductCategory>
                </ProductType>
              </UserGetPricingResult>
            </CommandResponse>
          </ApiResponse>`,
      });

      // Mock availability check before register
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.domains.check">
              <DomainCheckResult Domain="google.com" Available="false" IsPremiumName="false" />
            </CommandResponse>
          </ApiResponse>`,
      });

      const result = await provider.register({
        domain: 'google.com',
        years: 1,
        privacy: false,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not available');
    });
  });

  describe('status', () => {
    it('should return status for registered domain', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
            <CommandResponse Type="namecheap.domains.getInfo">
              <DomainGetInfoResult Status="Ok" ID="12345">
                <DomainDetails>
                  <CreatedDate>2023-01-01</CreatedDate>
                  <ExpiredDate>2024-01-01</ExpiredDate>
                </DomainDetails>
                <DnsDetails>
                  <Nameserver>ns1.namecheap.com</Nameserver>
                  <Nameserver>ns2.namecheap.com</Nameserver>
                </DnsDetails>
                <Modificationrights All="true" />
              </DomainGetInfoResult>
            </CommandResponse>
          </ApiResponse>`,
      });

      const status = await provider.status('testdomain.com');

      expect(status.state).toBe('active');
      expect(status.details.registered).toBe(true);
      expect(status.details.nameservers).toHaveLength(2);
    });

    it('should return not_found for unregistered domain', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
          <ApiResponse Status="ERROR" xmlns="http://api.namecheap.com/xml.response">
            <Errors>
              <Error Number="2019166">Domain not found</Error>
            </Errors>
          </ApiResponse>`,
      });

      const status = await provider.status('nonexistent.com');

      expect(status.state).toBe('not_found');
      expect(status.details.registered).toBe(false);
    });
  });
});

// Integration tests (only run with RUN_NAMECHEAP_SANDBOX=1)
describe('NamecheapProvider Integration', () => {
  const runIntegration = process.env.RUN_NAMECHEAP_SANDBOX === '1';

  if (!runIntegration) {
    it.skip('Integration tests disabled (set RUN_NAMECHEAP_SANDBOX=1 to enable)', () => {});
    return;
  }

  let provider: NamecheapProvider;

  beforeAll(() => {
    // Restore real fetch
    delete (global as any).fetch;

    provider = new NamecheapProvider({
      apiUser: process.env.NAMECHEAP_API_USER!,
      apiKey: process.env.NAMECHEAP_API_KEY!,
      username: process.env.NAMECHEAP_USERNAME!,
      clientIp: process.env.NAMECHEAP_CLIENT_IP!,
      baseUrl: process.env.NAMECHEAP_BASE_URL,
    });
  });

  it('should check real domain availability', async () => {
    const results = await provider.checkAvailability(['google.com', 'thisdomainshouldbeavailable123456.com']);

    expect(results).toHaveLength(2);
    expect(results[0].domain).toBe('google.com');
    expect(results[0].available).toBe(false);
    expect(results[1].available).toBe(true);
  }, 30000);

  it('should get real pricing quote', async () => {
    const quote = await provider.quote('testdomain12345.com', 1, true);

    expect(quote.total_usd).toBeGreaterThan(0);
    expect(quote.icann_fee_usd).toBe(0.18);
  }, 30000);
});
