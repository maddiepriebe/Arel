import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, desc, and, gte, ne } from 'drizzle-orm';
import { db } from '@/src/lib/db/client';
import { comps, compScrapeJobs, policySettings } from '@/src/lib/db/schema';
import { runFullScrape } from '@/src/lib/comps/scraper';
import { SCRAPE_STATUS, COMP_STALENESS_DAYS } from '@/src/lib/constants';
import { subDays } from 'date-fns';

const MANUAL_REFRESH_COOLDOWN_HOURS = 24;

/** Verify the caller is an admin via Clerk session claims. */
async function requireAdmin(): Promise<string | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;
  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role;
  if (role !== undefined && role !== 'admin') return null;
  return userId;
}

export async function POST(_request: NextRequest) {
  const userId = await requireAdmin();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized — admin role required' }, { status: 403 });
  }

  // ── Rate limit: once per 24 hours ─────────────────────────────────────────
  const cooldownStart = subDays(new Date(), MANUAL_REFRESH_COOLDOWN_HOURS / 24);

  const recentJobs = await db
    .select({ createdAt: compScrapeJobs.createdAt, status: compScrapeJobs.status })
    .from(compScrapeJobs)
    .where(
      and(
        gte(compScrapeJobs.createdAt, cooldownStart),
        ne(compScrapeJobs.status, SCRAPE_STATUS.FAILED)
      )
    )
    .orderBy(desc(compScrapeJobs.createdAt))
    .limit(1);

  if (recentJobs.length > 0) {
    const lastRun = recentJobs[0].createdAt!;
    const msSince = Date.now() - lastRun.getTime();
    const hoursRemaining = (
      MANUAL_REFRESH_COOLDOWN_HOURS - msSince / (1000 * 60 * 60)
    ).toFixed(1);

    return NextResponse.json(
      {
        error: `Rate limited — scrape was run recently. Try again in ${hoursRemaining} hours.`,
        nextAllowedAt: new Date(
          lastRun.getTime() + MANUAL_REFRESH_COOLDOWN_HOURS * 60 * 60 * 1000
        ).toISOString(),
      },
      { status: 429 }
    );
  }

  // ── Create scrape job ──────────────────────────────────────────────────────
  const [job] = await db
    .insert(compScrapeJobs)
    .values({
      status: SCRAPE_STATUS.RUNNING,
      triggeredBy: userId,
      startedAt: new Date(),
    })
    .returning({ id: compScrapeJobs.id });

  // ── Run scrape (fire and forget with error handling) ──────────────────────
  // We run synchronously here since Vercel serverless functions don't support
  // true background workers. For production at scale, move to a queue.
  try {
    const settingsRows = await db.select().from(policySettings).limit(1);
    const radiusMiles = settingsRows[0]
      ? parseFloat(settingsRows[0].compRadiusMiles ?? '3.0')
      : 3.0;

    const result = await runFullScrape(radiusMiles);

    await upsertComps(result.comps);
    await markStaleCompsInactive();

    const finalStatus =
      result.errors.length > 0 && result.comps.length === 0
        ? SCRAPE_STATUS.FAILED
        : result.errors.length > 0
        ? SCRAPE_STATUS.PARTIAL
        : SCRAPE_STATUS.DONE;

    await db
      .update(compScrapeJobs)
      .set({
        status: finalStatus,
        resultCount: result.totalFetched,
        errorMessage:
          result.errors.length > 0
            ? result.errors.map(e => `${e.city}/${e.source}: ${e.message}`).join('; ')
            : null,
        completedAt: new Date(),
      })
      .where(eq(compScrapeJobs.id, job.id));

    return NextResponse.json({
      jobId: job.id,
      status: finalStatus,
      resultCount: result.totalFetched,
      errors: result.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await db
      .update(compScrapeJobs)
      .set({ status: SCRAPE_STATUS.FAILED, errorMessage: message, completedAt: new Date() })
      .where(eq(compScrapeJobs.id, job.id));

    console.error('[comps/refresh] Scrape failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Shared helpers (also used by cron) ───────────────────────────────────────

import type { NewComp } from '@/src/lib/db/schema';

/**
 * Upsert scraped comps into the DB.
 * Match on (source, normalised address, unitType) — update price if exists,
 * insert if new. Manual comps are never touched.
 */
export async function upsertComps(scraped: NewComp[]): Promise<void> {
  if (scraped.length === 0) return;

  // Load existing non-manual comps for efficient in-memory matching
  const existing = await db
    .select({ id: comps.id, source: comps.source, address: comps.address, unitType: comps.unitType })
    .from(comps)
    .where(ne(comps.source, 'manual'));

  const existingMap = new Map<string, number>();
  for (const row of existing) {
    existingMap.set(compKey(row.source, row.address, row.unitType), row.id);
  }

  const toInsert: NewComp[] = [];
  const toUpdate: { id: number; askingRent: string }[] = [];

  for (const comp of scraped) {
    const key = compKey(comp.source, comp.address ?? null, comp.unitType);
    const existingId = existingMap.get(key);

    if (existingId) {
      toUpdate.push({ id: existingId, askingRent: String(comp.askingRent) });
    } else {
      toInsert.push(comp);
    }
  }

  // Batch insert new comps
  if (toInsert.length > 0) {
    // Insert in chunks of 100 to avoid query size limits
    for (let i = 0; i < toInsert.length; i += 100) {
      await db.insert(comps).values(toInsert.slice(i, i + 100));
    }
  }

  // Update existing comps (mark active + refresh price + timestamp)
  for (const upd of toUpdate) {
    await db
      .update(comps)
      .set({ askingRent: upd.askingRent, isActive: true, scrapedAt: new Date() })
      .where(eq(comps.id, upd.id));
  }
}

/** Mark non-manual comps older than COMP_STALENESS_DAYS as inactive. */
export async function markStaleCompsInactive(): Promise<void> {
  const cutoff = subDays(new Date(), COMP_STALENESS_DAYS);
  await db
    .update(comps)
    .set({ isActive: false })
    .where(and(ne(comps.source, 'manual'), eq(comps.isActive, true)));

  // Re-activate comps scraped recently (within COMP_STALENESS_DAYS)
  await db
    .update(comps)
    .set({ isActive: true })
    .where(and(ne(comps.source, 'manual'), gte(comps.scrapedAt, cutoff)));
}

function compKey(
  source: string,
  address: string | null,
  unitType: string
): string {
  const addr = (address ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${source}::${addr}::${unitType}`;
}
