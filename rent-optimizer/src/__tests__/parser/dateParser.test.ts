import { describe, it, expect } from 'vitest';
import { parseDate, toISODate, parseDateToISO } from '../../lib/parser/dateParser';

describe('parseDate', () => {
  it('returns null for null/undefined/empty', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('')).toBeNull();
  });

  it('parses a JS Date object', () => {
    const d = new Date('2024-03-15T00:00:00Z');
    const result = parseDate(d);
    expect(result).not.toBeNull();
    expect(toISODate(result!)).toBe('2024-03-15');
  });

  it('returns null for an invalid Date object', () => {
    expect(parseDate(new Date('not-a-date'))).toBeNull();
  });

  it('parses ISO string YYYY-MM-DD', () => {
    expect(parseDateToISO('2024-01-15')).toBe('2024-01-15');
  });

  it('parses US slash format M/D/YYYY', () => {
    expect(parseDateToISO('1/15/2024')).toBe('2024-01-15');
    expect(parseDateToISO('01/15/2024')).toBe('2024-01-15');
  });

  it('parses 2-digit year M/D/YY', () => {
    expect(parseDateToISO('1/15/24')).toBe('2024-01-15');
    expect(parseDateToISO('1/15/99')).toBe('1999-01-15');
  });

  it('parses US dash format M-D-YYYY', () => {
    expect(parseDateToISO('1-15-2024')).toBe('2024-01-15');
  });

  it('parses long month name format', () => {
    expect(parseDateToISO('January 15, 2024')).toBe('2024-01-15');
    expect(parseDateToISO('Jan 15, 2024')).toBe('2024-01-15');
    expect(parseDateToISO('Jan 15 2024')).toBe('2024-01-15');
    expect(parseDateToISO('March 1, 2025')).toBe('2025-03-01');
  });

  it('parses Excel serial number (post-1900 bug)', () => {
    // Excel serial 45297 = 2024-01-05 (verified from SheetJS output)
    const result = parseDateToISO(45297);
    expect(result).toBe('2024-01-05');
  });

  it('returns null for implausible Excel serial (< 1)', () => {
    expect(parseDate(0)).toBeNull();
    expect(parseDate(-1)).toBeNull();
  });

  it('returns null for invalid month in US format', () => {
    // Month 13 is invalid
    expect(parseDateToISO('13/01/2024')).toBeNull();
  });

  it('returns null for invalid day overflow', () => {
    // Feb 30 does not exist
    expect(parseDateToISO('2024-02-30')).toBeNull();
  });

  it('strips time component — always returns midnight UTC', () => {
    const d = new Date('2024-06-15T14:30:00Z');
    const result = parseDate(d);
    expect(result?.getUTCHours()).toBe(0);
    expect(result?.getUTCMinutes()).toBe(0);
  });
});

describe('toISODate', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    expect(toISODate(new Date(Date.UTC(2024, 0, 5)))).toBe('2024-01-05');
    expect(toISODate(new Date(Date.UTC(2024, 11, 31)))).toBe('2024-12-31');
  });
});
