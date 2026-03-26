import { describe, it, expect } from 'vitest';
import { detectColumns, getCell, normaliseHeader } from '../../lib/parser/columnMapper';

describe('normaliseHeader', () => {
  it('lowercases and strips non-alphanumeric', () => {
    expect(normaliseHeader('Unit #')).toBe('unit');
    expect(normaliseHeader('Lease Start')).toBe('leasestart');
    expect(normaliseHeader('Sq.Ft.')).toBe('sqft');
    expect(normaliseHeader('CURRENT RENT')).toBe('currentrent');
  });
});

describe('detectColumns', () => {
  it('maps standard headers to canonical fields', () => {
    const headers = ['Unit', 'Tenant Name', 'Lease Start', 'Lease End', 'Rent', 'Effective Date'];
    const map = detectColumns(headers);
    expect(map.get(0)).toBe('unitId');
    expect(map.get(1)).toBe('tenantName');
    expect(map.get(2)).toBe('leaseStart');
    expect(map.get(3)).toBe('leaseEnd');
    expect(map.get(4)).toBe('currentRent');
    expect(map.get(5)).toBe('rentEffectiveDate');
  });

  it('maps alternate header names', () => {
    const headers = ['Apt #', 'Resident', 'Move In', 'Expiration', 'Base Rent', 'Sq Ft'];
    const map = detectColumns(headers);
    expect(map.get(0)).toBe('unitId');
    expect(map.get(1)).toBe('tenantName');
    expect(map.get(2)).toBe('leaseStart');
    expect(map.get(3)).toBe('leaseEnd');
    expect(map.get(4)).toBe('currentRent');
    expect(map.get(5)).toBe('sqft');
  });

  it('handles mixed case and punctuation in headers', () => {
    const headers = ['UNIT NUMBER', 'Monthly Rent', 'Sq.Ft.'];
    const map = detectColumns(headers);
    expect(map.get(0)).toBe('unitId');
    expect(map.get(1)).toBe('currentRent');
    expect(map.get(2)).toBe('sqft');
  });

  it('ignores unrecognised columns', () => {
    const headers = ['Unit', 'Notes', 'Pet Policy', 'Parking'];
    const map = detectColumns(headers);
    expect(map.get(0)).toBe('unitId');
    expect(map.has(1)).toBe(false);
    expect(map.has(2)).toBe(false);
    expect(map.has(3)).toBe(false);
  });

  it('does not map the same field twice for duplicate headers', () => {
    const headers = ['Unit', 'Unit', 'Rent'];
    const map = detectColumns(headers);
    const unitMappings = Array.from(map.values()).filter(v => v === 'unitId');
    expect(unitMappings).toHaveLength(1);
  });

  it('returns empty map for empty header row', () => {
    expect(detectColumns([])).toEqual(new Map());
  });

  it('skips null/empty cells', () => {
    const headers = [null, '', 'Rent'];
    const map = detectColumns(headers);
    expect(map.has(0)).toBe(false);
    expect(map.has(1)).toBe(false);
    expect(map.get(2)).toBe('currentRent');
  });
});

describe('getCell', () => {
  it('returns the value at the correct column index', () => {
    const headers = ['Unit', 'Rent'];
    const colMap = detectColumns(headers);
    const row = ['101', 1500];
    expect(getCell(row, colMap, 'unitId')).toBe('101');
    expect(getCell(row, colMap, 'currentRent')).toBe(1500);
  });

  it('returns null for unmapped fields', () => {
    const colMap = detectColumns(['Unit']);
    const row = ['101'];
    expect(getCell(row, colMap, 'tenantName')).toBeNull();
  });
});
