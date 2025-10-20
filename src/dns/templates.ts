/**
 * DNS Template Definitions
 * Pre-configured DNS record sets for common use cases
 */

/**
 * DNS Record Type
 */
export interface DnsRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS';
  name: string; // Subdomain or "@" for root
  value: string; // IP address, hostname, or text content
  ttl: number; // Time to live in seconds
  prio?: number; // Priority (for MX records)
}

/**
 * DNS Template Definition
 */
export interface DnsTemplate {
  id: string;
  name: string;
  description: string;
  records: DnsRecord[];
}

/**
 * Built-in DNS Templates
 * These are minimal starting points; users can create custom templates later
 */
export const templates: Record<string, DnsTemplate> = {
  /**
   * Web Basic: Simple website with www redirect
   * Use case: Static site or single-server web app
   */
  'web-basic': {
    id: 'web-basic',
    name: 'Web Basic',
    description: 'Simple website with www CNAME',
    records: [
      {
        type: 'A',
        name: '@',
        value: '93.184.216.34', // Example IP - user should update
        ttl: 300,
      },
      {
        type: 'CNAME',
        name: 'www',
        value: '@',
        ttl: 300,
      },
    ],
  },

  /**
   * API + SPA: API backend with frontend on root
   * Use case: Modern web app with separate API subdomain
   */
  'api-spa': {
    id: 'api-spa',
    name: 'API + SPA',
    description: 'Root for SPA, api subdomain for backend',
    records: [
      {
        type: 'A',
        name: '@',
        value: '93.184.216.34', // SPA/frontend IP
        ttl: 300,
      },
      {
        type: 'CNAME',
        name: 'www',
        value: '@',
        ttl: 300,
      },
      {
        type: 'A',
        name: 'api',
        value: '93.184.216.35', // API backend IP
        ttl: 300,
      },
    ],
  },

  /**
   * Email + Web: Website with email MX records
   * Use case: Business site with custom email
   */
  'email-web': {
    id: 'email-web',
    name: 'Email + Web',
    description: 'Website with email MX records',
    records: [
      {
        type: 'A',
        name: '@',
        value: '93.184.216.34',
        ttl: 300,
      },
      {
        type: 'CNAME',
        name: 'www',
        value: '@',
        ttl: 300,
      },
      {
        type: 'MX',
        name: '@',
        value: 'mail.example.com', // User should configure
        ttl: 300,
        prio: 10,
      },
      {
        type: 'MX',
        name: '@',
        value: 'mail2.example.com',
        ttl: 300,
        prio: 20,
      },
    ],
  },
};

/**
 * Get template by ID
 */
export function getTemplate(id: string): DnsTemplate | undefined {
  return templates[id];
}

/**
 * List all available templates
 */
export function listTemplates(): DnsTemplate[] {
  return Object.values(templates);
}

/**
 * Validate template exists
 */
export function templateExists(id: string): boolean {
  return id in templates;
}
