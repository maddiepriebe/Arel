import type { BankingState } from './banking';
import type { Policy } from './types';
import { MOCO } from '../constants';

export interface CompRange {
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  sampleSize: number;
}

export interface OptimizationScenario {
  /** Human-readable label */
  label: string;
  proposedRent: number;
  /** (proposedRent - currentRent) / currentRent */
  increasePct: number;
  concessionMonths: number;
  /** proposedRent * (12 - concessionMonths) / 12 */
  effectiveMonthlyNet: number;
  /** proposedRent * 12 - proposedRent * concessionMonths */
  annualNetRevenue: number;
  /** vs comp median; positive = above market */
  compDeltaPct: number;
  /** How much of the banked % this scenario consumes */
  bankedPctConsumed: number;
  remainingBankAfter: number;
  /** concessionMonths <= policy.maxConcessionMonths */
  meetsPolicy: boolean;
}

export interface OptimizationResult {
  recommended: OptimizationScenario;
  allScenarios: OptimizationScenario[];
  compRange: CompRange | null;
  hasCompData: boolean;
  warnings: string[];
}

/**
 * Compute rent optimization scenarios for a unit.
 *
 * Scenarios:
 *   A. Max allowable increase, no concession
 *   B. Max allowable increase, concession sized to hit comp median effective rent
 *   C. Comp median as asking rent, no concession
 *   D. Comp median as asking rent, 1-month concession
 *   E. Conservative — comp p25 as asking rent
 *
 * Recommendation: highest effectiveMonthlyNet among policy-compliant scenarios;
 * if none comply, highest from all scenarios.
 */
export function optimizeUnit(params: {
  currentRent: number;
  /** baseCap + available banked amount */
  maxAllowablePct: number;
  bankingState: BankingState;
  compRange: CompRange | null;
  policy: Policy;
  asOfDate: Date;
}): OptimizationResult {
  const { currentRent, maxAllowablePct, bankingState, compRange, policy } = params;
  const warnings: string[] = [];
  const hasCompData = compRange !== null;

  if (maxAllowablePct <= 0) {
    warnings.push(
      'No allowable increase available — unit may be over-increased or banking is exhausted'
    );
  }
  if (!hasCompData) {
    warnings.push('No comp data available — optimization based on compliance limits only');
  }

  const maxRent = currentRent * (1 + maxAllowablePct);

  /** Build a scenario given proposed rent and concession months */
  function makeScenario(
    label: string,
    proposedRent: number,
    concessionMonths: number
  ): OptimizationScenario {
    const rounded = Math.round(proposedRent * 100) / 100;
    const increasePct = (rounded - currentRent) / currentRent;
    const effectiveMonthlyNet =
      Math.round(((rounded * (12 - concessionMonths)) / 12) * 100) / 100;
    const annualNetRevenue =
      Math.round((rounded * 12 - rounded * concessionMonths) * 100) / 100;

    const compDeltaPct =
      compRange ? (effectiveMonthlyNet - compRange.median) / compRange.median : 0;

    // How much banking does this scenario consume?
    // Only the portion above the base cap comes from banked %
    const baseCap = MOCO.ABSOLUTE_CAP;
    const bankedPctConsumed = Math.max(0, increasePct - baseCap);
    const remainingBankAfter = Math.max(
      0,
      bankingState.cumulativeBanked - bankedPctConsumed
    );

    const meetsPolicy = concessionMonths <= policy.maxConcessionMonths;

    return {
      label,
      proposedRent: rounded,
      increasePct,
      concessionMonths,
      effectiveMonthlyNet,
      annualNetRevenue,
      compDeltaPct,
      bankedPctConsumed,
      remainingBankAfter,
      meetsPolicy,
    };
  }

  const scenarios: OptimizationScenario[] = [];

  // ── A. Max allowable, no concession ───────────────────────────────────────
  scenarios.push(makeScenario('Max allowable, no concession', maxRent, 0));

  if (hasCompData && compRange) {
    // ── B. Max allowable + concession to hit comp median effective rent ───────
    // Solve: maxRent * (12 - c) / 12 = compRange.median  →  c = 12 - (median * 12 / maxRent)
    const concB = Math.max(0, 12 - (compRange.median * 12) / maxRent);
    const cappedConcB = Math.min(concB, policy.maxConcessionMonths);
    scenarios.push(
      makeScenario('Max allowable + concession to median', maxRent, cappedConcB)
    );

    const medianRent = compRange.median;
    if (medianRent >= currentRent && medianRent <= maxRent) {
      // ── C. Comp median, no concession ─────────────────────────────────────
      scenarios.push(makeScenario('At market median, no concession', medianRent, 0));

      // ── D. Comp median + 1-month concession ───────────────────────────────
      scenarios.push(
        makeScenario(
          'At market median + 1 month concession',
          medianRent,
          Math.min(1, policy.maxConcessionMonths)
        )
      );
    }

    // ── E. Conservative — comp p25 ─────────────────────────────────────────
    const p25Rent = compRange.p25;
    if (p25Rent >= currentRent && p25Rent <= maxRent) {
      scenarios.push(makeScenario('Conservative (comp p25)', p25Rent, 0));
    } else if (p25Rent > maxRent) {
      // Can't reach p25 — use max allowable
      scenarios.push(makeScenario('Conservative (capped at max allowable)', maxRent, 0));
      warnings.push(
        'Comp p25 exceeds max allowable rent — conservative scenario capped at max allowable'
      );
    }
    // If p25 < currentRent, no conservative scenario is needed (already below market)
  }

  // Prefer policy-compliant scenarios; fall back to all if none qualify
  const compliant = scenarios.filter(s => s.meetsPolicy);
  const ranked = compliant.length > 0 ? compliant : scenarios;
  ranked.sort((a, b) => b.effectiveMonthlyNet - a.effectiveMonthlyNet);

  return {
    recommended: ranked[0],
    allScenarios: scenarios,
    compRange,
    hasCompData,
    warnings,
  };
}

// ─── Comp statistics helper ────────────────────────────────────────────────

/**
 * Compute percentile statistics from an array of effective rent values.
 * Used before calling optimizeUnit to build a CompRange.
 */
export function buildCompRange(effectiveRents: number[]): CompRange | null {
  if (effectiveRents.length === 0) return null;
  const sorted = [...effectiveRents].sort((a, b) => a - b);
  const n = sorted.length;

  const percentile = (p: number): number => {
    const idx = (p / 100) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };

  return {
    min: sorted[0],
    p25: percentile(25),
    median: percentile(50),
    p75: percentile(75),
    max: sorted[n - 1],
    sampleSize: n,
  };
}
