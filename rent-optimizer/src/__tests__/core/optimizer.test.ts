import { describe, it, expect } from 'vitest';
import { optimizeUnit, buildCompRange } from '../../lib/core/optimizer';
import type { CompRange } from '../../lib/core/optimizer';
import type { BankingState } from '../../lib/core/banking';
import type { Policy } from '../../lib/core/types';

const DEFAULT_POLICY: Policy = {
  maxConcessionMonths: 1.5,
  targetOccupancyPct: 0.95,
};

const NO_BANKING: BankingState = {
  cumulativeBanked: 0,
  periods: [],
  hitCeiling: false,
  complianceViolation: false,
};

const COMP_RANGE: CompRange = {
  min: 1800,
  p25: 1950,
  median: 2100,
  p75: 2250,
  max: 2500,
  sampleSize: 20,
};

describe('optimizeUnit', () => {
  it('always includes scenario A (max allowable, no concession)', () => {
    const result = optimizeUnit({
      currentRent: 2000,
      maxAllowablePct: 0.06,
      bankingState: NO_BANKING,
      compRange: null,
      policy: DEFAULT_POLICY,
      asOfDate: new Date('2025-01-01'),
    });
    const scenA = result.allScenarios.find(s => s.concessionMonths === 0 &&
      Math.abs(s.proposedRent - 2000 * 1.06) < 1);
    expect(scenA).toBeDefined();
  });

  it('recommended is the policy-compliant scenario with highest effectiveMonthlyNet', () => {
    const result = optimizeUnit({
      currentRent: 2000,
      maxAllowablePct: 0.06,
      bankingState: NO_BANKING,
      compRange: COMP_RANGE,
      policy: DEFAULT_POLICY,
      asOfDate: new Date('2025-01-01'),
    });
    const compliant = result.allScenarios.filter(s => s.meetsPolicy);
    const maxNet = Math.max(...compliant.map(s => s.effectiveMonthlyNet));
    expect(result.recommended.effectiveMonthlyNet).toBeCloseTo(maxNet, 1);
    expect(result.recommended.meetsPolicy).toBe(true);
  });

  it('effectiveMonthlyNet = proposedRent * (12 - concessionMonths) / 12', () => {
    const result = optimizeUnit({
      currentRent: 2000,
      maxAllowablePct: 0.06,
      bankingState: NO_BANKING,
      compRange: null,
      policy: DEFAULT_POLICY,
      asOfDate: new Date('2025-01-01'),
    });
    for (const s of result.allScenarios) {
      const expected = (s.proposedRent * (12 - s.concessionMonths)) / 12;
      expect(s.effectiveMonthlyNet).toBeCloseTo(expected, 1);
    }
  });

  it('annualNetRevenue = proposedRent * 12 - proposedRent * concessionMonths', () => {
    const result = optimizeUnit({
      currentRent: 2000,
      maxAllowablePct: 0.06,
      bankingState: NO_BANKING,
      compRange: null,
      policy: DEFAULT_POLICY,
      asOfDate: new Date('2025-01-01'),
    });
    for (const s of result.allScenarios) {
      const expected = s.proposedRent * 12 - s.proposedRent * s.concessionMonths;
      expect(s.annualNetRevenue).toBeCloseTo(expected, 1);
    }
  });

  it('warns when maxAllowablePct <= 0', () => {
    const result = optimizeUnit({
      currentRent: 2000,
      maxAllowablePct: 0,
      bankingState: NO_BANKING,
      compRange: null,
      policy: DEFAULT_POLICY,
      asOfDate: new Date('2025-01-01'),
    });
    expect(result.warnings.some(w => w.includes('No allowable increase'))).toBe(true);
  });

  it('warns when no comp data is available', () => {
    const result = optimizeUnit({
      currentRent: 2000,
      maxAllowablePct: 0.06,
      bankingState: NO_BANKING,
      compRange: null,
      policy: DEFAULT_POLICY,
      asOfDate: new Date('2025-01-01'),
    });
    expect(result.hasCompData).toBe(false);
    expect(result.warnings.some(w => w.includes('No comp data'))).toBe(true);
  });

  it('hasCompData is true when compRange is provided', () => {
    const result = optimizeUnit({
      currentRent: 2000,
      maxAllowablePct: 0.06,
      bankingState: NO_BANKING,
      compRange: COMP_RANGE,
      policy: DEFAULT_POLICY,
      asOfDate: new Date('2025-01-01'),
    });
    expect(result.hasCompData).toBe(true);
  });

  it('meetsPolicy is false when concessionMonths exceeds maxConcessionMonths', () => {
    const strictPolicy: Policy = { maxConcessionMonths: 0, targetOccupancyPct: 0.95 };
    const result = optimizeUnit({
      currentRent: 2000,
      maxAllowablePct: 0.06,
      bankingState: NO_BANKING,
      compRange: COMP_RANGE,
      policy: strictPolicy,
      asOfDate: new Date('2025-01-01'),
    });
    const withConcession = result.allScenarios.filter(s => s.concessionMonths > 0);
    for (const s of withConcession) {
      expect(s.meetsPolicy).toBe(false);
    }
  });

  it('falls back to all scenarios when none meet policy', () => {
    // Zero concession allowed, but comp scenarios add concession
    const strictPolicy: Policy = { maxConcessionMonths: 0, targetOccupancyPct: 0.95 };
    const result = optimizeUnit({
      currentRent: 2000,
      maxAllowablePct: 0.06,
      bankingState: NO_BANKING,
      compRange: COMP_RANGE,
      policy: strictPolicy,
      asOfDate: new Date('2025-01-01'),
    });
    // recommended should still exist
    expect(result.recommended).toBeDefined();
  });

  it('compDeltaPct is positive when effectiveMonthlyNet > comp median', () => {
    // maxRent = 2120; no concession; comp median = 2100
    const result = optimizeUnit({
      currentRent: 2000,
      maxAllowablePct: 0.06,
      bankingState: NO_BANKING,
      compRange: COMP_RANGE,
      policy: DEFAULT_POLICY,
      asOfDate: new Date('2025-01-01'),
    });
    const scenA = result.allScenarios[0]; // max allowable, no concession
    expect(scenA.compDeltaPct).toBeGreaterThan(0);
  });
});

describe('buildCompRange', () => {
  it('returns null for empty array', () => {
    expect(buildCompRange([])).toBeNull();
  });

  it('returns correct stats for single value', () => {
    const r = buildCompRange([2000]);
    expect(r).not.toBeNull();
    expect(r!.min).toBe(2000);
    expect(r!.max).toBe(2000);
    expect(r!.median).toBe(2000);
    expect(r!.sampleSize).toBe(1);
  });

  it('returns correct median for odd-length array', () => {
    const r = buildCompRange([1000, 2000, 3000]);
    expect(r!.median).toBe(2000);
  });

  it('returns correct median for even-length array', () => {
    const r = buildCompRange([1000, 2000, 3000, 4000]);
    expect(r!.median).toBe(2500);
  });

  it('returns correct p25 and p75', () => {
    const r = buildCompRange([1000, 2000, 3000, 4000]);
    expect(r!.p25).toBeLessThan(r!.median);
    expect(r!.p75).toBeGreaterThan(r!.median);
  });
});
