import { describe, it, expect } from 'vitest';
import { getCpiCapForDate, getCpiRateForDate, isCpiRateExpiringSoon } from '../../lib/core/cpi';
import type { CpiRateRow } from '../../lib/core/types';

const RATES: CpiRateRow[] = [
  {
    periodLabel: 'July 2024–June 2025',
    periodStart: '2024-07-01',
    periodEnd: '2025-06-30',
    cpiRate: '0.033',
    capPct: '0.060',
  },
  {
    periodLabel: 'July 2025–June 2026',
    periodStart: '2025-07-01',
    periodEnd: '2026-06-30',
    cpiRate: '0.027',
    capPct: '0.057',
  },
] as any;

describe('getCpiCapForDate', () => {
  it('returns correct cap for a date in the first period', () => {
    expect(getCpiCapForDate(new Date('2024-10-15'), RATES)).toBe(0.06);
  });

  it('returns correct cap for a date in the second period', () => {
    expect(getCpiCapForDate(new Date('2025-09-01'), RATES)).toBe(0.057);
  });

  it('returns correct cap on period boundary (start)', () => {
    expect(getCpiCapForDate(new Date('2024-07-01'), RATES)).toBe(0.06);
  });

  it('returns correct cap on period boundary (end)', () => {
    expect(getCpiCapForDate(new Date('2025-06-30'), RATES)).toBe(0.06);
  });

  it('returns null for a date before any period', () => {
    expect(getCpiCapForDate(new Date('2023-01-01'), RATES)).toBeNull();
  });

  it('returns null for a date after all periods', () => {
    expect(getCpiCapForDate(new Date('2027-01-01'), RATES)).toBeNull();
  });

  it('returns null for empty rates array', () => {
    expect(getCpiCapForDate(new Date('2025-01-01'), [])).toBeNull();
  });
});

describe('getCpiRateForDate', () => {
  it('returns 3.3% for the 2024-2025 period', () => {
    expect(getCpiRateForDate(new Date('2025-01-01'), RATES)).toBeCloseTo(0.033);
  });

  it('returns 2.7% for the 2025-2026 period', () => {
    expect(getCpiRateForDate(new Date('2025-12-01'), RATES)).toBeCloseTo(0.027);
  });
});

describe('isCpiRateExpiringSoon', () => {
  it('returns true when within warning window of last period end', () => {
    // Last period ends 2026-06-30; 59 days before = ~2026-05-02
    const soon = new Date('2026-05-15');
    expect(isCpiRateExpiringSoon(soon, RATES, 60)).toBe(true);
  });

  it('returns false when outside warning window', () => {
    const notSoon = new Date('2025-01-01');
    expect(isCpiRateExpiringSoon(notSoon, RATES, 60)).toBe(false);
  });

  it('returns true for empty rates array', () => {
    expect(isCpiRateExpiringSoon(new Date('2025-01-01'), [], 60)).toBe(true);
  });
});
