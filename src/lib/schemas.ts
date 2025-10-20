import { z } from 'zod';
import { ALLOWLIST_TLDS, getAllowedTlds } from '../config';

/**
 * Domain name regex validation
 */
const DOMAIN_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;

/**
 * Domain validation with TLD extraction
 */
const domainSchema = z
  .string()
  .min(3, 'Domain must be at least 3 characters')
  .max(253, 'Domain must not exceed 253 characters')
  .regex(DOMAIN_REGEX, 'Invalid domain format')
  .transform((val) => val.toLowerCase().trim());

/**
 * TLD validation
 */
const tldSchema = z
  .string()
  .min(2, 'TLD must be at least 2 characters')
  .max(63, 'TLD must not exceed 63 characters')
  .regex(/^[a-zA-Z]+$/, 'TLD must contain only letters')
  .transform((val) => val.toLowerCase().trim());

/**
 * Search request schema
 * Supports prompt-based search, candidate list, or TLD filtering
 */
export const SearchSchema = z.object({
  // Optional search prompt (for AI-based domain suggestions)
  prompt: z.string().max(500).optional(),

  // List of specific domains to check
  candidates: z
    .array(domainSchema)
    .min(1, 'At least one domain candidate is required')
    .max(20, 'Maximum 20 domains per search')
    .optional(),

  // List of TLDs to filter by
  tlds: z.array(tldSchema).max(10, 'Maximum 10 TLDs per search').optional(),

  // Maximum price filter (USD)
  price_ceiling: z.number().positive().max(10000).optional(),

  // Result limit
  limit: z.number().int().positive().max(50).default(10).optional(),

  // Include premium domains in results (default: false)
  include_premium: z.boolean().optional().default(false),

  // Include Unicode/IDN domains in results (default: false)
  include_unicode: z.boolean().optional().default(false),
}).refine(
  (data) => data.candidates || data.prompt,
  {
    message: 'Either candidates or prompt must be provided',
  }
);

export type SearchInput = z.infer<typeof SearchSchema>;

/**
 * Buy/Register request schema
 */
export const BuySchema = z.object({
  // Domain to register
  domain: domainSchema,

  // Registration duration in years (1-10)
  years: z.number().int().min(1).max(10).default(1).optional(),

  // WHOIS privacy protection
  whois_privacy: z.boolean().default(true).optional(),

  // Allow registration of premium domains (default: false)
  allow_premium: z.boolean().optional().default(false),

  // Allow registration of Unicode/IDN domains (default: false)
  allow_unicode: z.boolean().optional().default(false),

  // Nameserver mode: "registrar" (use provider's NS + apply DNS) or "custom" (set custom NS)
  nameserver_mode: z.enum(['registrar', 'custom']).default('registrar').optional(),

  // Custom nameservers (required if nameserver_mode is "custom")
  nameservers: z.array(z.string().min(3).max(255)).optional(),

  // DNS template ID (if provider supports it)
  dns_template_id: z.string().max(100).nullable().optional(),

  // Quoted total from /search (prevents price changes)
  quoted_total_usd: z.number().positive().max(100000),

  // Confirmation code (extra safety measure)
  confirmation_code: z.string().min(4).max(100),

  // Idempotency key to prevent duplicate purchases
  idempotency_key: z.string().uuid('Idempotency key must be a valid UUID'),
}).refine(
  (data) => {
    // If nameserver_mode is "custom", nameservers must be provided (2-13 entries)
    if (data.nameserver_mode === 'custom') {
      if (!data.nameservers || data.nameservers.length < 2 || data.nameservers.length > 13) {
        return false;
      }
    }
    return true;
  },
  {
    message: 'When nameserver_mode is "custom", nameservers array must contain 2-13 entries',
    path: ['nameservers'],
  }
);

export type BuyInput = z.infer<typeof BuySchema>;

/**
 * Status query schema (for GET params)
 */
export const StatusSchema = z.object({
  domain: domainSchema,
});

export type StatusInput = z.infer<typeof StatusSchema>;

/**
 * Validate TLDs against allowlist
 * @throws ValidationError if TLDs are not allowed
 */
export function validateTlds(tlds?: string[]): void {
  // If no allowlist configured, all TLDs are allowed
  if (ALLOWLIST_TLDS.size === 0) {
    return;
  }

  // If no TLDs provided, nothing to validate
  if (!tlds || tlds.length === 0) {
    return;
  }

  const disallowedTlds = tlds.filter((tld) => !ALLOWLIST_TLDS.has(tld.toLowerCase()));

  if (disallowedTlds.length > 0) {
    const allowedList = getAllowedTlds().join(', ');
    throw new Error(
      `TLD(s) not allowed: ${disallowedTlds.join(', ')}. Allowed TLDs: ${allowedList}`
    );
  }
}

/**
 * Extract TLD from domain
 */
export function extractTld(domain: string): string {
  const parts = domain.split('.');
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Validate domain TLD against allowlist
 * @throws ValidationError if TLD is not allowed
 */
export function validateDomainTld(domain: string): void {
  // If no allowlist configured, all TLDs are allowed
  if (ALLOWLIST_TLDS.size === 0) {
    return;
  }

  const tld = extractTld(domain);

  if (!ALLOWLIST_TLDS.has(tld)) {
    const allowedList = getAllowedTlds().join(', ');
    throw new Error(
      `TLD '.${tld}' is not allowed. Allowed TLDs: ${allowedList}`
    );
  }
}

/**
 * Validate array of domains TLDs against allowlist
 * @throws ValidationError if any TLD is not allowed
 */
export function validateDomainsTlds(domains: string[]): void {
  // If no allowlist configured, all TLDs are allowed
  if (ALLOWLIST_TLDS.size === 0) {
    return;
  }

  const disallowedDomains: string[] = [];

  for (const domain of domains) {
    const tld = extractTld(domain);
    if (!ALLOWLIST_TLDS.has(tld)) {
      disallowedDomains.push(domain);
    }
  }

  if (disallowedDomains.length > 0) {
    const allowedList = getAllowedTlds().join(', ');
    throw new Error(
      `Domain(s) with disallowed TLDs: ${disallowedDomains.join(', ')}. Allowed TLDs: ${allowedList}`
    );
  }
}
