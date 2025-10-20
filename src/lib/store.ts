/**
 * In-memory data store
 *
 * TODO: Replace with database persistence (Redis/PostgreSQL)
 */

export interface PurchaseRecord {
  order_id: string;
  charged_total_usd: number;
  registrar: string;
  domain: string;
  years: number;
  privacy: boolean;
  timestamp: string;
}

/**
 * Idempotency store for domain purchases
 * Key format: "buy:{domain}:{idempotency_key}"
 */
export const buys = new Map<string, PurchaseRecord>();

/**
 * Get purchase by idempotency key
 */
export function getPurchase(domain: string, idempotencyKey: string): PurchaseRecord | undefined {
  const key = `buy:${domain}:${idempotencyKey}`;
  return buys.get(key);
}

/**
 * Store purchase with idempotency key
 */
export function storePurchase(
  domain: string,
  idempotencyKey: string,
  record: PurchaseRecord
): void {
  const key = `buy:${domain}:${idempotencyKey}`;
  buys.set(key, record);
}

/**
 * Check if domain has been purchased (any idempotency key)
 */
export function isDomainPurchased(domain: string): boolean {
  for (const [key, _] of buys.entries()) {
    if (key.startsWith(`buy:${domain}:`)) {
      return true;
    }
  }
  return false;
}

/**
 * Get purchase record for domain (latest)
 */
export function getDomainPurchase(domain: string): PurchaseRecord | undefined {
  for (const [key, record] of buys.entries()) {
    if (key.startsWith(`buy:${domain}:`)) {
      return record;
    }
  }
  return undefined;
}
