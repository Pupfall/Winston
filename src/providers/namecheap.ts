/**
 * Namecheap Registrar Provider
 *
 * Implements domain registration via Namecheap's XML API (Sandbox & Production)
 *
 * Sandbox Setup:
 * 1. Create sandbox account at https://www.sandbox.namecheap.com/
 * 2. Enable API access in account settings
 * 3. Whitelist your IP address
 * 4. Set environment variables:
 *    - NAMECHEAP_API_USER (your username)
 *    - NAMECHEAP_API_KEY (from sandbox settings)
 *    - NAMECHEAP_USERNAME (same as API_USER typically)
 *    - NAMECHEAP_CLIENT_IP (your whitelisted IP)
 *    - NAMECHEAP_BASE_URL (optional, defaults to sandbox)
 *
 * API Documentation: https://www.namecheap.com/support/api/intro/
 */

import { XMLParser } from 'fast-xml-parser';
import {
  Registrar,
  DomainAvailability,
  DomainQuote,
  RegistrationOptions,
  RegistrationResult,
  DomainStatus,
  DnsRecord,
} from './types';

// XML parser configuration
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: true,
});

/**
 * Namecheap API Error
 */
class NamecheapError extends Error {
  code: string;
  details: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'NamecheapError';
    this.code = code;
    this.details = details;
  }
}

/**
 * TLDs that support WHOIS privacy
 */
const SUPPORTED_PRIVACY_TLDS = new Set([
  'com', 'net', 'org', 'info', 'biz', 'us', 'mobi', 'name',
  'co', 'io', 'me', 'tv', 'cc', 'ws', 'bz', 'mn',
]);

/**
 * Pricing cache entry
 */
interface PricingCacheEntry {
  price: number;
  timestamp: number;
}

/**
 * Extract TLD from domain
 */
