import { describe, it, expect } from 'vitest';
import { computeBankingState } from '../../lib/core/banking';
import type { RentHistoryRow, CpiRateRow } from '../../lib/core/types';

const CPI_RATES: CpiRateRow[] = [
  {
    periodStart: '2022-01-01',
    periodEnd: '2022-12-31',
    cpiRate: '0.033',
    capPct: '0.060',
  },
  {
    periodStart: '2023-01-01',
    periodEnd: '2023-12-31',
    cpiRate: '0.033',
    capPct: '0.060',
  },
  {
    periodStart: '2024-01-01',
    periodEnd: '2024-12-31',
    cpiRate: '0.027',
    capPct: '0.057',
  },
  {
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
    cpiRate: '0.027',
    capPct: '0.057',
  },
] as any;

describe('computeBankingState', () => {
  it('returns empty state for a unit with no history', () => {
    const state = computeBankingState([], CPI_RATES, new Date('2025-01-01'));
    expect(state.cumulativeBanked).toBe(0);
    expect(state.periods).toHaveLength(0);
    expect(state.complianceViolation).toBe(false);
  });

  it('banks unused allowance when no increase was taken', () => {
    // Unit started 2022-01-01, no increases taken, asOfDate 2023-02-01 (one full window)
    const history: RentHistoryRow[] = [
      { effectiveDate: '2022-01-01', increaseType: 'initial', increasePct: null },
    ];
    const state = computeBankingState(history, CPI_RATES, new Date('2023-02-01'));
    expect(state.periods).toHaveLength(1);
    expect(state.periods[0].usedPct).toBe(0);
    expect(state.periods[0].allowablePct).toBeCloseTo(0.06);
    expect(state.cumulativeBanked).toBeCloseTo(0.06);
  });

  it('consumes banking when increase taken', () => {
    // First window: allowed 6%, took 6% → banks 0%
    const history: RentHistoryRow[] = [
      { effectiveDate: '2022-01-01', increaseType: 'initial', increasePct: null },
      { effectiveDate: '2022-06-01', increaseType: 'increase', increasePct: '0.06' },
    ];
    const state = computeBankingState(history, CPI_RATES, new Date('2023-02-01'));
    expect(state.periods[0].usedPct).toBeCloseTo(0.06);
    expect(state.periods[0].bankedThisPeriod).toBeCloseTo(0);
    expect(state.cumulativeBanked).toBe(0);
  });

  it('banks partial amount when increase is below cap', () => {
    // First window: allowed 6%, took 3% → banks 3%
    const history: RentHistoryRow[] = [
      { effectiveDate: '2022-01-01', increaseType: 'initial', increasePct: null },
      { effectiveDate: '2022-06-01', increaseType: 'increase', increasePct: '0.03' },
    ];
    const state = computeBankingState(history, CPI_RATES, new Date('2023-02-01'));
    expect(state.periods[0].bankedThisPeriod).toBeCloseTo(0.03);
    expect(state.cumulativeBanked).toBeCloseTo(0.03);
  });

  it('clamps cumulative banked at 10%', () => {
    // Three windows of no increases × 6% = 18%, should clamp at 10%
    const history: RentHistoryRow[] = [
      { effectiveDate: '2022-01-01', increaseType: 'initial', increasePct: null },
    ];
    const state = computeBankingState(history, CPI_RATES, new Date('2025-06-01'));
    expect(state.cumulativeBanked).toBe(0.10);
    expect(state.hitCeiling).toBe(true);
  });

  it('clamps cumulative banked floor at 0 (never goes negative)', () => {
    // Two windows back-to-back, second one over-uses
    const history: RentHistoryRow[] = [
      { effectiveDate: '2022-01-01', increaseType: 'initial', increasePct: null },
      { effectiveDate: '2022-03-01', increaseType: 'increase', increasePct: '0.06' },
      // Second window — takes another 6% (all banked from prior period = 0)
      { effectiveDate: '2023-03-01', increaseType: 'increase', increasePct: '0.06' },
    ];
    const state = computeBankingState(history, CPI_RATES, new Date('2024-06-01'));
    for (const p of state.periods) {
      expect(p.cumulativeBanked).toBeGreaterThanOrEqual(0);
    }
  });

  it('flags compliance violation when increase exceeds allowable + banked', () => {
    // First window: allowed 6%, took 8% → violation (no prior banked)
    const history: RentHistoryRow[] = [
      { effectiveDate: '2022-01-01', increaseType: 'initial', increasePct: null },
      { effectiveDate: '2022-06-01', increaseType: 'increase', increasePct: '0.08' },
    ];
    const state = computeBankingState(history, CPI_RATES, new Date('2023-02-01'));
    expect(state.complianceViolation).toBe(true);
  });

  it('does not flag violation when increase is within allowable + banked', () => {
    // Window 1: took 3% → banks 3%. Window 2: takes 9% (6% cap + 3% banked) → ok
    const history: RentHistoryRow[] = [
      { effectiveDate: '2022-01-01', increaseType: 'initial', increasePct: null },
      { effectiveDate: '2022-06-01', increaseType: 'increase', increasePct: '0.03' },
      { effectiveDate: '2023-03-01', increaseType: 'increase', increasePct: '0.09' },
    ];
    const state = computeBankingState(history, CPI_RATES, new Date('2024-02-01'));
    expect(state.complianceViolation).toBe(false);
  });

  it('anchors windows to first event date regardless of event type', () => {
    // First event is 'initial' on Apr 3, 2022 → windows start Apr 3 each year
    const history: RentHistoryRow[] = [
      { effectiveDate: '2022-04-03', increaseType: 'initial', increasePct: null },
    ];
    // asOfDate after second window ends (Apr 3 2024 + buffer)
    const state = computeBankingState(history, CPI_RATES, new Date('2024-05-01'));
    expect(state.periods[0].periodStart.toISOString().slice(0, 10)).toBe('2022-04-03');
    expect(state.periods[1].periodStart.toISOString().slice(0, 10)).toBe('2023-04-03');
  });

  it('excludes concession events from usedPct', () => {
    const history: RentHistoryRow[] = [
      { effectiveDate: '2022-01-01', increaseType: 'initial', increasePct: null },
      { effectiveDate: '2022-06-01', increaseType: 'concession', increasePct: '0.05' },
    ];
    const state = computeBankingState(history, CPI_RATES, new Date('2023-02-01'));
    expect(state.periods[0].usedPct).toBe(0);
    expect(state.cumulativeBanked).toBeCloseTo(0.06);
  });

  it('does not include the current (incomplete) window in periods', () => {
    // Start 2024-01-01, asOfDate 2024-06-01 → window not complete yet
    const history: RentHistoryRow[] = [
      { effectiveDate: '2024-01-01', increaseType: 'initial', increasePct: null },
    ];
    const state = computeBankingState(history, CPI_RATES, new Date('2024-06-01'));
    expect(state.periods).toHaveLength(0);
  });
});
