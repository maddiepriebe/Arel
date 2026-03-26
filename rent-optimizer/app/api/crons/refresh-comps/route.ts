/**
 * Vercel Cron — Weekly comp refresh.
 * Runs every Monday at 06:00 UTC (configured in vercel.json).
 *
 * Vercel sets the Authorization: Bearer <CRON_SECRET> header automatically
 * in production. We verify it to prevent unauthorised triggering.
 *
 * Manual triggering from /api/comps/refresh shares the same upsertComps /
 * markStaleCompsInactive helpers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq, ne } from 'drizzle-orm';
import { db } from '@/src/lib/db/client';
import { comps, compScrapeJobs, policySettings } from '@/src/lib/db/schema';
import { runFullScrape } from '@/src/lib/comps/scraper';
import { upsertComps, markStaleCompsInactive } from '@/app/api/comps/refresh/route';
import { SCRAPE_STATUS } from '@/src/lib/constants';

export async function GET(request: NextRequest) {
  // ── Verify cron secret ────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Guard against concurrent cron runs ────────────────────────────────────
  const running = await db
    .select({ id: compScrapeJobs.id })
    .from(compScrapeJobs)
    .where(eq(compScrapeJobs.status, SCRAPE_STATUS.RUNNING))
    .limit(1);

  if (running.length > 0) {
    console.log('[cron/refresh-comps] Scrape already running — skipping');
    return NextResponse.json({ skipped: true, reason: 'already_running' });
  }

  // ── Create job record ──────────────────────────────────────────────────────
  const [job] = await db
    .insert(compScrapeJobs)
    .values({
      status: SCRAPE_STATUS.RUNNING,
      triggeredBy: 'cron',
      startedAt: new Date(),
    })
    .returning({ id: compScrapeJobs.id });

  console.log(`[cron/refresh-comps] Starting scrape job ${job.id}`);

  try {
    // ── Load policy settings ─────────────────────────────────────────────────
    const settingsRows = await db.select().from(policySettings).limit(1);
    const radiusMiles = settingsRows[0]
      ? parseFloat(settingsRows[0].compRadiusMiles ?? '3.0')
      : 3.0;

    // ── Run scrape ───────────────────────────────────────────────────────────
    const result = await runFullScrape(radiusMiles);

    // ── Upsert + expire stale comps ──────────────────────────────────────────
    await upsertComps(result.comps);
    await markStaleCompsInactive();

    // ── Mark manual comps that have expired as inactive ──────────────────────
    // Manual comps expire 90 days after creation (handled by scrapedAt field reuse)
    // We don't auto-expire manual comps here — they're managed via the admin UI.

    // ── Finalise job ─────────────────────────────────────────────────────────
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

    console.log(
      `[cron/refresh-comps] Job ${job.id} ${finalStatus}: ${result.totalFetched} comps, ${result.errors.length} errors`
    );

    return NextResponse.json({
      jobId: job.id,
      status: finalStatus,
      resultCount: result.totalFetched,
      errorCount: result.errors.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await db
      .update(compScrapeJobs)
      .set({ status: SCRAPE_STATUS.FAILED, errorMessage: message, completedAt: new Date() })
      .where(eq(compScrapeJobs.id, job.id));

    console.error(`[cron/refresh-comps] Job ${job.id} failed:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
