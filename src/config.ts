import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Centralized application configuration
 */

// Server config
export const PORT = parseInt(process.env.PORT || '3000', 10);
export const NODE_ENV = process.env.NODE_ENV || 'development';

// Porkbun API credentials
export const PORKBUN_API_KEY = process.env.PORKBUN_API_KEY || '';
export const PORKBUN_SECRET_KEY = process.env.PORKBUN_SECRET_KEY || '';

// TLD Allowlist - Set for fast lookup
export const ALLOWLIST_TLDS: Set<string> = (() => {
  const envValue = process.env.ALLOWLIST_TLDS;
  if (!envValue || envValue.trim() === '') {
    // Empty allowlist means all TLDs are allowed
    return new Set<string>();
  }
  return new Set(
    envValue
      .split(',')
      .map((tld) => tld.trim().toLowerCase())
      .filter((tld) => tld.length > 0)
  );
})();

// Transaction limits
export const MAX_PER_TXN_USD = parseFloat(process.env.MAX_PER_TXN_USD || '1000');
export const MAX_DAILY_USD = parseFloat(process.env.MAX_DAILY_USD || '5000');

// Validation limits
export const MAX_DOMAINS_PER_SEARCH = parseInt(process.env.MAX_DOMAINS_PER_SEARCH || '20', 10);

// Rate limiting
export const RATE_LIMIT_RPM = parseInt(process.env.RATE_LIMIT_RPM || '60', 10);
export const RATE_LIMIT_BURST = parseInt(process.env.RATE_LIMIT_BURST || '30', 10);

/**
 * Check if a TLD is allowed
 */
export function isTldAllowed(tld: string): boolean {
  // If allowlist is empty, all TLDs are allowed
  if (ALLOWLIST_TLDS.size === 0) {
    return true;
  }
  return ALLOWLIST_TLDS.has(tld.toLowerCase());
}

/**
 * Get allowed TLDs as array (for error messages)
 */
export function getAllowedTlds(): string[] {
  if (ALLOWLIST_TLDS.size === 0) {
    return ['all'];
  }
  return Array.from(ALLOWLIST_TLDS).sort();
}

/**
 * Validate configuration on startup
 */
export function validateConfig(): void {
  const errors: string[] = [];

  if (!PORKBUN_API_KEY && NODE_ENV === 'production') {
    errors.push('PORKBUN_API_KEY is required in production');
  }

  if (!PORKBUN_SECRET_KEY && NODE_ENV === 'production') {
    errors.push('PORKBUN_SECRET_KEY is required in production');
  }

  if (MAX_PER_TXN_USD <= 0) {
    errors.push('MAX_PER_TXN_USD must be greater than 0');
  }

  if (MAX_DAILY_USD <= 0) {
    errors.push('MAX_DAILY_USD must be greater than 0');
  }

  if (MAX_DAILY_USD < MAX_PER_TXN_USD) {
    errors.push('MAX_DAILY_USD must be greater than or equal to MAX_PER_TXN_USD');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}
