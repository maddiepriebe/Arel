/**
 * HTML fallback scraper for Apartments.com via ScraperAPI / Bright Data.
 *
 * Selectors are inherently fragile. On parse failure the raw HTML is logged
 * to stderr (and callers can persist it to Vercel Blob for debugging).
 *
 * ScraperAPI proxy usage:
 *   GET https://api.scraperapi.com/?api_key=KEY&url=ENCODED_TARGET&render=true
 */

import * as cheerio from 'cheerio';
import type { NewComp } from '../db/schema';

const SCRAPERAPI_ENDPOINT = 'https://api.scraperapi.com/';

export interface RawListing {
  propertyName: string | null;
  address: string | null;
  city: string;
  priceMin: number | null;
  priceMax: number | null;
  bedsMin: number | null;
  bedsMax: number | null;
  sqftMin: number | null;
  sqftMax: number | null;
  sourceUrl: string | null;
}

/**
 * Fetch and parse Apartments.com search results for a city via ScraperAPI.
 *
 * @param city      - City name, e.g. "Rockville"
 * @param apiKey    - SCRAPERAPI_KEY
 */
export async function scrapeApartmentsCom(
  city: string,
  apiKey: string
): Promise<NewComp[]> {
  const targetUrl = buildApartmentsComUrl(city);

  const proxyUrl = new URL(SCRAPERAPI_ENDPOINT);
  proxyUrl.searchParams.set('api_key', apiKey);
  proxyUrl.searchParams.set('url', targetUrl);
  proxyUrl.searchParams.set('render', 'true'); // JS rendering for React-heavy pages

  const response = await fetch(proxyUrl.toString(), {
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `ScraperAPI error ${response.status} for ${targetUrl}: ${await response.text()}`
    );
  }

  const html = await response.text();
  const listings = parseApartmentsComListings(html, city);

  if (listings.length === 0) {
    // Dump first 500 chars of HTML to help diagnose selector drift
    console.error(
      `[parser] No listings parsed for ${city}. HTML snippet:\n${html.slice(0, 500)}`
    );
  }

  return listings.flatMap(l => listingToComps(l));
}

/**
 * Parse apartments.com HTML into raw listings.
 * Uses multiple selector fallbacks to survive minor HTML structure changes.
 */
export function parseApartmentsComListings(
  html: string,
  city: string
): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];

  // Primary selector — 2024/2025 structure
  const articles = $('article.placard, li.mortar-wrapper article, .placardContainer article');

  articles.each((_i, el) => {
    const $el = $(el);

    // Property name: try multiple selectors
    const propertyName =
      $el.find('[data-testid="property-name"], .property-name, .js-placardTitle').first().text().trim() ||
      $el.find('a.property-link, a.placardTitle').first().text().trim() ||
      null;

    // Address
    const address =
      $el.find('[data-testid="property-address"], .property-address .delivery-address').first().text().trim() ||
      $el.find('.property-address').first().text().trim() ||
      null;

    // Source URL
    const href = $el.find('a.property-link, a[href*="/apartments/"]').first().attr('href') ?? null;
    const sourceUrl = href
      ? href.startsWith('http') ? href : `https://www.apartments.com${href}`
      : null;

    // Rent — often "From $X" or "$X - $Y"
    const priceText =
      $el.find('.price-range, .property-pricing .price, [data-testid="price-range"]').first().text().trim() ||
      $el.find('.property-rents').first().text().trim();

    const { min: priceMin, max: priceMax } = parseRange(priceText);

    // Beds — "1 - 3 Beds" or "2 Beds"
    const bedsText =
      $el.find('.bed-range, .property-beds, [data-testid="bed-range"]').first().text().trim();
    const { min: bedsMin, max: bedsMax } = parseRange(bedsText);

    // Sqft
    const sqftText =
      $el.find('.sqft-range, .property-sqfeet, [data-testid="sqft-range"]').first().text().trim();
    const { min: sqftMin, max: sqftMax } = parseRange(sqftText);

    // Must have at least a price to be useful
    if (priceMin === null) return;

    listings.push({
      propertyName: propertyName || null,
      address: address || null,
      city,
      priceMin,
      priceMax,
      bedsMin: bedsMin !== null ? Math.round(bedsMin) : null,
      bedsMax: bedsMax !== null ? Math.round(bedsMax) : null,
      sqftMin: sqftMin !== null ? Math.round(sqftMin) : null,
      sqftMax: sqftMax !== null ? Math.round(sqftMax) : null,
      sourceUrl,
    });
  });

  return listings;
}

/**
 * Expand a RawListing into one NewComp per unit type that appears in the
 * bed range. A listing with "1 - 3 Beds" produces three comp records.
 */
function listingToComps(listing: RawListing): NewComp[] {
  const minBeds = listing.bedsMin ?? 1;
  const maxBeds = listing.bedsMax ?? minBeds;

  const comps: NewComp[] = [];

  for (let beds = minBeds; beds <= Math.min(maxBeds, 4); beds++) {
    const unitType = bedsToUnitType(beds);

    // For multi-unit listings, we only have a total price range.
    // We use the minimum price as the asking rent for the smallest unit type,
    // and a linear interpolation for larger ones.
    const rentRange = listing.priceMax && listing.priceMax !== listing.priceMin
      ? listing.priceMax - (listing.priceMin ?? 0)
      : 0;
    const bedsRange = maxBeds - minBeds || 1;
    const adjustedRent =
      (listing.priceMin ?? 0) + (rentRange * (beds - minBeds)) / bedsRange;

    comps.push({
      source: 'apartments_com',
      sourceUrl: listing.sourceUrl,
      propertyName: listing.propertyName,
      address: listing.address,
      city: listing.city,
      unitType,
      sqftMin: listing.sqftMin ?? undefined,
      sqftMax: listing.sqftMax ?? undefined,
      askingRent: String(Math.round(adjustedRent)),
      effectiveRent: null,
      concessionMonths: null,
      amenities: [],
      isActive: true,
    });
  }

  return comps;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function buildApartmentsComUrl(city: string): string {
  const slug = city.toLowerCase().replace(/\s+/g, '-');
  return `https://www.apartments.com/${slug}-md/`;
}

/** Parse "From $1,800" / "$1,800 - $2,500" / "1 - 3 Beds" etc. into {min, max} */
function parseRange(text: string): { min: number | null; max: number | null } {
  if (!text) return { min: null, max: null };

  // Strip currency/text artifacts
  const cleaned = text.replace(/[^0-9\-–.]/g, ' ').trim();
  const nums = cleaned
    .split(/[\s\-–]+/)
    .map(s => parseFloat(s))
    .filter(n => !isNaN(n) && n > 0);

  if (nums.length === 0) return { min: null, max: null };
  if (nums.length === 1) return { min: nums[0], max: nums[0] };
  return { min: nums[0], max: nums[nums.length - 1] };
}

function bedsToUnitType(beds: number): string {
  if (beds === 0) return 'studio';
  if (beds === 1) return '1BR';
  if (beds === 2) return '2BR';
  if (beds === 3) return '3BR';
  return `${beds}BR`;
}
