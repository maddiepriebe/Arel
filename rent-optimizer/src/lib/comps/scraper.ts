/**
 * Comp scrape orchestrator.
 *
 * Strategy:
 *   1. If RAPIDAPI_KEY is set → use Zillow56 (structured JSON, reliable)
 *   2. If SCRAPERAPI_KEY is set → use ScraperAPI + Apartments.com HTML parser
 *   3. If neither key is set → throw (no-op in dev if both are missing)
 *
 * Cities and unit types come from src/lib/constants.ts.
 */

import { COMP_CITIES, UNIT_TYPES } from '../constants';
import { fetchAllZillow56ForCity } from './rapidapi';
import { scrapeApartmentsCom } from './parser';
import type { NewComp } from '../db/schema';

export interface ScrapeResult {
  comps: NewComp[];
  errors: ScrapeError[];
  totalFetched: number;
}

export interface ScrapeError {
  city: string;
  source: string;
  message: string;
}

/**
 * Run a full comp scrape across all configured cities.
 * Errors are collected and returned rather than thrown — partial results are OK.
 *
 * @param radiusMiles - from policy_settings (informational; filtering is post-hoc)
 */
export async function runFullScrape(radiusMiles: number = 3): Promise<ScrapeResult> {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const scraperApiKey = process.env.SCRAPERAPI_KEY;

  if (!rapidApiKey && !scraperApiKey) {
    throw new Error(
      'No scraping API key configured. Set RAPIDAPI_KEY or SCRAPERAPI_KEY in environment.'
    );
  }

  const allComps: NewComp[] = [];
  const errors: ScrapeError[] = [];

  for (const city of COMP_CITIES) {
    if (rapidApiKey) {
      try {
        const comps = await fetchAllZillow56ForCity(city, rapidApiKey);
        allComps.push(...comps);
        console.log(`[scraper] Zillow56 ${city}: ${comps.length} listings`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ city, source: 'zillow', message });
        console.error(`[scraper] Zillow56 failed for ${city}:`, message);

        // Try apartments.com as fallback if ScraperAPI is also configured
        if (scraperApiKey) {
          await runApartmentsComFallback(city, scraperApiKey, allComps, errors);
        }
      }
    } else if (scraperApiKey) {
      await runApartmentsComFallback(city, scraperApiKey, allComps, errors);
    }
  }

  // Deduplicate by (source, address, unitType) — keep the most recent
  const deduped = deduplicateComps(allComps);

  return { comps: deduped, errors, totalFetched: deduped.length };
}

/**
 * Scrape comps for a single city — used by both the cron and manual refresh.
 */
export async function scrapeCompsForCity(
  city: string,
  unitTypes: string[] = [...UNIT_TYPES],
  radiusMiles: number = 3
): Promise<NewComp[]> {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const scraperApiKey = process.env.SCRAPERAPI_KEY;

  let comps: NewComp[] = [];

  if (rapidApiKey) {
    comps = await fetchAllZillow56ForCity(city, rapidApiKey);
  } else if (scraperApiKey) {
    comps = await scrapeApartmentsCom(city, scraperApiKey);
  } else {
    throw new Error('No scraping API key configured');
  }

  // Filter to requested unit types
  return comps.filter(c => unitTypes.includes(c.unitType));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function runApartmentsComFallback(
  city: string,
  scraperApiKey: string,
  allComps: NewComp[],
  errors: ScrapeError[]
): Promise<void> {
  try {
    const comps = await scrapeApartmentsCom(city, scraperApiKey);
    allComps.push(...comps);
    console.log(`[scraper] Apartments.com ${city}: ${comps.length} listings`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push({ city, source: 'apartments_com', message });
    console.error(`[scraper] Apartments.com failed for ${city}:`, message);
  }
}

/**
 * Deduplicate comp listings by (source, normalised address, unitType).
 * When duplicates exist, keep the entry with the lower price
 * (conservative for comp comparison purposes).
 */
function deduplicateComps(comps: NewComp[]): NewComp[] {
  const seen = new Map<string, NewComp>();

  for (const comp of comps) {
    const key = compKey(comp);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, comp);
    } else {
      // Keep the lower asking rent
      const existingRent = parseFloat(String(existing.askingRent));
      const newRent = parseFloat(String(comp.askingRent));
      if (newRent < existingRent) seen.set(key, comp);
    }
  }

  return Array.from(seen.values());
}

function compKey(comp: NewComp): string {
  const addr = (comp.address ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${comp.source}::${addr}::${comp.unitType}`;
}
