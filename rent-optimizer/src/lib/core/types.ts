/**
 * Minimal row shapes used by pure business-logic functions.
 * These match the Drizzle-inferred types from schema.ts but use only
 * the fields each function needs, so callers can pass partial data.
 */

/** One entry in a unit's rent history (as returned by Drizzle / Neon) */
export interface RentHistoryRow {
  effectiveDate: string;         // ISO date string 'YYYY-MM-DD'
  increaseType: string | null;   // 'increase' | 'concession' | 'initial' | null
  increasePct: string | null;    // numeric string e.g. '0.03000', or null
}

/** One CPI rate record (as returned by Drizzle / Neon) */
export interface CpiRateRow {
  periodStart: string;           // ISO date string 'YYYY-MM-DD'
  periodEnd: string;             // ISO date string 'YYYY-MM-DD'
  capPct: string;                // numeric string e.g. '0.06000'
  cpiRate: string;               // numeric string e.g. '0.03300'
}

/** Policy settings as plain numbers — convert from DB strings before passing in */
export interface Policy {
  maxConcessionMonths: number;   // default 1.5
  targetOccupancyPct: number;    // default 0.95
}