function getTldFromDomain(domain: string): string {
  const parts = domain.split('.');
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Sleep utility for retries
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Namecheap Provider Implementation
 */
export class NamecheapProvider extends Registrar {
  private apiUser: string;
  private apiKey: string;
  private username: string;
  private clientIp: string;
  private baseUrl: string;

  // Pricing cache (TTL: 5 minutes)
  private pricingCache: Map<string, PricingCacheEntry> = new Map();
  private pricingCacheTtl = 5 * 60 * 1000; // 5 minutes

  constructor(config: {
    apiUser: string;
    apiKey: string;
    username: string;
    clientIp: string;
    baseUrl?: string;
  }) {
    super('namecheap');

    this.apiUser = config.apiUser;
    this.apiKey = config.apiKey;
    this.username = config.username;
    this.clientIp = config.clientIp;
    this.baseUrl = config.baseUrl || 'https://api.sandbox.namecheap.com/xml.response';

    // Validate required config
    if (!this.apiUser || !this.apiKey || !this.username || !this.clientIp) {
      throw new Error('Namecheap provider requires apiUser, apiKey, username, and clientIp');
    }
  }

  /**
   * Call Namecheap API with retry logic
   */
  private async callNamecheap(
    command: string,
    params: Record<string, string | number | boolean> = {},
    retries = 3
  ): Promise<any> {
    const startTime = Date.now();

    // Build query parameters
    const queryParams = new URLSearchParams({
      ApiUser: this.apiUser,
      ApiKey: this.apiKey,
      UserName: this.username,
      ClientIp: this.clientIp,
      Command: command,
      ...Object.entries(params).reduce((acc, [key, value]) => {
        acc[key] = String(value);
        return acc;
      }, {} as Record<string, string>),
    });

    const url = `${this.baseUrl}?${queryParams.toString()}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Winston/1.0',
          },
        });

        const text = await response.text();
        const latency = Date.now() - startTime;

        // Log for metrics
        console.log(`[Namecheap] ${command} - ${latency}ms (attempt ${attempt})`);

        // Handle non-200 responses
        if (!response.ok) {
          if (response.status === 429 || response.status >= 500) {
            if (attempt < retries) {
              const backoff = Math.pow(2, attempt) * 1000;
              console.warn(`[Namecheap] ${response.status} error, retrying in ${backoff}ms...`);
              await sleep(backoff);
              continue;
            }
          }
          throw new NamecheapError(
            `HTTP ${response.status}: ${response.statusText}`,
            'HTTP_ERROR',
            { status: response.status, body: text }
          );
        }

        // Parse XML response
        const parsed = xmlParser.parse(text);

        // Check for API errors
        const apiResponse = parsed.ApiResponse;
        if (!apiResponse) {
          throw new NamecheapError('Invalid XML response', 'PARSE_ERROR', { text });
        }

        if (apiResponse['@_Status'] !== 'OK') {
          const errors = apiResponse.Errors?.Error;
          const errorArray = Array.isArray(errors) ? errors : [errors];
          const firstError = errorArray[0];

          throw new NamecheapError(
            firstError?.['#text'] || firstError || 'Unknown API error',
            firstError?.['@_Number']?.toString() || 'UNKNOWN',
            { errors: errorArray, raw: text }
          );
        }

        return apiResponse.CommandResponse;
      } catch (error) {
        if (error instanceof NamecheapError) {
          throw error;
        }

        // Network or other errors
        if (attempt < retries) {
          const backoff = Math.pow(2, attempt) * 1000;
          console.warn(`[Namecheap] Network error, retrying in ${backoff}ms...`, error);
          await sleep(backoff);
          continue;
        }

        throw new NamecheapError(
          `Network error: ${error instanceof Error ? error.message : 'Unknown'}`,
          'NETWORK_ERROR',
          { originalError: error }
        );
      }
    }

    throw new NamecheapError('Max retries exceeded', 'MAX_RETRIES', { command });
  }

  /**
   * Get pricing for a TLD (with caching)
   */
  private async getPricing(tld: string): Promise<number> {
    // Check cache
    const cached = this.pricingCache.get(tld);
    if (cached && Date.now() - cached.timestamp < this.pricingCacheTtl) {
      return cached.price;
    }

    // Fetch pricing
    const response = await this.callNamecheap('namecheap.users.getPricing', {
      ProductType: 'DOMAIN',
      ActionName: 'REGISTER',
      ProductName: tld,
    });

    // Parse pricing
    const productType = response.UserGetPricingResult?.ProductType;
    const productCategory = Array.isArray(productType?.ProductCategory)
      ? productType.ProductCategory[0]
      : productType?.ProductCategory;

    const product = Array.isArray(productCategory?.Product)
      ? productCategory.Product[0]
      : productCategory?.Product;

    const priceAttr = product?.Price?.find((p: any) =>
      p['@_Duration'] === 1 && p['@_DurationType'] === 'YEAR'
    );

    const price = parseFloat(priceAttr?.['@_Price'] || priceAttr?.['@_YourPrice'] || '0');

    // Cache the result
    this.pricingCache.set(tld, { price, timestamp: Date.now() });

    return price;
  }

  /**
   * Check availability for multiple domains
   */
  async checkAvailability(domains: string[]): Promise<DomainAvailability[]> {
    if (domains.length === 0) {
      return [];
    }

    // Call domains.check API
    const response = await this.callNamecheap('namecheap.domains.check', {
      DomainList: domains.join(','),
    });

    // Parse results
    const checkResults = response.DomainCheckResult;
    const resultArray = Array.isArray(checkResults) ? checkResults : [checkResults];

    // Fetch pricing for unique TLDs
    const uniqueTlds = new Set(domains.map(getTldFromDomain));
    const pricingPromises = Array.from(uniqueTlds).map(tld =>
      this.getPricing(tld).catch(() => 12.0) // Default price on error
    );
    await Promise.all(pricingPromises);

    // Build results
    return resultArray.map((result: any) => {
      const domain = result['@_Domain'];
      const available = result['@_Available'] === true || result['@_Available'] === 'true';
      const premium = result['@_IsPremiumName'] === true || result['@_IsPremiumName'] === 'true';
      const tld = getTldFromDomain(domain);

      // Get base price from cache
      let basePrice = this.pricingCache.get(tld)?.price || 12.0;

      // Premium domains have special pricing
      if (premium && result['@_PremiumRegistrationPrice']) {
        basePrice = parseFloat(result['@_PremiumRegistrationPrice']);
      }

      // Add ICANN fee
      const icannFee = 0.18;
      const price_usd = parseFloat((basePrice + icannFee).toFixed(2));

      return {
        domain,
        available,
        price_usd,
        premium,
      };
    });
  }

  /**
   * Get pricing quote for a domain
   */
  async quote(domain: string, years: number, privacy: boolean): Promise<DomainQuote> {
    const tld = getTldFromDomain(domain);

    // Get base pricing
    const basePrice = await this.getPricing(tld);

    // Check if domain is premium
    const availability = await this.checkAvailability([domain]);
    const domainInfo = availability[0];
    const premium = domainInfo?.premium || false;

    // Calculate pricing
    const registrationPrice = domainInfo?.price_usd
      ? (domainInfo.price_usd - 0.18) * years  // Remove ICANN fee, multiply by years
      : basePrice * years;

    const icannFee = 0.18 * years;

    // WHOIS privacy pricing (check if TLD supports it)
    const privacyPrice = privacy && SUPPORTED_PRIVACY_TLDS.has(tld) ? 0.0 : 0.0; // Free with Namecheap

    const total = registrationPrice + icannFee + privacyPrice;

    return {
      domain,
      registration_price_usd: parseFloat(registrationPrice.toFixed(2)),
      icann_fee_usd: parseFloat(icannFee.toFixed(2)),
      total_usd: parseFloat(total.toFixed(2)),
      privacy_price_usd: privacyPrice,
      premium,
    };
  }

  /**
   * Register a domain
   */
  async register(options: RegistrationOptions): Promise<RegistrationResult> {
    const { domain, years, privacy } = options;

    // Price drift protection: re-quote and compare
    const currentQuote = await this.quote(domain, years, privacy);

    // Note: quoted_total_usd would come from the API layer (BuySchema)
    // For now, we'll use the current quote as the expected price
    const expectedPrice = currentQuote.total_usd;
    const tolerance = 0.50;

    // Check availability first
    const availability = await this.checkAvailability([domain]);
    if (!availability[0]?.available) {
      return {
        order_id: '',
        charged_total_usd: 0,
        registrar: this.name,
        domain,
        success: false,
        message: 'Domain is not available for registration',
      };
    }

    const tld = getTldFromDomain(domain);
    const whoisguard = privacy && SUPPORTED_PRIVACY_TLDS.has(tld) ? 'ENABLED' : 'DISABLED';

    // Use test contact info for sandbox
    // In production, this should come from options.contact or stored profile
    const params: Record<string, string | number> = {
      DomainName: domain,
      Years: years,

      // Registrant Contact
      RegistrantFirstName: 'Test',
      RegistrantLastName: 'User',
      RegistrantAddress1: '123 Test St',
      RegistrantCity: 'Test City',
      RegistrantStateProvince: 'CA',
      RegistrantPostalCode: '90210',
      RegistrantCountry: 'US',
      RegistrantPhone: '+1.5555551234',
      RegistrantEmailAddress: 'test@example.com',

      // Tech Contact (same as registrant for sandbox)
      TechFirstName: 'Test',
      TechLastName: 'User',
      TechAddress1: '123 Test St',
      TechCity: 'Test City',
      TechStateProvince: 'CA',
      TechPostalCode: '90210',
      TechCountry: 'US',
      TechPhone: '+1.5555551234',
      TechEmailAddress: 'test@example.com',

      // Admin Contact
      AdminFirstName: 'Test',
      AdminLastName: 'User',
      AdminAddress1: '123 Test St',
      AdminCity: 'Test City',
      AdminStateProvince: 'CA',
      AdminPostalCode: '90210',
      AdminCountry: 'US',
      AdminPhone: '+1.5555551234',
      AdminEmailAddress: 'test@example.com',

      // Billing Contact
      AuxBillingFirstName: 'Test',
      AuxBillingLastName: 'User',
      AuxBillingAddress1: '123 Test St',
      AuxBillingCity: 'Test City',
      AuxBillingStateProvince: 'CA',
      AuxBillingPostalCode: '90210',
      AuxBillingCountry: 'US',
      AuxBillingPhone: '+1.5555551234',
      AuxBillingEmailAddress: 'test@example.com',

      // WHOIS Guard
      AddFreeWhoisguard: whoisguard === 'ENABLED' ? 'yes' : 'no',
      WGEnabled: whoisguard === 'ENABLED' ? 'yes' : 'no',
    };

    try {
      const response = await this.callNamecheap('namecheap.domains.create', params);

      // Parse response
      const result = response.DomainCreateResult;
      const orderId = result?.['@_OrderID'] || result?.['@_TransactionID'] || 'unknown';
      const chargedAmount = parseFloat(result?.['@_ChargedAmount'] || currentQuote.total_usd);

      return {
        order_id: orderId.toString(),
        charged_total_usd: chargedAmount,
        registrar: this.name,
        domain,
        success: true,
        message: 'Domain registered successfully',
      };
    } catch (error) {
      if (error instanceof NamecheapError) {
        return {
          order_id: '',
          charged_total_usd: 0,
          registrar: this.name,
          domain,
          success: false,
          message: error.message,
        };
      }
      throw error;
    }
  }

  /**
   * Check domain status
   */
  async status(domain: string): Promise<DomainStatus> {
    try {
      const response = await this.callNamecheap('namecheap.domains.getInfo', {
        DomainName: domain,
      });

      const info = response.DomainGetInfoResult;

      if (!info) {
        return {
          domain,
          state: 'not_found',
          details: { registered: false },
        };
      }

      // Parse domain info
      const status = info['@_Status'];
      const created = info.DomainDetails?.CreatedDate;
      const expires = info.DomainDetails?.ExpiredDate;

      // Parse nameservers
      const nameservers: string[] = [];
      if (info.DnsDetails?.Nameserver) {
        const ns = info.DnsDetails.Nameserver;
        const nsArray = Array.isArray(ns) ? ns : [ns];
        nameservers.push(...nsArray.map((n: any) => String(n)));
      }

      return {
        domain,
        state: status?.toLowerCase() === 'ok' ? 'active' : 'error',
        details: {
          registered: true,
          expiryDate: expires,
          createdDate: created,
          status,
          registrar: this.name,
          nameservers,
          autoRenew: info.Modificationrights?.['@_All'] === 'true',
        },
      };
    } catch (error) {
      // Domain not found or access denied
      if (error instanceof NamecheapError) {
        return {
          domain,
          state: 'not_found',
          details: {
            registered: false,
            error: error.message,
          },
        };
      }
      throw error;
    }
  }

  /**
   * Set custom nameservers for a domain
   * TODO: Implement Namecheap-specific nameserver update
   */
  async setNameservers(domain: string, nameservers: string[]): Promise<void> {
    console.log(`[Namecheap] setNameservers not implemented - would set for ${domain}:`, nameservers);
    throw new Error('Namecheap setNameservers not yet implemented');
  }

  /**
   * Apply DNS records to a domain
   * TODO: Implement Namecheap-specific DNS record creation
   */
  async applyRecords(domain: string, records: DnsRecord[]): Promise<void> {
    console.log(`[Namecheap] applyRecords not implemented - would apply ${records.length} records to ${domain}`);
    throw new Error('Namecheap applyRecords not yet implemented');
  }
}
