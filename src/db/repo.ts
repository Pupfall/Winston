/**
 * Database Repository Functions
 *
 * Minimal repository layer for Winston MVP.
 * Provides clean abstractions over Prisma queries.
 */

import { User, Idem, DailySpend, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { todayISO, fromDateISO } from '../lib/date';

// ============================================
// USER & AUTHENTICATION
// ============================================

/**
 * Get user by API key
 *
 * @param key - API key to lookup
 * @returns User object if found, null otherwise
 */
export async function getUserByApiKey(key: string): Promise<User | null> {
  const apiKey = await prisma.apiKey.findUnique({
    where: { key },
    include: { user: true },
  });

  return apiKey?.user ?? null;
}

// ============================================
// AUDIT LOGGING
// ============================================

/**
 * Record an audit log entry
 *
 * @param userId - User ID (null for anonymous/system actions)
 * @param verb - Action verb (e.g., "domain.search", "domain.purchase")
 * @param payload - Action payload/context (will be JSON stringified)
 * @returns Created audit log entry
 */
export async function recordAudit(
  userId: string | null,
  verb: string,
  payload: any
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId,
      verb,
      payloadJson: JSON.stringify(payload),
    },
  });
}

// ============================================
// IDEMPOTENCY
// ============================================

/**
 * Begin idempotency check
 *
 * @param key - Idempotency key
 * @returns Existing non-expired Idem record if found, null otherwise
 */
export async function idemBegin(key: string): Promise<Idem | null> {
  const now = new Date();

  const existing = await prisma.idem.findUnique({
    where: { key },
  });

  // Return only if not expired
  if (existing && existing.expiresAt > now) {
    return existing;
  }

  // Cleanup expired entry if exists
  if (existing && existing.expiresAt <= now) {
    await prisma.idem.delete({
      where: { key },
    });
  }

  return null;
}

/**
 * Commit idempotency response
 *
 * @param key - Idempotency key
 * @param digest - Request digest (SHA256)
 * @param responseJson - Cached response (JSON string or object)
 * @param ttlSec - Time to live in seconds (default: 3600)
 * @returns Created Idem record
 */
export async function idemCommit(
  key: string,
  digest: string,
  responseJson: string | object,
  ttlSec: number = 3600
): Promise<Idem> {
  const expiresAt = new Date(Date.now() + ttlSec * 1000);
  const responseString = typeof responseJson === 'string'
    ? responseJson
    : JSON.stringify(responseJson);

  return await prisma.idem.upsert({
    where: { key },
    create: {
      key,
      digest,
      responseJson: responseString,
      expiresAt,
    },
    update: {
      digest,
      responseJson: responseString,
      expiresAt,
    },
  });
}

/**
 * Fail/clear idempotency entry
 *
 * @param key - Idempotency key to clear
 */
export async function idemFail(key: string): Promise<void> {
  await prisma.idem.deleteMany({
    where: { key },
  });
}

// ============================================
// DAILY SPEND TRACKING
// ============================================

/**
 * Get daily spend for an account on a specific day
 *
 * @param accountKey - Account identifier (API key or IP)
 * @param dayISO - Date in YYYY-MM-DD format (defaults to today)
 * @returns Total spend in USD, or 0 if no record exists
 */
export async function dailySpendGet(
  accountKey: string,
  dayISO: string = todayISO()
): Promise<number> {
  const dayDate = fromDateISO(dayISO);

  const record = await prisma.dailySpend.findUnique({
    where: {
      accountKey_day: {
        accountKey,
        day: dayDate,
      },
    },
  });

  return record ? Number(record.totalUsd) : 0;
}

/**
 * Add to daily spend for an account
 *
 * @param accountKey - Account identifier (API key or IP)
 * @param dayISO - Date in YYYY-MM-DD format (defaults to today)
 * @param amount - Amount to add in USD
 * @returns Updated DailySpend record
 */
export async function dailySpendAdd(
  accountKey: string,
  dayISO: string = todayISO(),
  amount: number
): Promise<DailySpend> {
  const dayDate = fromDateISO(dayISO);

  return await prisma.dailySpend.upsert({
    where: {
      accountKey_day: {
        accountKey,
        day: dayDate,
      },
    },
    create: {
      accountKey,
      day: dayDate,
      totalUsd: new Prisma.Decimal(amount),
    },
    update: {
      totalUsd: {
        increment: new Prisma.Decimal(amount),
      },
    },
  });
}

/**
 * Check if adding an amount would exceed the daily cap
 *
 * @param accountKey - Account identifier
 * @param amount - Amount to check
 * @param maxDaily - Maximum daily spending cap
 * @param dayISO - Date to check (defaults to today)
 * @returns true if would exceed cap, false otherwise
 */
export async function dailySpendWouldExceed(
  accountKey: string,
  amount: number,
  maxDaily: number,
  dayISO: string = todayISO()
): Promise<boolean> {
  const current = await dailySpendGet(accountKey, dayISO);
  return current + amount > maxDaily;
}

/**
 * Get remaining daily spend allowance
 *
 * @param accountKey - Account identifier
 * @param maxDaily - Maximum daily spending cap
 * @param dayISO - Date to check (defaults to today)
 * @returns Remaining allowance in USD
 */
export async function dailySpendRemaining(
  accountKey: string,
  maxDaily: number,
  dayISO: string = todayISO()
): Promise<number> {
  const current = await dailySpendGet(accountKey, dayISO);
  return Math.max(0, maxDaily - current);
}

// ============================================
// CLEANUP UTILITIES
// ============================================

/**
 * Cleanup expired idempotency records
 * Should be run periodically (e.g., via cron)
 *
 * @returns Number of records deleted
 */
export async function cleanupExpiredIdem(): Promise<number> {
  const result = await prisma.idem.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  return result.count;
}

/**
 * Cleanup old daily spend records
 * Keeps last N days, deletes older records
 *
 * @param keepDays - Number of days to keep (default: 90)
 * @returns Number of records deleted
 */
export async function cleanupOldDailySpend(keepDays: number = 90): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);

  const result = await prisma.dailySpend.deleteMany({
    where: {
      day: {
        lt: cutoffDate,
      },
    },
  });

  return result.count;
}
