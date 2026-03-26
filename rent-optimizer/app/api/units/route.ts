import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/src/lib/db/client';
import { units, leases, rentHistory, cpiRates } from '@/src/lib/db/schema';
import { checkEligibility } from '@/src/lib/core/eligibility';
import { computeBankingState } from '@/src/lib/core/banking';
import { MOCO } from '@/src/lib/constants';
import type { RentHistoryRow, CpiRateRow } from '@/src/lib/core/types';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;

  // ── Pagination ────────────────────────────────────────────────────────────
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE))
  );
  const offset = (page - 1) * pageSize;

  // ── Filters ───────────────────────────────────────────────────────────────
  const filterEligible = searchParams.get('eligible');     // 'true' | 'false'
  const filterBuilding = searchParams.get('building');     // e.g. 'A'
  const filterUnitType = searchParams.get('unitType');     // e.g. '2BR'
  const filterOverdue  = searchParams.get('overdue');      // 'true'
  const sortBy         = searchParams.get('sortBy') ?? 'unitId'; // unitId | noticeDeadline | currentRent | maxAllowablePct

  const asOfDate = new Date();

  // ── Fetch all data needed for computation ─────────────────────────────────
  // One query each — not N+1
  const [allUnits, allCurrentLeases, allHistory, allCpiRates] = await Promise.all([
    db.select().from(units),
    db.select().from(leases).where(eq(leases.isCurrent, true)),
    db.select().from(rentHistory),
    db.select().from(cpiRates),
  ]);

  // Index by unit id
  const leaseByUnit = new Map(allCurrentLeases.map(l => [l.unitId, l]));
  const historyByUnit = new Map<string, RentHistoryRow[]>();
  for (const row of allHistory) {
    if (!row.unitId) continue;
    const arr = historyByUnit.get(row.unitId) ?? [];
    arr.push({
      effectiveDate: row.effectiveDate,
      increaseType: row.increaseType,
      increasePct: row.increasePct,
    });
    historyByUnit.set(row.unitId, arr);
  }

  const cpiRows: CpiRateRow[] = allCpiRates.map(r => ({
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    capPct: r.capPct,
    cpiRate: r.cpiRate,
  }));

  // ── Compute per-unit data ─────────────────────────────────────────────────
  type UnitRow = {
    unitId: string;
    buildingCode: string | null;
    unitNumber: string;
    unitType: string | null;
    sqft: number | null;
    bedrooms: number | null;
    isExempt: boolean | null;
    currentRent: number | null;
    tenantName: string | null;
    leaseStart: string | null;
    leaseEnd: string | null;
    isEligible: boolean;
    daysUntilEligible: number;
    noticeDeadline: string;
    earliestEligibleDate: string;
    noticeOverdue: boolean;
    monthsSinceLastIncrease: number;
    cumulativeBanked: number;
    maxAllowablePct: number;
    maxAllowableRent: number | null;
    complianceViolation: boolean;
  };

  const computed: UnitRow[] = allUnits.map(unit => {
    const lease = leaseByUnit.get(unit.id);
    const history = historyByUnit.get(unit.id) ?? [];
    const banking = computeBankingState(history, cpiRows, asOfDate);
    const eligibility = checkEligibility(history, asOfDate);

    const currentRent = lease ? parseFloat(lease.currentRent) : null;

    // Max allowable = most recent period's CPI cap + banked
    const latestCap = allCpiRates.length > 0
      ? Math.min(
          parseFloat(
            allCpiRates
              .slice()
              .sort((a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime())[0]
              .capPct
          ),
          MOCO.ABSOLUTE_CAP
        )
      : MOCO.ABSOLUTE_CAP;

    const maxAllowablePct = Math.min(
      latestCap + banking.cumulativeBanked,
      latestCap + MOCO.MAX_BANKING_CUMULATIVE
    );

    const maxAllowableRent = currentRent
      ? Math.round(currentRent * (1 + maxAllowablePct) * 100) / 100
      : null;

    return {
      unitId: unit.id,
      buildingCode: unit.buildingCode,
      unitNumber: unit.unitNumber,
      unitType: unit.unitType,
      sqft: unit.sqft,
      bedrooms: unit.bedrooms,
      isExempt: unit.isExempt,
      currentRent,
      tenantName: lease?.tenantName ?? null,
      leaseStart: lease?.leaseStart ?? null,
      leaseEnd: lease?.leaseEnd ?? null,
      isEligible: eligibility.isEligible,
      daysUntilEligible: eligibility.daysUntilEligible,
      noticeDeadline: eligibility.noticeDeadline.toISOString().split('T')[0],
      earliestEligibleDate: eligibility.earliestEligibleDate.toISOString().split('T')[0],
      noticeOverdue: eligibility.noticeOverdue,
      monthsSinceLastIncrease: eligibility.monthsSinceLastIncrease,
      cumulativeBanked: banking.cumulativeBanked,
      maxAllowablePct,
      maxAllowableRent,
      complianceViolation: banking.complianceViolation,
    };
  });

  // ── Apply filters ─────────────────────────────────────────────────────────
  let filtered = computed;

  if (filterBuilding) {
    filtered = filtered.filter(u =>
      u.buildingCode?.toLowerCase() === filterBuilding.toLowerCase()
    );
  }
  if (filterUnitType) {
    filtered = filtered.filter(u =>
      u.unitType?.toLowerCase() === filterUnitType.toLowerCase()
    );
  }
  if (filterEligible === 'true') {
    filtered = filtered.filter(u => u.isEligible);
  } else if (filterEligible === 'false') {
    filtered = filtered.filter(u => !u.isEligible);
  }
  if (filterOverdue === 'true') {
    filtered = filtered.filter(u => u.noticeOverdue);
  }

  // ── Sort ──────────────────────────────────────────────────────────────────
  const sortFn: Record<string, (a: UnitRow, b: UnitRow) => number> = {
    unitId: (a, b) => a.unitId.localeCompare(b.unitId),
    noticeDeadline: (a, b) => a.noticeDeadline.localeCompare(b.noticeDeadline),
    currentRent: (a, b) => (a.currentRent ?? 0) - (b.currentRent ?? 0),
    maxAllowablePct: (a, b) => b.maxAllowablePct - a.maxAllowablePct,
    daysUntilEligible: (a, b) => a.daysUntilEligible - b.daysUntilEligible,
  };
  filtered.sort(sortFn[sortBy] ?? sortFn.unitId);

  // ── Paginate ──────────────────────────────────────────────────────────────
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const paginated = filtered.slice(offset, offset + pageSize);

  return NextResponse.json({
    units: paginated,
    pagination: { page, pageSize, total, totalPages },
  });
}
