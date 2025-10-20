/**
 * Utility functions for domain operations
 */

/**
 * Normalize domain to lowercase and trim
 */
export function normalizeDomain(domain: string): string {
  return domain.toLowerCase().trim();
}

/**
 * Extract TLD from domain
 */
export function getTld(domain: string): string {
  const parts = domain.split('.');
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Split domain into label and TLD
 * Uses the last "." to separate label from TLD
 * Example: "example.com" → { label: "example", tld: "com" }
 */
export function splitDomain(domain: string): { label: string; tld: string } {
  const normalized = normalizeDomain(domain);
  const lastDotIndex = normalized.lastIndexOf('.');

  if (lastDotIndex === -1) {
    // No dot found - entire string is label, no TLD
    return { label: normalized, tld: '' };
  }

  const label = normalized.slice(0, lastDotIndex);
  const tld = normalized.slice(lastDotIndex + 1);

  return { label, tld };
}

/**
 * Convert string to kebab-case
 */
export function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Generate domain candidates from prompt and TLDs
 */
export function generateCandidates(prompt: string, tlds: string[]): string[] {
  const base = toKebabCase(prompt);
  if (!base) return [];

  return tlds.map(tld => `${base}.${tld}`);
}
