/**
 * Porkbun Registrar Provider
 *
 * Implements domain registration via Porkbun's JSON API v3
 *
 * IMPORTANT: Registration is disabled unless DRY_RUN=false
 * Update endpoint paths below if Porkbun API documentation differs
 *
 * Environment Variables:
 * - PORKBUN_API_KEY: Your API key
 * - PORKBUN_SECRET_KEY: Your secret key
 * - PORKBUN_BASE_URL: API base (default: https://api.porkbun.com/api/json/v3)
 * - DRY_RUN: Set to "false" to enable real registration (default: true)
 * - WINSTON_CONTACT_*: Contact fields for registration
 *
 * API Documentation: https://porkbun.com/api/json/v3/documentation
 */

import { randomUUID } from 'crypto';
import {
  Registrar,
  DomainAvailability,
  DomainQuote,
  RegistrationOptions,
  RegistrationResult,
  DomainStatus,
  DnsRecord,
} from './types';
import { incProviderCall } from '../metrics';

// API Endpoint paths (centralized for easy updates)
const ENDPOINTS = {
  AVAILABILITY: '/domain/check',
  PRICING: '/pricing/get',
  REGISTER: '/domain/create',
  STATUS: '/domain/listAll',
  UPDATE_NS: '/domain/updateNs',
  DNS_CREATE: '/dns/create',
  DNS_DELETE: '/dns/delete',
} as const;

/**
 * Porkbun API Error
 */
