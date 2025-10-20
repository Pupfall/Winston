/**
 * Date Utilities
 * Helper functions for date formatting and manipulation
 */

/**
 * Get today's date in ISO format (YYYY-MM-DD) in UTC
 *
 * @returns ISO date string in format "YYYY-MM-DD"
 *
 * @example
 * todayISO() // "2025-10-19"
 */
export function todayISO(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Convert a Date to ISO date string (YYYY-MM-DD) in UTC
 *
 * @param date - Date to convert
 * @returns ISO date string in format "YYYY-MM-DD"
 *
 * @example
 * toDateISO(new Date('2025-10-19T15:30:00Z')) // "2025-10-19"
 */
export function toDateISO(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Parse ISO date string (YYYY-MM-DD) to Date object at midnight UTC
 *
 * @param dateISO - ISO date string in format "YYYY-MM-DD"
 * @returns Date object at midnight UTC
 *
 * @example
 * fromDateISO("2025-10-19") // Date object at 2025-10-19T00:00:00.000Z
 */
export function fromDateISO(dateISO: string): Date {
  return new Date(`${dateISO}T00:00:00.000Z`);
}
