import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, asc } from 'drizzle-orm';
import { db } from '@/src/lib/db/client';
import { units, rentHistory, cpiRates } from '@/src/lib/db/schema';
import { computeBankingState } from '@/src/lib/core/banking';
import type { RentHistoryRow, CpiRateRow } from '@/src/lib/core/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: { unitId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const unitId = decodeURIComponent(params.unitId);

  const [unit, history, allCpiRates] = await Promise.all([
    db.select().from(units).where(eq(units.id, unitId)).limit(1),
    db.select().from(rentHistory)
      .where(eq(rentHistory.unitId, unitId))
      .orderBy(asc(rentHistory.effectiveDate)),
    db.select().from(cpiRates).orderBy(asc(cpiRates.periodStart)),
  ]);

  if (!unit[0]) {
    return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
  }

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
  const banking = computeBankingState(historyRows, cpiRows, asOfDate);

  const periods = banking.periods.map(p => ({
    periodStart: p.periodStart.toISOString().split('T')[0],
    periodEnd: p.periodEnd.toISOString().split('T')[0],
    allowablePct: p.allowablePct,
    usedPct: p.usedPct,
    bankedThisPeriod: p.bankedThisPeriod,
    cumulativeBanked: p.cumulativeBanked,
  }));

  return NextResponse.json({
    unitId,
    cumulativeBanked: banking.cumulativeBanked,
    hitCeiling: banking.hitCeiling,
    complianceViolation: banking.complianceViolation,
    periods,
    computedAt: asOfDate.toISOString(),
  });
}
