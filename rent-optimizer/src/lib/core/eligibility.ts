import { addMonths, differenceInMonths, subDays } from 'date-fns';
import { MOCO } from '../constants';

export interface EligibilityResult {
  /** True if >= 12 months have passed since last increase */
  isEligible: boolean;
  /** Whole months since last increase (0 if no prior increase) */
  monthsSinceLastIncrease: number;
  /** Date of the most recent 'increase' event, or null for baseline-only units */
  lastIncreaseDate: Date | null;
  /** lastIncreaseDate + 12 months (or asOfDate for baseline-only) */
  earliestEligibleDate: Date;
  /** earliestEligibleDate - 90 days — landlord must send notice by this date */
  noticeDeadline: Date;
  /** Days until earliestEligibleDate; negative means already past */
  daysUntilEligible: number;
  /** noticeDeadline has passed but no increase has occurred yet */
  noticeOverdue: boolean;
}

/**
 * Determine a unit's rent-increase eligibility under MoCo rent stabilization.
 *
 * @param rentHistory - All rent events for the unit (any order)
 * @param asOfDate    - The reference date (usually today)
 */
export function checkEligibility(
  rentHistory: { effectiveDate: string; increaseType: string | null }[],
  asOfDate: Date
): EligibilityResult {
  // Find the most recent 'increase' event
  const increases = rentHistory
    .filter(r => r.increaseType === 'increase')
    .map(r => new Date(r.effectiveDate))
    .sort((a, b) => b.getTime() - a.getTime());

  const lastIncreaseDate = increases[0] ?? null;

  let earliestEligibleDate: Date;
  let monthsSinceLastIncrease: number;

  if (lastIncreaseDate === null) {
    // Baseline-only unit — treat as immediately eligible
    earliestEligibleDate = asOfDate;
    monthsSinceLastIncrease = MOCO.ELIGIBILITY_MONTHS; // >= 12
  } else {
    earliestEligibleDate = addMonths(lastIncreaseDate, MOCO.ELIGIBILITY_MONTHS);
    monthsSinceLastIncrease = differenceInMonths(asOfDate, lastIncreaseDate);
  }

  const noticeDeadline = subDays(earliestEligibleDate, MOCO.NOTICE_DAYS);
  const isEligible = monthsSinceLastIncrease >= MOCO.ELIGIBILITY_MONTHS;
  const daysUntilEligible = Math.ceil(
    (earliestEligibleDate.getTime() - asOfDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  // Overdue = landlord missed the notice window for the earliest eligible date
  // and still hasn't done an increase
  const noticeOverdue = isEligible && noticeDeadline < asOfDate;

  return {
    isEligible,
    monthsSinceLastIncrease,
    lastIncreaseDate,
    earliestEligibleDate,
    noticeDeadline,
    daysUntilEligible,
    noticeOverdue,
  };
}