class PorkbunError extends Error {
  code: string;
  details: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'PorkbunError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Pricing cache entry
 */
interface PricingCacheEntry {
  price: number;
  premium: boolean;
  privacyPrice: number;
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
 * Normalize domain to lowercase
 */
function normalizeDomain(domain: string): string {
  return domain.toLowerCase().trim();
}

/**
 * Sleep utility for retries
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run promises with concurrency limit
 */
async function pLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<any>
): Promise<any[]> {
  const results: any[] = [];
  const executing: Promise<any>[] = [];

  for (const item of items) {
    const promise = fn(item).then(result => {
      executing.splice(executing.indexOf(promise), 1);
      return result;
    });

    results.push(promise);
    executing.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

/**
 * Porkbun Provider Implementation
 */
export class PorkbunProvider extends Registrar {
  private apiKey: string;
  private secretKey: string;
  private baseUrl: string;
  private dryRun: boolean;

  // Pricing cache (TTL: 5 minutes)
  private pricingCache: Map<string, PricingCacheEntry> = new Map();
  private pricingCacheTtl = 5 * 60 * 1000; // 5 minutes

  // Contact info for registration
  private contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address1: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };

  constructor(config: {
    apiKey: string;
    secretKey: string;
    baseUrl?: string;
    dryRun?: boolean;
    contact?: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      address1: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
  }) {
    super('porkbun');

    this.apiKey = config.apiKey;
    this.secretKey = config.secretKey;
    this.baseUrl = config.baseUrl || 'https://api.porkbun.com/api/json/v3';
    this.dryRun = config.dryRun !== undefined ? config.dryRun : true;

    // Set contact info (default to test values if not provided)
    this.contact = config.contact || {
      firstName: process.env.WINSTON_CONTACT_FIRST || 'Test',
      lastName: process.env.WINSTON_CONTACT_LAST || 'User',
      email: process.env.WINSTON_CONTACT_EMAIL || 'test@example.com',
      phone: process.env.WINSTON_CONTACT_PHONE || '+1.5555551234',
      address1: process.env.WINSTON_CONTACT_ADDRESS1 || '123 Test St',
      city: process.env.WINSTON_CONTACT_CITY || 'Test City',
      state: process.env.WINSTON_CONTACT_STATE || 'CA',
      postalCode: process.env.WINSTON_CONTACT_POSTAL || '90210',
      country: process.env.WINSTON_CONTACT_COUNTRY || 'US',
    };

    // Validate required config
    if (!this.apiKey || !this.secretKey) {
      throw new Error('Porkbun provider requires apiKey and secretKey');
    }

    // Log DRY_RUN status
    if (this.dryRun) {
      console.warn('[Porkbun] DRY_RUN mode enabled - registrations will be simulated');
    } else {
      console.warn('[Porkbun] DRY_RUN mode DISABLED - real registrations will occur!');
    }
  }

  /**
   * Call Porkbun API with retry logic
   */
  private async callPorkbun(
    path: string,
    body: Record<string, any> = {},
    retries = 3
  ): Promise<any> {
    const startTime = Date.now();
    const url = `${this.baseUrl}${path}`;

    // Add auth to body
    const requestBody = {
      apikey: this.apiKey,
      secretapikey: this.secretKey,
      ...body,
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Winston/1.0',
          },
          body: JSON.stringify(requestBody),
        });

        const json = (await response.json()) as any;
        const latency = Date.now() - startTime;

        // Log for metrics
        console.log(`[Porkbun] ${path} - ${response.status} - ${latency}ms (attempt ${attempt})`);

        // Handle non-200 responses
        if (!response.ok) {
          if (response.status === 429 || response.status >= 500) {
            if (attempt < retries) {
              const backoff = Math.pow(2, attempt) * 1000;
              console.warn(`[Porkbun] ${response.status} error, retrying in ${backoff}ms...`);
              await sleep(backoff);
              continue;
            }
          }
          throw new PorkbunError(
            `HTTP ${response.status}: ${response.statusText}`,
            'HTTP_ERROR',
            { status: response.status, body: json }
          );
        }

        // Check API response status
        if (json.status !== 'SUCCESS') {
          // Record error metric
          incProviderCall('porkbun', path, 'error');

          throw new PorkbunError(
            json.message || 'API request failed',
            json.status || 'ERROR',
            { response: json }
          );
        }

        // Record success metric
        incProviderCall('porkbun', path, 'success');

        return json;
      } catch (error) {
        if (error instanceof PorkbunError) {
          throw error;
        }

        // Network or other errors
        if (attempt < retries) {
          const backoff = Math.pow(2, attempt) * 1000;
          console.warn(`[Porkbun] Network error, retrying in ${backoff}ms...`, error);
          await sleep(backoff);
          continue;
        }

        // Record error metric for network errors
        incProviderCall('porkbun', path, 'error');

        throw new PorkbunError(
          `Network error: ${error instanceof Error ? error.message : 'Unknown'}`,
          'NETWORK_ERROR',
          { originalError: error }
        );
      }
    }

    throw new PorkbunError('Max retries exceeded', 'MAX_RETRIES', { path });
  }

  /**
   * Get pricing for TLDs (with caching)
   */
  private async getPricing(): Promise<Map<string, PricingCacheEntry>> {
    // Check if we have any cached pricing that's still valid
    const now = Date.now();
    const hasValidCache = Array.from(this.pricingCache.values()).some(
      entry => now - entry.timestamp < this.pricingCacheTtl
    );

    if (hasValidCache && this.pricingCache.size > 0) {
      return this.pricingCache;
    }

    // Fetch all pricing
    const response = await this.callPorkbun(ENDPOINTS.PRICING);

    // Parse pricing data
    const pricing = response.pricing || {};
    const newCache = new Map<string, PricingCacheEntry>();

    for (const [tld, data] of Object.entries(pricing)) {
      const priceData = data as any;
      const registrationPrice = parseFloat(priceData.registration || '0');
      const premium = priceData.premium === true || priceData.premium === 'true';

      // Porkbun includes WHOIS privacy for free on most TLDs
      const privacyPrice = 0.0;

      newCache.set(tld.toLowerCase(), {
        price: registrationPrice,
        premium,
        privacyPrice,
        timestamp: now,
      });
    }

    this.pricingCache = newCache;
    return newCache;
  }

  /**
   * Parse availability response
   */
  private parseAvailability(response: any, domain: string): boolean {
    // Porkbun returns status: "SUCCESS" and available: "yes"/"no"
    return response.status === 'SUCCESS' &&
           (response.available === 'yes' || response.available === true);
  }

  /**
   * Check availability for multiple domains
   */
  async checkAvailability(domains: string[]): Promise<DomainAvailability[]> {
    if (domains.length === 0) {
      return [];
    }

    // Normalize domains
    const normalized = domains.map(normalizeDomain);

    // Get pricing data (cached)
    const pricingMap = await this.getPricing();

    // Check availability with concurrency limit of 5
    const results = await pLimit(
      normalized,
      5,
      async (domain: string) => {
        try {
          const response = await this.callPorkbun(ENDPOINTS.AVAILABILITY, { domain });
          const available = this.parseAvailability(response, domain);
          const tld = getTldFromDomain(domain);

          // Get pricing for this TLD
          const pricingEntry = pricingMap.get(tld);
          const basePrice = pricingEntry?.price || 12.0;
          const premium = pricingEntry?.premium || false;

          // Add ICANN fee
          const icannFee = 0.18;
          const price_usd = parseFloat((basePrice + icannFee).toFixed(2));

          return {
            domain,
            available,
            price_usd,
            premium,
          };
        } catch (error) {
          // On error, return as unavailable
          console.error(`[Porkbun] Error checking ${domain}:`, error);
          return {
            domain,
            available: false,
            price_usd: 0,
            premium: false,
          };
        }
      }
    );

    return results;
  }

  /**
   * Get pricing quote for a domain
   */
  async quote(domain: string, years: number, privacy: boolean): Promise<DomainQuote> {
    const normalizedDomain = normalizeDomain(domain);
    const tld = getTldFromDomain(normalizedDomain);

    // Get pricing data
    const pricingMap = await this.getPricing();
    const pricingEntry = pricingMap.get(tld);

    if (!pricingEntry) {
      throw new PorkbunError(`Pricing not available for TLD: ${tld}`, 'TLD_NOT_SUPPORTED');
    }

    const basePrice = pricingEntry.price;
    const premium = pricingEntry.premium;
    const privacyPrice = privacy ? pricingEntry.privacyPrice : 0.0;

    // Calculate totals
    const registrationPrice = basePrice * years;
    const icannFee = 0.18 * years;
    const total = registrationPrice + icannFee + privacyPrice;

    return {
      domain: normalizedDomain,
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
    const normalizedDomain = normalizeDomain(domain);

    // Re-quote to get current pricing
    const currentQuote = await this.quote(normalizedDomain, years, privacy);

    // Check availability first
    const availability = await this.checkAvailability([normalizedDomain]);
    if (!availability[0]?.available) {
      return {
        order_id: '',
        charged_total_usd: 0,
        registrar: this.name,
        domain: normalizedDomain,
        success: false,
        message: 'Domain is not available for registration',
      };
    }

    // DRY_RUN protection
    if (this.dryRun) {
      const dryRunOrderId = `PB-DRYRUN-${randomUUID()}`;
      console.log(`[Porkbun] DRY_RUN: Would register ${normalizedDomain} for ${years} year(s) - Total: $${currentQuote.total_usd}`);

      return {
        order_id: dryRunOrderId,
        charged_total_usd: currentQuote.total_usd,
        registrar: this.name,
        domain: normalizedDomain,
        success: true,
        message: `Domain registration simulated (DRY_RUN) - Order ID: ${dryRunOrderId}`,
      };
    }

    // Real registration
    try {
      const response = await this.callPorkbun(ENDPOINTS.REGISTER, {
        domain: normalizedDomain,
        years,
        // Contact information
        firstName: this.contact.firstName,
        lastName: this.contact.lastName,
        email: this.contact.email,
        phone: this.contact.phone,
        address1: this.contact.address1,
        city: this.contact.city,
        state: this.contact.state,
        zip: this.contact.postalCode,
        country: this.contact.country,
        // Privacy
        whoisPrivacy: privacy ? 'enabled' : 'disabled',
      });

      const orderId = response.orderId || response.id || 'unknown';
      const chargedAmount = parseFloat(response.amount || currentQuote.total_usd);

      return {
        order_id: orderId.toString(),
        charged_total_usd: chargedAmount,
        registrar: this.name,
        domain: normalizedDomain,
        success: true,
        message: 'Domain registered successfully',
      };
    } catch (error) {
      if (error instanceof PorkbunError) {
        return {
          order_id: '',
          charged_total_usd: 0,
          registrar: this.name,
          domain: normalizedDomain,
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
    const normalizedDomain = normalizeDomain(domain);

    try {
      const response = await this.callPorkbun(ENDPOINTS.STATUS);

      // Find domain in list
      const domains = response.domains || [];
      const domainInfo = domains.find((d: any) =>
        d.domain?.toLowerCase() === normalizedDomain
      );

      if (!domainInfo) {
        return {
          domain: normalizedDomain,
          state: 'not_found',
          details: { registered: false },
        };
      }

      // Parse domain info
      const expiryDate = domainInfo.expireDate || domainInfo.expires;
      const autoRenew = domainInfo.autoRenew === 'yes' || domainInfo.autoRenew === true;
      const status = domainInfo.status || 'active';

      return {
        domain: normalizedDomain,
        state: status.toLowerCase() === 'active' ? 'active' : 'error',
        details: {
          registered: true,
          expiryDate,
          autoRenew,
          status,
          registrar: this.name,
        },
      };
    } catch (error) {
      // Domain not found or access denied
      if (error instanceof PorkbunError) {
        return {
          domain: normalizedDomain,
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
   * @param domain - Domain name
   * @param nameservers - Array of nameserver hostnames (2-13 nameservers)
   */
  async setNameservers(domain: string, nameservers: string[]): Promise<void> {
    const normalizedDomain = domain.toLowerCase().trim();

    console.log(`[Porkbun] Setting nameservers for ${normalizedDomain}:`, nameservers);

    // DRY_RUN guard: skip actual API call
    if (this.dryRun) {
      console.log(`[Porkbun] DRY_RUN: Would set nameservers for ${normalizedDomain}`);
      console.log(`[Porkbun] DRY_RUN: Nameservers: ${nameservers.join(', ')}`);
      return;
    }

    // Validate nameserver count
    if (nameservers.length < 2 || nameservers.length > 13) {
      throw new PorkbunError(
        'Nameservers must be between 2 and 13',
        'INVALID_NAMESERVER_COUNT',
        { count: nameservers.length }
      );
    }

    try {
      // Call Porkbun updateNs endpoint
      const response = await this.callPorkbun(ENDPOINTS.UPDATE_NS, {
        domain: normalizedDomain,
        ns: nameservers,
      });

      console.log(`[Porkbun] Successfully set nameservers for ${normalizedDomain}`);
    } catch (error) {
      console.error(`[Porkbun] Failed to set nameservers for ${normalizedDomain}:`, error);
      throw error;
    }
  }

  /**
   * Apply DNS records to a domain
   * @param domain - Domain name
   * @param records - Array of DNS records to create
   */
  async applyRecords(domain: string, records: DnsRecord[]): Promise<void> {
    const normalizedDomain = domain.toLowerCase().trim();

    console.log(`[Porkbun] Applying ${records.length} DNS records to ${normalizedDomain}`);

    // DRY_RUN guard: skip actual API calls
    if (this.dryRun) {
      console.log(`[Porkbun] DRY_RUN: Would apply DNS records for ${normalizedDomain}`);
      records.forEach((record, i) => {
        console.log(
          `[Porkbun] DRY_RUN:   [${i + 1}] ${record.type} ${record.name} → ${record.value} (TTL: ${record.ttl}s)`
        );
      });
      return;
    }

    try {
      // Apply each record via DNS create endpoint
      const results = await Promise.allSettled(
        records.map(async (record) => {
          const payload: any = {
            domain: normalizedDomain,
            type: record.type,
            name: record.name,
            content: record.value,
            ttl: record.ttl.toString(),
          };

          // Add priority for MX records
          if (record.type === 'MX' && record.prio !== undefined) {
            payload.prio = record.prio.toString();
          }

          await this.callPorkbun(ENDPOINTS.DNS_CREATE, payload);
          console.log(`[Porkbun] Created DNS record: ${record.type} ${record.name} → ${record.value}`);
        })
      );

      // Check for failures
      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        console.error(`[Porkbun] ${failures.length}/${records.length} DNS records failed to apply`);
        const firstError = (failures[0] as PromiseRejectedResult).reason;
        throw new PorkbunError(
          `Failed to apply some DNS records: ${firstError.message}`,
          'DNS_APPLY_PARTIAL_FAILURE',
          { total: records.length, failed: failures.length }
        );
      }

      console.log(`[Porkbun] Successfully applied ${records.length} DNS records to ${normalizedDomain}`);
    } catch (error) {
      console.error(`[Porkbun] Failed to apply DNS records for ${normalizedDomain}:`, error);
      throw error;
    }
  }
}
