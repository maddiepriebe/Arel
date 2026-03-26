import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, asc } from 'drizzle-orm';
import { db } from '@/src/lib/db/client';
import { units, leases, rentHistory, cpiRates, comps, policySettings } from '@/src/lib/db/schema';
import { checkEligibility } from '@/src/lib/core/eligibility';
import { computeBankingState } from '@/src/lib/core/banking';
import { optimizeUnit, buildCompRange } from '@/src/lib/core/optimizer';
import { MOCO } from '@/src/lib/constants';
import type { RentHistoryRow, CpiRateRow } from '@/src/lib/core/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: { unitId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const unitId = decodeURIComponent(params.unitId);

  const [unit, currentLeaseRows, history, allCpiRates, allSettings] = await Promise.all([
    db.select().from(units).where(eq(units.id, unitId)).limit(1),
    db.select().from(leases)
      .where(eq(leases.unitId, unitId) && eq(leases.isCurrent, true))
      .limit(1),
    db.select().from(rentHistory)
      .where(eq(rentHistory.unitId, unitId))
      .orderBy(asc(rentHistory.effectiveDate)),
    db.select().from(cpiRates).orderBy(asc(cpiRates.periodStart)),
    db.select().from(policySettings).limit(1),
  ]);

  if (!unit[0]) {
    return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
  }

  const currentLease = currentLeaseRows[0] ?? null;
  if (!currentLease) {
    return NextResponse.json(
      { error: 'No current lease found — cannot run optimizer without a current rent' },
      { status: 422 }
    );
  }

  const currentRent = parseFloat(currentLease.currentRent);

  const historyRows: RentHistoryRow[] = history.map(r => ({
    effectiveDate: r.effectiveDate,
    increaseType: r.increaseType,
    increasePct: r.increasePct,
  }));

  const cpiRows: CpiRateRow[] = allCpiRates.map(r => ({
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    capPct: r.capPct,
    cpiRate: r.cpiRate,
  }));

  const asOfDate = new Date();
  const eligibility = checkEligibility(historyRows, asOfDate);
  const banking = computeBankingState(historyRows, cpiRows, asOfDate);

  const latestCpiCap = allCpiRates.length > 0
    ? parseFloat(allCpiRates[allCpiRates.length - 1].capPct)
    : MOCO.ABSOLUTE_CAP;

  const maxAllowablePct = Math.min(
    latestCpiCap + banking.cumulativeBanked,
    latestCpiCap + MOCO.MAX_BANKING_CUMULATIVE
  );

  // Comps filtered by unit type
  const matchingComps = await db
    .select()
    .from(comps)
    .where(eq(comps.isActive, true) && eq(comps.unitType, unit[0].unitType ?? ''));

  const effectiveRents = matchingComps.map(c =>
    c.effectiveRent ? parseFloat(c.effectiveRent) : parseFloat(c.askingRent)
  );
  const compRange = buildCompRange(effectiveRents);

  const policy = allSettings[0]
    ? {
        maxConcessionMonths: parseFloat(allSettings[0].maxConcessionMonths ?? '1.5'),
        targetOccupancyPct: parseFloat(allSettings[0].targetOccupancyPct ?? '0.95'),
      }
    : { maxConcessionMonths: 1.5, targetOccupancyPct: 0.95 };

  const result = optimizeUnit({
    currentRent,
    maxAllowablePct,
    bankingState: banking,
    compRange,
    policy,
    asOfDate,
  });

  return NextResponse.json({
    unitId,
    currentRent,
    maxAllowablePct,
    maxAllowableRent: Math.round(currentRent * (1 + maxAllowablePct) * 100) / 100,
    isEligible: eligibility.isEligible,
    daysUntilEligible: eligibility.daysUntilEligible,
    cumulativeBanked: banking.cumulativeBanked,
    ...result,
  });
}
