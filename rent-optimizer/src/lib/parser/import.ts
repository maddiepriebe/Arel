/**
 * Main rent roll import orchestrator.
 *
 * Pure function — no DB calls. Receives a file buffer, returns structured rows
 * and warnings. DB upsert happens in the API route after calling this.
 */

import * as XLSX from 'xlsx';
import { detectColumns, getCell } from './columnMapper';
import { parseDateToISO } from './dateParser';
import { validateRow, inferUnitType, normaliseUnitType, parseRentAmount } from './validator';
import type { ValidationWarning } from './validator';

export interface ParsedRow {
  unitId: string;
  buildingCode: string | null;
  tenantName: string | null;
  leaseStart: string | null;        // 'YYYY-MM-DD'
  leaseEnd: string | null;          // 'YYYY-MM-DD' or null (month-to-month)
  currentRent: number;
  rentEffectiveDate: string | null; // 'YYYY-MM-DD'
  unitType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  rawRowIndex: number;              // 1-based row number in the sheet
}

export interface ImportResult {
  rows: ParsedRow[];
  warnings: ValidationWarning[];
  skippedCount: number;
  /** Zero-based column index map (for debugging / UI display) */
  detectedColumns: Record<string, number>;
}

/**
 * Parse an Excel file buffer into structured rent roll rows.
 *
 * @param buffer - Raw file bytes (ArrayBuffer or Buffer)
 * @param options.sheetIndex - Which sheet to parse (default 0)
 * @param options.headerRowIndex - Which row contains headers (default 0, 0-based)
 */
export function parseRentRoll(
  buffer: ArrayBuffer | Buffer,
  options: { sheetIndex?: number; headerRowIndex?: number } = {}
): ImportResult {
  const { sheetIndex = 0, headerRowIndex = 0 } = options;

  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,   // parse date cells as JS Date objects
    cellNF: false,
    cellText: false,
  });

  const sheetName = workbook.SheetNames[sheetIndex];
  if (!sheetName) {
    return {
      rows: [],
      warnings: [{ unit: '', rowIndex: 0, message: `Sheet index ${sheetIndex} not found in workbook` }],
      skippedCount: 0,
      detectedColumns: {},
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });

  if (rawRows.length <= headerRowIndex) {
    return {
      rows: [],
      warnings: [{ unit: '', rowIndex: 0, message: 'Sheet appears to be empty' }],
      skippedCount: 0,
      detectedColumns: {},
    };
  }

  const headerRow = rawRows[headerRowIndex] as unknown[];
  const colMap = detectColumns(headerRow);

  // Build a human-readable map for the response
  const detectedColumns: Record<string, number> = {};
  for (const [idx, field] of Array.from(colMap.entries())) {
    detectedColumns[field] = idx;
  }

  const rows: ParsedRow[] = [];
  const allWarnings: ValidationWarning[] = [];
  let skippedCount = 0;

  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const raw = rawRows[i] as unknown[];
    const rowNum = i + 1; // 1-based for user-facing messages

    // Skip completely blank rows
    if (raw.every(c => c == null || c === '')) continue;

    // Extract fields
    const rawUnitId = getCell(raw, colMap, 'unitId');
    const rawBuilding = getCell(raw, colMap, 'buildingCode');
    const rawTenant = getCell(raw, colMap, 'tenantName');
    const rawLeaseStart = getCell(raw, colMap, 'leaseStart');
    const rawLeaseEnd = getCell(raw, colMap, 'leaseEnd');
    const rawRent = getCell(raw, colMap, 'currentRent');
    const rawEffDate = getCell(raw, colMap, 'rentEffectiveDate');
    const rawType = getCell(raw, colMap, 'unitType');
    const rawBeds = getCell(raw, colMap, 'bedrooms');
    const rawBaths = getCell(raw, colMap, 'bathrooms');
    const rawSqft = getCell(raw, colMap, 'sqft');

    const rent = parseRentAmount(rawRent);
    const beds = rawBeds != null ? Number(rawBeds) : null;
    const baths = rawBaths != null ? Number(rawBaths) : null;
    const sqft = rawSqft != null ? Number(rawSqft) : null;
    const leaseStart = parseDateToISO(rawLeaseStart);
    const leaseEnd = parseDateToISO(rawLeaseEnd);
    const rentEffectiveDate = parseDateToISO(rawEffDate);

    let unitType = normaliseUnitType(rawType != null ? String(rawType) : null);
    if (!unitType && beds !== null && !isNaN(beds)) {
      unitType = inferUnitType(beds);
    }

    // Build unit ID — combine building + unit if both present
    const rawUnitPart = rawUnitId != null ? String(rawUnitId).trim() : '';
    const buildingCode = rawBuilding != null ? String(rawBuilding).trim() : null;
    const unitId =
      buildingCode && rawUnitPart && !rawUnitPart.startsWith(buildingCode)
        ? `${buildingCode}-${rawUnitPart}`
        : rawUnitPart;

    const parsed: ParsedRow = {
      unitId,
      buildingCode,
      tenantName: rawTenant != null ? String(rawTenant).trim() : null,
      leaseStart,
      leaseEnd,
      currentRent: rent ?? 0,
      rentEffectiveDate: rentEffectiveDate ?? leaseStart,
      unitType,
      bedrooms: beds !== null && !isNaN(beds) ? beds : null,
      bathrooms: baths !== null && !isNaN(baths) ? baths : null,
      sqft: sqft !== null && !isNaN(sqft) ? sqft : null,
      rawRowIndex: rowNum,
    };

    const { warnings, fatal } = validateRow(parsed);
    for (const w of warnings) allWarnings.push(w);

    if (fatal) {
      skippedCount++;
      continue;
    }

    rows.push(parsed);
  }

  return { rows, warnings: allWarnings, skippedCount, detectedColumns };
}
