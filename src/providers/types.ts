/**
 * Domain availability check result
 */
export interface DomainAvailability {
  domain: string;
  available: boolean;
  price_usd: number;
  premium: boolean;
}

/**
 * Domain pricing quote
 */
export interface DomainQuote {
  domain: string;
  registration_price_usd: number;
  icann_fee_usd: number;
  total_usd: number;
  privacy_price_usd: number;
  premium: boolean;
}

/**
 * Domain registration options
 */
export interface RegistrationOptions {
  domain: string;
  years: number;
  privacy: boolean;
  contact?: ContactInfo;
}

/**
 * Contact information for domain registration
 */
export interface ContactInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/**
 * Domain registration result
 */
export interface RegistrationResult {
  order_id: string;
  charged_total_usd: number;
  registrar: string;
  domain: string;
  success: boolean;
  message?: string;
}

/**
 * Domain status check result
 */
export interface DomainStatus {
  domain: string;
  state: 'active' | 'pending' | 'expired' | 'not_found' | 'error';
  details: {
    registered?: boolean;
    expiryDate?: string;
    autoRenew?: boolean;
    registrar?: string;
    nameservers?: string[];
    [key: string]: unknown;
  };
}

/**
 * DNS Record for domain configuration
 */
export interface DnsRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS';
  name: string; // Subdomain or "@" for root
  value: string; // IP address, hostname, or text content
  ttl: number; // Time to live in seconds
  prio?: number; // Priority (for MX records)
}

/**
 * Abstract Registrar interface
 * All provider implementations must implement these methods
 */
export abstract class Registrar {
  protected name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Check availability for multiple domains
   */
  abstract checkAvailability(domains: string[]): Promise<DomainAvailability[]>;

  /**
   * Get pricing quote for a domain
   */
  abstract quote(domain: string, years: number, privacy: boolean): Promise<DomainQuote>;

  /**
   * Register a domain
   */
  abstract register(options: RegistrationOptions): Promise<RegistrationResult>;

  /**
   * Check domain status
   */
  abstract status(domain: string): Promise<DomainStatus>;

  /**
   * Set custom nameservers for a domain
   */
  abstract setNameservers(domain: string, nameservers: string[]): Promise<void>;

  /**
   * Apply DNS records to a domain
   */
  abstract applyRecords(domain: string, records: DnsRecord[]): Promise<void>;

  /**
   * Get registrar name
   */
  getName(): string {
    return this.name;
  }
}
