/**
 * Montgomery County Rent Stabilization Program — compliance constants.
 * These values are set by law and must NOT be made user-editable.
 *
 * Sources:
 *   Montgomery County Code, Chapter 29, Article II
 *   https://www.montgomerycountymd.gov/DHCA/housing/landlordtenant/rentstabilization.html
 */

export const MOCO = {
  /** Months between allowable rent increases */
  ELIGIBILITY_MONTHS: 12,

  /** Days advance notice required before a rent increase takes effect */
  NOTICE_DAYS: 90,

  /** Hard ceiling on cumulative banked percentage (10%) */
  MAX_BANKING_CUMULATIVE: 0.10,

  /** Add-on above CPI applied when computing the allowable cap */
  BASE_ADDON: 0.03,

  /** Absolute maximum allowable increase regardless of CPI + add-on */
  ABSOLUTE_CAP: 0.06,

  /**
   * Returns the rent-stabilization cap for a given CPI rate.
   * cap = min(cpi + 0.03, 0.06)
   */
  capFormula: (cpi: number): number => Math.min(cpi + 0.03, 0.06),
} as const;

/**
 * How many days before a CPI period ends to show the "new rate not configured"
 * banner in the UI.
 */
export const CPI_BANNER_WARNING_DAYS = 60;

/** Montgomery County cities we source comp data from */
export const COMP_CITIES = ['Rockville', 'Bethesda', 'Silver Spring', 'Gaithersburg'] as const;

/** Unit types used across the app */
export const UNIT_TYPES = ['studio', '1BR', '2BR', '3BR'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

/** Import job statuses */
export const IMPORT_STATUS = {
  PENDING: 'pending',
  PARSING: 'parsing',
  DONE: 'done',
  FAILED: 'failed',
  PARTIAL: 'partial',
} as const;

/** Comp scrape job statuses */
export const SCRAPE_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
  PARTIAL: 'partial',
} as const;

/** Maximum upload file size for rent rolls (10 MB) */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Days before a manual comp expires */
export const MANUAL_COMP_EXPIRY_DAYS = 90;

/** Days before comps are marked inactive by the scraper */
export const COMP_STALENESS_DAYS = 30;
