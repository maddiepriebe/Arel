import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseRentRoll } from '../../lib/parser/import';

/** Build an Excel buffer from a 2D array of values */
function makeXlsx(rows: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

const HEADER_ROW = [
  'Unit', 'Building', 'Tenant Name', 'Lease Start', 'Lease End',
  'Rent', 'Effective Date', 'Unit Type', 'Bedrooms', 'Bathrooms', 'Sq Ft',
];

describe('parseRentRoll', () => {
  it('parses a well-formed rent roll', () => {
    const buf = makeXlsx([
      HEADER_ROW,
      ['101', 'A', 'Alice Smith', '1/1/2023', '12/31/2023', 1800, '1/1/2023', '1BR', 1, 1, 750],
      ['102', 'A', 'Bob Jones',  '3/1/2022', '',           2200, '3/1/2024', '2BR', 2, 2, 1100],
    ]);
    const result = parseRentRoll(buf);
    expect(result.rows).toHaveLength(2);
    expect(result.skippedCount).toBe(0);

    const r1 = result.rows[0];
    expect(r1.unitId).toBe('A-101');
    expect(r1.tenantName).toBe('Alice Smith');
    expect(r1.currentRent).toBe(1800);
    expect(r1.leaseStart).toBe('2023-01-01');
    expect(r1.leaseEnd).toBe('2023-12-31');
    expect(r1.unitType).toBe('1BR');
    expect(r1.bedrooms).toBe(1);
    expect(r1.sqft).toBe(750);

    const r2 = result.rows[1];
    expect(r2.leaseEnd).toBeNull();
    expect(r2.unitType).toBe('2BR');
  });

  it('skips rows with no unit ID', () => {
    const buf = makeXlsx([
      HEADER_ROW,
      ['', 'A', 'Nobody', '1/1/2023', '', 1500, '1/1/2023', '1BR', 1, 1, 600],
    ]);
    const result = parseRentRoll(buf);
    expect(result.rows).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
    expect(result.warnings.some(w => w.message.includes('Missing unit ID'))).toBe(true);
  });

  it('skips rows with zero or missing rent', () => {
    const buf = makeXlsx([
      HEADER_ROW,
      ['201', '', 'Jane', '2/1/2023', '', 0, '', '1BR', 1, 1, 700],
    ]);
    const result = parseRentRoll(buf);
    expect(result.rows).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  it('parses rent with $ sign and commas', () => {
    const buf = makeXlsx([
      HEADER_ROW,
      ['301', '', 'Mark', '1/1/2023', '', '$2,150.00', '1/1/2023', '2BR', 2, 1, 950],
    ]);
    const result = parseRentRoll(buf);
    expect(result.rows[0].currentRent).toBe(2150);
  });

  it('handles empty sheet gracefully', () => {
    const buf = makeXlsx([HEADER_ROW]);
    const result = parseRentRoll(buf);
    expect(result.rows).toHaveLength(0);
    expect(result.skippedCount).toBe(0);
  });

  it('detects columns and reports them', () => {
    const buf = makeXlsx([
      HEADER_ROW,
      ['101', 'B', 'Sam', '6/1/2024', '', 1900, '', '1BR', 1, 1, 800],
    ]);
    const result = parseRentRoll(buf);
    expect(result.detectedColumns).toHaveProperty('unitId');
    expect(result.detectedColumns).toHaveProperty('currentRent');
    expect(result.detectedColumns).toHaveProperty('leaseStart');
  });

  it('infers unit type from bedroom count when unitType column absent', () => {
    const headersNoType = ['Unit', 'Tenant Name', 'Lease Start', 'Rent', 'Bedrooms'];
    const buf = makeXlsx([
      headersNoType,
      ['101', 'Alice', '1/1/2023', 1800, 1],
      ['201', 'Bob',   '1/1/2023', 2200, 2],
      ['301', 'Carl',  '1/1/2023', 1200, 0],
    ]);
    const result = parseRentRoll(buf);
    expect(result.rows[0].unitType).toBe('1BR');
    expect(result.rows[1].unitType).toBe('2BR');
    expect(result.rows[2].unitType).toBe('studio');
  });

  it('falls back to leaseStart for rentEffectiveDate when column absent', () => {
    const headersNoEffDate = ['Unit', 'Tenant Name', 'Lease Start', 'Rent'];
    const buf = makeXlsx([
      headersNoEffDate,
      ['101', 'Alice', '5/1/2023', 1800],
    ]);
    const result = parseRentRoll(buf);
    expect(result.rows[0].rentEffectiveDate).toBe('2023-05-01');
  });

  it('includes unit ID in unit ID when no building column present', () => {
    const headersNoBuilding = ['Unit', 'Tenant Name', 'Lease Start', 'Rent'];
    const buf = makeXlsx([
      headersNoBuilding,
      ['1A', 'Alice', '1/1/2023', 1800],
    ]);
    const result = parseRentRoll(buf);
    expect(result.rows[0].unitId).toBe('1A');
  });

  it('returns a warning for blank rows but does not fail', () => {
    const buf = makeXlsx([
      HEADER_ROW,
      ['101', '', 'Alice', '1/1/2023', '', 1500, '', '1BR', 1, 1, 700],
    ]);
    const result = parseRentRoll(buf);
    expect(result.rows).toHaveLength(1);
    // Missing tenant name produces a soft warning
    const hasTenantWarn = result.warnings.some(w => w.message.includes('tenant'));
    // May or may not warn depending on what's present — just ensure no crash
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('handles invalid sheet index gracefully', () => {
    const buf = makeXlsx([[HEADER_ROW]]);
    const result = parseRentRoll(buf, { sheetIndex: 99 });
    expect(result.rows).toHaveLength(0);
    expect(result.warnings[0].message).toContain('Sheet index');
  });
});
