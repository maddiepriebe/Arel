import { addMonths } from 'date-fns';
import type { RentHistoryRow, CpiRateRow } from './types';
import { getCpiCapForDate } from './cpi';
import { MOCO } from '../constants';

export interface BankingPeriod {
  periodStart: Date;
  periodEnd: Date;             // exclusive upper bound (= next window's start)
  allowablePct: number;        // CPI cap for this period
  usedPct: number;             // sum of all 'increase' increasePct values in window
  bankedThisPeriod: number;    // allowablePct - usedPct (can be negative = overused)
  cumulativeBanked: number;    // running total after clamping to [0, MAX_BANKING_CUMULATIVE]
}

export interface BankingState {
  /** Current available banked percentage (after all completed periods) */
  cumulativeBanked: number;
  /** One entry per completed 12-month window */
  periods: BankingPeriod[];
  /** True if cumulative banked ever reached the 10% ceiling */
  hitCeiling: boolean;
  /** True if any period had usedPct > allowablePct + prior cumulative */
  complianceViolation: boolean;
}

/**
 * Compute the rent-banking ledger for a unit.
 *
 * Windows are 12-month intervals anchored to the unit's FIRST rent event date.
 * E.g. first event 2022-04-03 → windows Apr 3 2022–Apr 2 2023, Apr 3 2023–Apr 2 2024, …
 *
 * Only windows that started before `asOfDate` are included.
 * The current (incomplete) window is not calculated.
 *
 * @param rentHistory - All rent events for the unit
 * @param cpiRates    - All CPI rate records from the DB
 * @param asOfDate    - Reference date (usually today)
 */
export function computeBankingState(
  rentHistory: RentHistoryRow[],
  cpiRates: CpiRateRow[],
  asOfDate: Date
): BankingState {
  if (rentHistory.length === 0) {
    return { cumulativeBanked: 0, periods: [], hitCeiling: false, complianceViolation: false };
  }

  // Sort chronologically ascending
  const sorted = [...rentHistory].sort(
    (a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime()
  );

  const firstDate = new Date(sorted[0].effectiveDate);
  const periods: BankingPeriod[] = [];
  let cumulativeBanked = 0;
  let hitCeiling = false;
  let complianceViolation = false;

  let windowStart = firstDate;

  while (true) {
    const windowEnd = addMonths(windowStart, 12);

    // Only process fully-completed windows (windowEnd <= asOfDate).
    // The current in-progress window is never counted.
    if (windowEnd > asOfDate) break;

    // Look up the CPI cap that applies to this window's start date
    const allowablePct = getCpiCapForDate(windowStart, cpiRates) ?? MOCO.ABSOLUTE_CAP;

    // Sum increase_pct for all 'increase' events within [windowStart, windowEnd)
    const usedPct = sorted
      .filter(r => {
        if (r.increaseType !== 'increase') return false;
        const d = new Date(r.effectiveDate);
        return d >= windowStart && d < windowEnd;
      })
      .reduce((sum, r) => sum + (r.increasePct ? parseFloat(r.increasePct) : 0), 0);

    // Compliance check: used more than allowable + what was banked entering this period
    const priorBanked = cumulativeBanked;
    if (usedPct > allowablePct + priorBanked) {
      complianceViolation = true;
    }

    const bankedThisPeriod = allowablePct - usedPct;
    const newCumulative = Math.min(
      Math.max(cumulativeBanked + bankedThisPeriod, 0),
      MOCO.MAX_BANKING_CUMULATIVE
    );

    if (newCumulative >= MOCO.MAX_BANKING_CUMULATIVE && bankedThisPeriod > 0) {
      hitCeiling = true;
    }

    cumulativeBanked = newCumulative;

    periods.push({
      periodStart: windowStart,
      periodEnd: windowEnd,
      allowablePct,
      usedPct,
      bankedThisPeriod,
      cumulativeBanked,
    });

    windowStart = windowEnd;
  }

  return { cumulativeBanked, periods, hitCeiling, complianceViolation };
}
