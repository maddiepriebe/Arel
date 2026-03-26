import {
  pgTable,
  text,
  integer,
  numeric,
  boolean,
  serial,
  timestamp,
  date,
  json,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// units
// ---------------------------------------------------------------------------
export const units = pgTable('units', {
  id: text('id').primaryKey(),               // "1A", "201", etc.
  buildingCode: text('building_code'),
  unitNumber: text('unit_number').notNull(),
  sqft: integer('sqft'),
  bedrooms: integer('bedrooms'),
  bathrooms: numeric('bathrooms'),           // 1.5 bath etc.
  unitType: text('unit_type'),               // 'studio' | '1BR' | '2BR' | '3BR'
  isExempt: boolean('is_exempt').default(false), // exempt from rent control
  createdAt: timestamp('created_at').defaultNow(),
});

// ---------------------------------------------------------------------------
// leases
// ---------------------------------------------------------------------------
export const leases = pgTable('leases', {
  id: serial('id').primaryKey(),
  unitId: text('unit_id').references(() => units.id),
  tenantName: text('tenant_name'),
  leaseStart: date('lease_start').notNull(),
  leaseEnd: date('lease_end'),               // null = month-to-month
  currentRent: numeric('current_rent', { precision: 10, scale: 2 }).notNull(),
  rentEffectiveDate: date('rent_effective_date').notNull(),
  isCurrent: boolean('is_current').default(true),
  sourceFileId: text('source_file_id'),      // Vercel Blob URL
  sourceFileLabel: text('source_file_label'),
  rowIndex: integer('row_index'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ---------------------------------------------------------------------------
// rent_history
// ---------------------------------------------------------------------------
export const rentHistory = pgTable('rent_history', {
  id: serial('id').primaryKey(),
  unitId: text('unit_id').references(() => units.id),
  effectiveDate: date('effective_date').notNull(),
  rentAmount: numeric('rent_amount', { precision: 10, scale: 2 }).notNull(),
  increaseAmount: numeric('increase_amount', { precision: 10, scale: 2 }),
  increasePct: numeric('increase_pct', { precision: 6, scale: 5 }),
  increaseType: text('increase_type'),       // 'increase' | 'concession' | 'initial'
  cpiRateApplied: numeric('cpi_rate_applied', { precision: 6, scale: 5 }),
  bankedAmountUsed: numeric('banked_amount_used', { precision: 6, scale: 5 }),
  sourceFileId: text('source_file_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ---------------------------------------------------------------------------
// banking_ledger
// ---------------------------------------------------------------------------
export const bankingLedger = pgTable('banking_ledger', {
  id: serial('id').primaryKey(),
  unitId: text('unit_id').references(() => units.id),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  allowablePct: numeric('allowable_pct', { precision: 6, scale: 5 }),
  usedPct: numeric('used_pct', { precision: 6, scale: 5 }),
  bankedPct: numeric('banked_pct', { precision: 6, scale: 5 }),
  cumulativeBanked: numeric('cumulative_banked', { precision: 6, scale: 5 }),
  computedAt: timestamp('computed_at').defaultNow(),
});

// ---------------------------------------------------------------------------
// cpi_rates  (seeded, not user-editable via UI)
// ---------------------------------------------------------------------------
export const cpiRates = pgTable('cpi_rates', {
  id: serial('id').primaryKey(),
  periodLabel: text('period_label').notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  cpiRate: numeric('cpi_rate', { precision: 6, scale: 5 }).notNull(),
  capPct: numeric('cap_pct', { precision: 6, scale: 5 }).notNull(),
  notes: text('notes'),
});

// ---------------------------------------------------------------------------
// comps
// ---------------------------------------------------------------------------
export const comps = pgTable('comps', {
  id: serial('id').primaryKey(),
  source: text('source').notNull(),          // 'zillow' | 'apartments_com' | 'manual'
  sourceUrl: text('source_url'),
  propertyName: text('property_name'),
  address: text('address'),
  city: text('city').default('Rockville'),
  unitType: text('unit_type').notNull(),     // '1BR', '2BR', etc.
  sqftMin: integer('sqft_min'),
  sqftMax: integer('sqft_max'),
  askingRent: numeric('asking_rent', { precision: 10, scale: 2 }).notNull(),
  effectiveRent: numeric('effective_rent', { precision: 10, scale: 2 }),
  concessionMonths: numeric('concession_months', { precision: 4, scale: 2 }),
  amenities: text('amenities').array(),
  scrapedAt: timestamp('scraped_at').defaultNow(),
  isActive: boolean('is_active').default(true),
});

// ---------------------------------------------------------------------------
// comp_scrape_jobs
// ---------------------------------------------------------------------------
export const compScrapeJobs = pgTable('comp_scrape_jobs', {
  id: serial('id').primaryKey(),
  status: text('status').notNull(),          // 'pending' | 'running' | 'done' | 'failed' | 'partial'
  triggeredBy: text('triggered_by'),         // 'cron' | userId
  resultCount: integer('result_count'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ---------------------------------------------------------------------------
// import_jobs
// ---------------------------------------------------------------------------
export const importJobs = pgTable('import_jobs', {
  id: serial('id').primaryKey(),
  blobUrl: text('blob_url').notNull(),
  filename: text('filename').notNull(),
  status: text('status').notNull(),          // 'pending' | 'parsing' | 'done' | 'failed' | 'partial'
  rowsProcessed: integer('rows_processed'),
  rowsSkipped: integer('rows_skipped'),
  warnings: json('warnings'),               // array of { unit, message }
  uploadedBy: text('uploaded_by'),           // Clerk userId
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
});

// ---------------------------------------------------------------------------
// policy_settings
// ---------------------------------------------------------------------------
export const policySettings = pgTable('policy_settings', {
  id: serial('id').primaryKey(),
  maxConcessionMonths: numeric('max_concession_months', { precision: 4, scale: 2 }).default('1.5'),
  targetOccupancyPct: numeric('target_occupancy_pct', { precision: 4, scale: 3 }).default('0.95'),
  compRadiusMiles: numeric('comp_radius_miles', { precision: 4, scale: 1 }).default('3.0'),
  compRefreshIntervalDays: integer('comp_refresh_interval_days').default(7),
  landlordName: text('landlord_name').default(''),
  propertyAddress: text('property_address').default(''),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedBy: text('updated_by'),
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------
export type Unit = typeof units.$inferSelect;
export type NewUnit = typeof units.$inferInsert;
export type Lease = typeof leases.$inferSelect;
export type NewLease = typeof leases.$inferInsert;
export type RentHistory = typeof rentHistory.$inferSelect;
export type NewRentHistory = typeof rentHistory.$inferInsert;
export type BankingLedger = typeof bankingLedger.$inferSelect;
export type CpiRate = typeof cpiRates.$inferSelect;
export type Comp = typeof comps.$inferSelect;
export type NewComp = typeof comps.$inferInsert;
export type CompScrapeJob = typeof compScrapeJobs.$inferSelect;
export type ImportJob = typeof importJobs.$inferSelect;
export type PolicySettings = typeof policySettings.$inferSelect;
