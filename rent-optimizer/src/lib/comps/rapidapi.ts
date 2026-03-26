/**
 * RapidAPI — Zillow56 integration.
 *
 * Strongly preferred over HTML scraping: returns structured JSON directly.
 * Endpoint: https://zillow56.p.rapidapi.com/search
 *
 * Sign up at rapidapi.com/search for "Zillow56" and set RAPIDAPI_KEY in .env.local
 */

import type { NewComp } from '../db/schema';

const ZILLOW56_ENDPOINT = 'https://zillow56.p.rapidapi.com/search';

/** Raw listing shape returned by Zillow56 /search */
interface Zillow56Result {
  zpid?: string | number;
  streetAddress?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  price?: number;
  units?: { price?: number }[];
  beds?: number;
  baths?: number;
  livingArea?: number;
  homeType?: string;
  buildingName?: string;
  detailUrl?: string;
  // rental-specific extras
  minBeds?: number;
  maxBeds?: number;
  minBaths?: number;
  rentZestimate?: number;
}

interface Zillow56Response {
  results?: Zillow56Result[];
  totalResultCount?: number;
  resultsPerPage?: number;
}

/**
 * Fetch rental listings for a city from Zillow via RapidAPI.
 *
 * @param city     - City name, e.g. "Rockville"
 * @param apiKey   - RAPIDAPI_KEY
 * @param page     - Page number (1-based)
 */
export async function fetchZillow56(
  city: string,
  apiKey: string,
  page = 1
): Promise<NewComp[]> {
  // Zillow56 wants "city, state" format
  const location = `${city}, MD`;

  const url = new URL(ZILLOW56_ENDPOINT);
  url.searchParams.set('location', location);
  url.searchParams.set('status', 'forRent');
  url.searchParams.set('page', String(page));

  const response = await fetch(url.toString(), {
    headers: {
      'x-rapidapi-host': 'zillow56.p.rapidapi.com',
      'x-rapidapi-key': apiKey,
    },
    // Vercel serverless: 25-second timeout is reasonable
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    throw new Error(
      `Zillow56 API error ${response.status}: ${await response.text()}`
    );
  }

  const data: Zillow56Response = await response.json();
  const results = data.results ?? [];

  return results
    .filter(r => isRentalApartment(r))
    .flatMap(r => normaliseZillowResult(r, city));
}

/**
 * Paginate through all results for a city (up to 5 pages / ~125 listings).
 */
export async function fetchAllZillow56ForCity(
  city: string,
  apiKey: string,
  maxPages = 5
): Promise<NewComp[]> {
  const all: NewComp[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const batch = await fetchZillow56(city, apiKey, page);
    all.push(...batch);
    // If we got fewer results than a full page, no more pages
    if (batch.length < 25) break;
  }
  return all;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRentalApartment(r: Zillow56Result): boolean {
  const type = r.homeType?.toUpperCase() ?? '';
  return (
    type === 'APARTMENT' ||
    type === 'CONDO' ||
    type === 'MULTI_FAMILY' ||
    type === '' // unknown type — include rather than exclude
  );
}

/**
 * A Zillow multi-unit listing may have sub-units with different bed counts.
 * We expand these into individual NewComp entries — one per unit type observed.
 */
function normaliseZillowResult(r: Zillow56Result, city: string): NewComp[] {
  const address = r.streetAddress ?? r.address ?? null;
  const propertyName = r.buildingName ?? null;
  const sourceUrl = r.detailUrl
    ? r.detailUrl.startsWith('http')
      ? r.detailUrl
      : `https://www.zillow.com${r.detailUrl}`
    : null;

  // Base asking rent — Zillow often gives the minimum for multi-unit buildings
  const basePrice = r.price ?? 0;
  if (!basePrice || basePrice < 50) return []; // skip nonsense prices

  const beds = r.beds ?? r.minBeds ?? null;
  const unitType = bedsToUnitType(beds);
  const sqft = r.livingArea ?? null;

  const comp: NewComp = {
    source: 'zillow',
    sourceUrl,
    propertyName,
    address,
    city,
    unitType,
    sqftMin: sqft ?? undefined,
    sqftMax: sqft ?? undefined,
    askingRent: String(basePrice),
    effectiveRent: null,
    concessionMonths: null,
    amenities: [],
    isActive: true,
  };

  return [comp];
}

function bedsToUnitType(beds: number | null): string {
  if (beds === null || beds === undefined) return '1BR';
  if (beds === 0) return 'studio';
  if (beds === 1) return '1BR';
  if (beds === 2) return '2BR';
  if (beds === 3) return '3BR';
  return `${beds}BR`;
}
