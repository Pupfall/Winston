/**
 * Daily Spend Ledger
 *
 * Tracks daily spending per account to enforce MAX_DAILY_USD cap
 * Database-backed via Prisma
 */

import * as repo from '../db/repo';
import { todayISO } from './date';

/**
 * Daily spend tracking ledger
 *
 * Uses database for persistence via repo functions
 */
export class SpendLedger {
  /**
   * Get total spent today for an account
   */
  async getTotal(key: string): Promise<number> {
    return await repo.dailySpendGet(key, todayISO());
  }

  /**
   * Add spending amount to account's daily total
   */
  async add(key: string, amount: number): Promise<void> {
    const today = todayISO();
    await repo.dailySpendAdd(key, today, amount);

    const newTotal = await repo.dailySpendGet(key, today);
    console.log(`[Spend] ${key} - Day: ${today}, Total: $${newTotal}`);
  }

  /**
   * Get remaining budget for today
   */
  async getRemaining(key: string, maxDaily: number): Promise<number> {
    return await repo.dailySpendRemaining(key, maxDaily, todayISO());
  }

  /**
   * Check if purchase would exceed daily cap
   */
  async wouldExceedCap(key: string, amount: number, maxDaily: number): Promise<boolean> {
    return await repo.dailySpendWouldExceed(key, amount, maxDaily, todayISO());
  }
}

// Singleton instance
export const spend = new SpendLedger();
