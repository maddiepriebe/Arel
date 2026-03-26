/**
 * Multi-format date parsing for rent roll cells.
 *
 * Handles:
 *   - JS Date objects (from SheetJS `cellDates: true`)
 *   - Excel serial numbers (days since 1899-12-30)
 *   - ISO strings: '2024-01-15'
 *   - US short:    '1/15/2024', '01/15/2024', '1/15/24'
 *   - US long:     'January 15, 2024', 'Jan 15 2024'
 *   - Slash-DMY:   '15/01/2024' (less common but seen in some exports)
 */

/** Excel epoch: December 30, 1899 */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

/**
 * Parse a cell value to a JS Date, or return null if it cannot be parsed.
 *
 * @param value - Raw cell value from SheetJS (Date | number | string | null)
 */
export function parseDate(value: unknown): Date | null {
  if (value == null || value === '') return null;

  // Already a Date (SheetJS with cellDates:true)
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : stripTime(value);
  }

  // Excel serial number (positive integer or float)
  if (typeof value === 'number') {
    if (value < 1 || value > 2_958_465) return null; // before 1900 or after 9999
    // Adjust for Excel's incorrect 1900 leap year bug
    const adjusted = value > 59 ? value - 1 : value;
    return stripTime(new Date(EXCEL_EPOCH_MS + adjusted * MS_PER_DAY));
  }

  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;

    // ISO: 2024-01-15
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return fromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));

    // US: M/D/YYYY or M/D/YY
    const usSlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (usSlash) {
      let year = Number(usSlash[3]);
      if (year < 100) year += year >= 50 ? 1900 : 2000;
      return fromParts(year, Number(usSlash[1]), Number(usSlash[2]));
    }

    // US dash: M-D-YYYY
    const usDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (usDash) {
      return fromParts(Number(usDash[3]), Number(usDash[1]), Number(usDash[2]));
    }

    // Long form: "January 15, 2024" or "Jan 15 2024" or "Jan 15, 2024"
    const long = s.match(
      /^([A-Za-z]+)\s+(\d{1,2})[,\s]+(\d{4})$/
    );
    if (long) {
      const month = parseMonthName(long[1]);
      if (month !== null) return fromParts(Number(long[3]), month, Number(long[2]));
    }

    // Last resort: let the JS engine try
    const d = new Date(s);
    if (!isNaN(d.getTime())) return stripTime(d);
  }

  return null;
}

/**
 * Format a Date as 'YYYY-MM-DD' string (the format Drizzle date columns expect).
 */
export function toISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse and format in one step; returns null if parsing fails. */
export function parseDateToISO(value: unknown): string | null {
  const d = parseDate(value);
  return d ? toISODate(d) : null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fromParts(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Sanity: month might overflow (e.g. Feb 30) — JS normalises, so check it stayed
  if (d.getUTCMonth() !== month - 1) return null;
  return d;
}

function stripTime(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function parseMonthName(name: string): number | null {
  return MONTH_NAMES[name.toLowerCase()] ?? null;
}
