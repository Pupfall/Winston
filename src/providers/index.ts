/**
 * Provider exports and factory
 *
 * IMPORTANT: This module uses lazy initialization to ensure environment
 * variables are loaded before creating provider instances.
 *
 * The provider is NOT created at module load time. Instead, it's created
 * on first access via a Proxy, ensuring dotenv has loaded env vars.
 */

import { Registrar } from './types';
import { PorkbunProvider } from './porkbun';
import { NamecheapProvider } from './namecheap';

/**
 * Cached provider instance (lazy-loaded)
 */
let cachedProvider: Registrar | null = null;

/**
 * Create provider based on environment configuration
 *
 * This function reads environment variables to instantiate the provider.
 * It should only be called AFTER dotenv.config() has been executed.
 *
 * @param providerName - Optional provider name override
 * @returns Configured Registrar instance
 */
export function createProvider(providerName?: string): Registrar {
  const name = providerName || process.env.DEFAULT_PROVIDER || 'porkbun';

  switch (name.toLowerCase()) {
    case 'porkbun':
      return new PorkbunProvider({
        apiKey: process.env.PORKBUN_API_KEY || '',
        secretKey: process.env.PORKBUN_SECRET_KEY || '',
        baseUrl: process.env.PORKBUN_BASE_URL,
        dryRun: process.env.DRY_RUN !== 'false', // Default to true
        contact: {
          firstName: process.env.WINSTON_CONTACT_FIRST || 'Test',
          lastName: process.env.WINSTON_CONTACT_LAST || 'User',
          email: process.env.WINSTON_CONTACT_EMAIL || 'test@example.com',
          phone: process.env.WINSTON_CONTACT_PHONE || '+1.5555551234',
          address1: process.env.WINSTON_CONTACT_ADDRESS1 || '123 Test St',
          city: process.env.WINSTON_CONTACT_CITY || 'Test City',
          state: process.env.WINSTON_CONTACT_STATE || 'CA',
          postalCode: process.env.WINSTON_CONTACT_POSTAL || '90210',
          country: process.env.WINSTON_CONTACT_COUNTRY || 'US',
        },
      });

    case 'namecheap':
      return new NamecheapProvider({
        apiUser: process.env.NAMECHEAP_API_USER || '',
        apiKey: process.env.NAMECHEAP_API_KEY || '',
        username: process.env.NAMECHEAP_USERNAME || '',
        clientIp: process.env.NAMECHEAP_CLIENT_IP || '',
        baseUrl: process.env.NAMECHEAP_BASE_URL,
      });

    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

/**
 * Get or create the cached provider instance
 */
function getOrCreateProvider(): Registrar {
  if (!cachedProvider) {
    cachedProvider = createProvider();
  }
  return cachedProvider;
}

/**
 * Lazy provider instance using Proxy
 *
 * This Proxy ensures the provider is only created when first accessed,
 * not at module load time. This allows dotenv to load environment
 * variables before the PorkbunProvider constructor is called.
 */
export const provider = new Proxy({} as Registrar, {
  get(_target, prop) {
    const providerInstance = getOrCreateProvider();
    const value = (providerInstance as any)[prop];

    // Bind methods to maintain 'this' context
    if (typeof value === 'function') {
      return value.bind(providerInstance);
    }

    return value;
  }
});

/**
 * Reset cached provider (useful for testing)
 */
export function resetProvider(): void {
  cachedProvider = null;
}

// Re-export types and classes
export { Registrar, PorkbunProvider, NamecheapProvider };
export * from './types';
