import type { ParsedRow } from './import';

export interface ValidationWarning {
  unit: string;
  rowIndex: number;
  message: string;
}

/**
 * Validate a fully-parsed row and return any warnings.
 * A row with a critical warning (marked fatal) should be skipped.
 */
export interface ValidationResult {
  warnings: ValidationWarning[];
  /** If true, this row should not be upserted */
  fatal: boolean;
}

export function validateRow(row: ParsedRow): ValidationResult {
  const warnings: ValidationWarning[] = [];
  let fatal = false;

  const tag = (message: string) =>
    warnings.push({ unit: row.unitId, rowIndex: row.rawRowIndex, message });

  // ── Required fields ───────────────────────────────────────────────────────
  if (!row.unitId || row.unitId.trim() === '') {
    tag('Missing unit ID — row skipped');
    fatal = true;
    return { warnings, fatal };
  }

  if (isNaN(row.currentRent) || row.currentRent <= 0) {
    tag(`Invalid rent amount: ${row.currentRent} — row skipped`);
    fatal = true;
    return { warnings, fatal };
  }

  // ── Soft warnings ─────────────────────────────────────────────────────────
  if (!row.leaseStart) {
    tag('Missing lease start date');
  }

  if (row.leaseEnd && row.leaseStart && row.leaseEnd < row.leaseStart) {
    tag(`Lease end (${row.leaseEnd}) is before lease start (${row.leaseStart})`);
  }

  if (row.currentRent > 20_000) {
    tag(`Unusually high rent: $${row.currentRent} — verify manually`);
  }

  if (row.currentRent < 100) {
    tag(`Unusually low rent: $${row.currentRent} — verify manually`);
  }

  if (!row.tenantName) {
    tag('Missing tenant name');
  }

  if (!row.rentEffectiveDate && row.leaseStart) {
    // Use lease start as fallback — just warn
    tag('Rent effective date not found; using lease start date');
  }

  if (row.sqft !== null && (row.sqft < 50 || row.sqft > 10_000)) {
    tag(`Unusual sqft: ${row.sqft}`);
  }

  if (row.bedrooms !== null && (row.bedrooms < 0 || row.bedrooms > 10)) {
    tag(`Unusual bedroom count: ${row.bedrooms}`);
  }

  return { warnings, fatal };
}

/** Infer unit type string from bedroom count if unitType column wasn't detected */
export function inferUnitType(bedrooms: number | null): string | null {
  if (bedrooms === null) return null;
  if (bedrooms === 0) return 'studio';
  if (bedrooms === 1) return '1BR';
  if (bedrooms === 2) return '2BR';
  if (bedrooms === 3) return '3BR';
  return `${bedrooms}BR`;
}

/** Normalise a unit type string to the canonical form: studio | 1BR | 2BR | 3BR */
export function normaliseUnitType(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === 'studio' || s === '0br' || s === 'eff' || s === 'efficiency') return 'studio';
  const m = s.match(/^(\d)[\s-]?br?/);
  if (m) return `${m[1]}BR`;
  return raw.trim();
}

/** Parse a rent dollar value from various cell representations */
export function parseRentAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Strip $ commas and whitespace
    const cleaned = value.replace(/[$,\s]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  return null;
}
