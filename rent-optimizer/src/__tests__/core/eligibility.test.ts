import { describe, it, expect } from 'vitest';
import { checkEligibility } from '../../lib/core/eligibility';

describe('checkEligibility', () => {
  it('is eligible when > 12 months since last increase', () => {
    const history = [
      { effectiveDate: '2023-01-01', increaseType: 'increase' },
    ];
    const result = checkEligibility(history, new Date('2024-02-01'));
    expect(result.isEligible).toBe(true);
    expect(result.monthsSinceLastIncrease).toBeGreaterThanOrEqual(12);
  });

  it('is not eligible when < 12 months since last increase', () => {
    const history = [
      { effectiveDate: '2024-01-01', increaseType: 'increase' },
    ];
    const result = checkEligibility(history, new Date('2024-06-01'));
    expect(result.isEligible).toBe(false);
    expect(result.monthsSinceLastIncrease).toBeLessThan(12);
  });

  it('treats no history as immediately eligible (baseline-only)', () => {
    const result = checkEligibility([], new Date('2025-01-01'));
    expect(result.isEligible).toBe(true);
    expect(result.lastIncreaseDate).toBeNull();
  });

  it('ignores concession events when finding last increase date', () => {
    const history = [
      { effectiveDate: '2024-01-01', increaseType: 'increase' },
      { effectiveDate: '2024-06-01', increaseType: 'concession' },
    ];
    const result = checkEligibility(history, new Date('2025-02-01'));
    expect(result.lastIncreaseDate?.toISOString().slice(0, 10)).toBe('2024-01-01');
    expect(result.isEligible).toBe(true);
  });

  it('uses the most recent increase (not the oldest)', () => {
    const history = [
      { effectiveDate: '2022-01-01', increaseType: 'increase' },
      { effectiveDate: '2024-01-01', increaseType: 'increase' },
    ];
    // 9 months after the 2024 increase
    const result = checkEligibility(history, new Date('2024-10-01'));
    expect(result.lastIncreaseDate?.toISOString().slice(0, 10)).toBe('2024-01-01');
    expect(result.isEligible).toBe(false);
  });

  it('calculates earliestEligibleDate as lastIncreaseDate + 12 months', () => {
    const history = [{ effectiveDate: '2023-04-15', increaseType: 'increase' }];
    const result = checkEligibility(history, new Date('2025-01-01'));
    expect(result.earliestEligibleDate.toISOString().slice(0, 10)).toBe('2024-04-15');
  });

  it('calculates noticeDeadline as earliestEligibleDate - 90 days', () => {
    const history = [{ effectiveDate: '2023-04-15', increaseType: 'increase' }];
    const result = checkEligibility(history, new Date('2025-01-01'));
    // earliestEligible = 2024-04-15; minus 90 days = 2024-01-16
    expect(result.noticeDeadline.toISOString().slice(0, 10)).toBe('2024-01-16');
  });

  it('daysUntilEligible is negative when already eligible', () => {
    const history = [{ effectiveDate: '2023-01-01', increaseType: 'increase' }];
    const result = checkEligibility(history, new Date('2025-01-01'));
    expect(result.daysUntilEligible).toBeLessThan(0);
  });

  it('daysUntilEligible is positive when not yet eligible', () => {
    const history = [{ effectiveDate: '2025-01-01', increaseType: 'increase' }];
    const result = checkEligibility(history, new Date('2025-06-01'));
    expect(result.daysUntilEligible).toBeGreaterThan(0);
  });

  it('noticeOverdue is true when eligible but past notice deadline', () => {
    const history = [{ effectiveDate: '2022-01-01', increaseType: 'increase' }];
    // eligible since 2023-01-01; noticeDeadline = 2022-10-03
    const result = checkEligibility(history, new Date('2025-01-01'));
    expect(result.isEligible).toBe(true);
    expect(result.noticeOverdue).toBe(true);
  });

  it('noticeOverdue is false when not yet eligible', () => {
    const history = [{ effectiveDate: '2025-01-01', increaseType: 'increase' }];
    const result = checkEligibility(history, new Date('2025-06-01'));
    expect(result.noticeOverdue).toBe(false);
  });
});
