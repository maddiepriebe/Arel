import type { CpiRateRow } from './types';
import { MOCO } from '../constants';

/**
 * Returns the cap_pct for the CPI period that contains the given date.
 * Falls back to MOCO.ABSOLUTE_CAP if no period is found.
 *
 * @param date      - The date to look up (typically the start of a 12-month window)
 * @param cpiRates  - All CPI rate records from the DB
 * @returns         - The applicable cap percentage (e.g. 0.06) or null if not found
 */
export function getCpiCapForDate(date: Date, cpiRates: CpiRateRow[]): number | null {
  const ts = date.getTime();
  for (const rate of cpiRates) {
    const start = new Date(rate.periodStart).getTime();
    const end = new Date(rate.periodEnd).getTime();
    if (ts >= start && ts <= end) {
      return parseFloat(rate.capPct);
    }
  }
  return null;
}

/**
 * Returns the CPI rate (not the cap) for the period containing the given date.
 * Returns null if no period is found.
 */
export function getCpiRateForDate(date: Date, cpiRates: CpiRateRow[]): number | null {
  const ts = date.getTime();
  for (const rate of cpiRates) {
    const start = new Date(rate.periodStart).getTime();
    const end = new Date(rate.periodEnd).getTime();
    if (ts >= start && ts <= end) {
      return parseFloat(rate.cpiRate);
    }
  }
  return null;
}

/**
 * Returns true if today is within `warningDays` of a period end
 * and no subsequent period is defined. Used for the UI banner.
 */
export function isCpiRateExpiringSoon(
  asOfDate: Date,
  cpiRates: CpiRateRow[],
  warningDays: number = 60
): boolean {
  if (cpiRates.length === 0) return true;

  const latestEnd = cpiRates
    .map(r => new Date(r.periodEnd).getTime())
    .reduce((a, b) => Math.max(a, b), 0);

  const msWarning = warningDays * 24 * 60 * 60 * 1000;
  return asOfDate.getTime() > latestEnd - msWarning;
}
