/**
 * Seed script — run once after `drizzle-kit push` to populate CPI rates and
 * default policy settings.
 *
 * Usage:
 *   npm run db:seed
 *
 * Add future CPI periods here each July when MoCo publishes new rates.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { MOCO } from '../constants';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

// ---------------------------------------------------------------------------
// CPI rate data  — update this list each July
// capPct = min(cpiRate + BASE_ADDON, ABSOLUTE_CAP)
// ---------------------------------------------------------------------------
const CPI_SEED = [
  {
    periodLabel: 'July 2024–June 2025',
    periodStart: '2024-07-01',
    periodEnd: '2025-06-30',
    cpiRate: '0.03300',
    capPct: String(MOCO.capFormula(0.033).toFixed(5)),  // 0.06000
    notes: 'CPI-U Washington DC Metro area, published June 2024',
  },
  {
    periodLabel: 'July 2025–June 2026',
    periodStart: '2025-07-01',
    periodEnd: '2026-06-30',
    cpiRate: '0.02700',
    capPct: String(MOCO.capFormula(0.027).toFixed(5)),  // 0.05700
    notes: 'CPI-U Washington DC Metro area, published June 2025',
  },
] as const;

async function seedCpiRates() {
  console.log('Seeding CPI rates...');

  for (const row of CPI_SEED) {
    // Check if this period already exists to avoid duplicate inserts
    const existing = await db
      .select()
      .from(schema.cpiRates)
      .where(eq(schema.cpiRates.periodStart, row.periodStart));

    if (existing.length > 0) {
      console.log(`  Skipping ${row.periodLabel} (already seeded)`);
      continue;
    }

    await db.insert(schema.cpiRates).values({
      periodLabel: row.periodLabel,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      cpiRate: row.cpiRate,
      capPct: row.capPct,
      notes: row.notes,
    });

    console.log(`  Inserted ${row.periodLabel} — cap: ${row.capPct}`);
  }
}

async function seedPolicySettings() {
  console.log('Seeding default policy settings...');

  const existing = await db.select().from(schema.policySettings);
  if (existing.length > 0) {
    console.log('  Policy settings already exist, skipping.');
    return;
  }

  await db.insert(schema.policySettings).values({
    maxConcessionMonths: '1.5',
    targetOccupancyPct: '0.950',
    compRadiusMiles: '3.0',
    compRefreshIntervalDays: 7,
    landlordName: '',
    propertyAddress: '',
  });

  console.log('  Inserted default policy settings.');
}

async function main() {
  try {
    await seedCpiRates();
    await seedPolicySettings();
    console.log('\nSeed complete.');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

main();
