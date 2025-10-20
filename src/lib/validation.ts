/**
 * Domain validation utilities
 */

/**
 * Validate domain format
 */
export function isValidDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string') {
    return false;
  }

  // Basic domain regex: alphanumeric + hyphens, must have TLD
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;

  // Additional checks
  const parts = domain.split('.');
  if (parts.length < 2) return false;
  if (parts.some(part => part.length === 0 || part.length > 63)) return false;
  if (domain.includes('..')) return false;
  if (domain.startsWith('-') || domain.endsWith('-')) return false;

  return domainRegex.test(domain);
}

/**
 * Extract TLD from domain
 */
export function getTLD(domain: string): string {
  const parts = domain.split('.');
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Check if TLD is allowed based on allowlist
 */
export function isTLDAllowed(domain: string, allowlist?: string): boolean {
  if (!allowlist) {
    // If no allowlist, allow all common TLDs
    return true;
  }

  const tld = getTLD(domain);
  const allowedTLDs = allowlist.split(',').map(t => t.trim().toLowerCase());

  return allowedTLDs.includes(tld);
}

/**
 * Validate array of domains
 */
export function validateDomains(domains: unknown): { valid: boolean; error?: string; domains?: string[] } {
  if (!Array.isArray(domains)) {
    return { valid: false, error: 'Domains must be an array' };
  }

  if (domains.length === 0) {
    return { valid: false, error: 'At least one domain is required' };
  }

  if (domains.length > 20) {
    return { valid: false, error: 'Maximum 20 domains per request' };
  }

  const invalidDomains = domains.filter(d => !isValidDomain(d));
  if (invalidDomains.length > 0) {
    return {
      valid: false,
      error: `Invalid domain format: ${invalidDomains.join(', ')}`
    };
  }

  return { valid: true, domains: domains as string[] };
}

/**
 * Validate registration years
 */
export function validateYears(years: unknown): { valid: boolean; error?: string; years?: number } {
  const y = Number(years);

  if (isNaN(y) || !Number.isInteger(y)) {
    return { valid: false, error: 'Years must be an integer' };
  }

  if (y < 1 || y > 10) {
    return { valid: false, error: 'Years must be between 1 and 10' };
  }

  return { valid: true, years: y };
}

/**
 * Validate privacy flag
 */
export function validatePrivacy(privacy: unknown): boolean {
  return privacy === true || privacy === false;
}

/**
 * Validate single domain
 */
export function validateSingleDomain(domain: unknown): { valid: boolean; error?: string; domain?: string } {
  if (typeof domain !== 'string') {
    return { valid: false, error: 'Domain must be a string' };
  }

  if (!isValidDomain(domain)) {
    return { valid: false, error: 'Invalid domain format' };
  }

  return { valid: true, domain };
}

/**
 * Sanitize domain (lowercase, trim)
 */
export function sanitizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

/**
 * Sanitize array of domains
 */
export function sanitizeDomains(domains: string[]): string[] {
  return domains.map(sanitizeDomain);
}
