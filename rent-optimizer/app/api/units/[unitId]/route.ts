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

  // ── Fetch all related data in parallel ────────────────────────────────────
  const [unit, allLeases, history, allCpiRates, unitComps, settings] = await Promise.all([
    db.select().from(units).where(eq(units.id, unitId)).limit(1),
    db.select().from(leases).where(eq(leases.unitId, unitId)).orderBy(asc(leases.leaseStart)),
    db.select().from(rentHistory).where(eq(rentHistory.unitId, unitId)).orderBy(asc(rentHistory.effectiveDate)),
    db.select().from(cpiRates).orderBy(asc(cpiRates.periodStart)),
    db.select().from(comps).where(eq(comps.isActive, true)),
    db.select().from(policySettings).limit(1),
  ]);

  if (!unit[0]) {
    return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
  }

  const currentLease = allLeases.find(l => l.isCurrent) ?? allLeases.at(-1) ?? null;
  const asOfDate = new Date();

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

  // ── Eligibility ───────────────────────────────────────────────────────────
  const eligibility = checkEligibility(historyRows, asOfDate);

  // ── Banking ───────────────────────────────────────────────────────────────
  const banking = computeBankingState(historyRows, cpiRows, asOfDate);

  // ── Max allowable ─────────────────────────────────────────────────────────
  const latestCpiCap = allCpiRates.length > 0
    ? parseFloat(allCpiRates[allCpiRates.length - 1].capPct)
    : MOCO.ABSOLUTE_CAP;

  const maxAllowablePct = Math.min(
    latestCpiCap + banking.cumulativeBanked,
    latestCpiCap + MOCO.MAX_BANKING_CUMULATIVE
  );

  const currentRent = currentLease ? parseFloat(currentLease.currentRent) : null;

  // ── Comps (filtered by unit type) ─────────────────────────────────────────
  const matchingComps = unitComps.filter(c => c.unitType === unit[0].unitType);
  const effectiveRents = matchingComps.map(c =>
    c.effectiveRent ? parseFloat(c.effectiveRent) : parseFloat(c.askingRent)
  );
  const compRange = buildCompRange(effectiveRents);

  // ── Policy settings ───────────────────────────────────────────────────────
  const policy = settings[0]
    ? {
        maxConcessionMonths: parseFloat(settings[0].maxConcessionMonths ?? '1.5'),
        targetOccupancyPct: parseFloat(settings[0].targetOccupancyPct ?? '0.95'),
      }
    : { maxConcessionMonths: 1.5, targetOccupancyPct: 0.95 };

  // ── Optimization (only if unit is eligible and has current rent) ──────────
  const optimization =
    eligibility.isEligible && currentRent !== null
      ? optimizeUnit({
          currentRent,
          maxAllowablePct,
          bankingState: banking,
          compRange,
          policy,
          asOfDate,
        })
      : null;

  // ── Serialize banking periods (Date → ISO string) ─────────────────────────
  const bankingPeriods = banking.periods.map(p => ({
    periodStart: p.periodStart.toISOString().split('T')[0],
    periodEnd: p.periodEnd.toISOString().split('T')[0],
    allowablePct: p.allowablePct,
    usedPct: p.usedPct,
    bankedThisPeriod: p.bankedThisPeriod,
    cumulativeBanked: p.cumulativeBanked,
  }));

  return NextResponse.json({
    unit: unit[0],
    currentLease,
    allLeases,
    rentHistory: history,
    eligibility: {
      isEligible: eligibility.isEligible,
      monthsSinceLastIncrease: eligibility.monthsSinceLastIncrease,
      lastIncreaseDate: eligibility.lastIncreaseDate?.toISOString().split('T')[0] ?? null,
      earliestEligibleDate: eligibility.earliestEligibleDate.toISOString().split('T')[0],
      noticeDeadline: eligibility.noticeDeadline.toISOString().split('T')[0],
      daysUntilEligible: eligibility.daysUntilEligible,
      noticeOverdue: eligibility.noticeOverdue,
    },
    banking: {
      cumulativeBanked: banking.cumulativeBanked,
      hitCeiling: banking.hitCeiling,
      complianceViolation: banking.complianceViolation,
      periods: bankingPeriods,
    },
    maxAllowablePct,
    maxAllowableRent: currentRent
      ? Math.round(currentRent * (1 + maxAllowablePct) * 100) / 100
      : null,
    compRange,
    optimization,
  });
}
