import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/src/lib/db/client';
import { units, leases, policySettings } from '@/src/lib/db/schema';
import { generateNotice } from '@/src/lib/reports/noticeTemplate';
import { MOCO } from '@/src/lib/constants';
import { addDays } from 'date-fns';

function toISODate(d: Date) {
  return d.toISOString().split('T')[0];
}

export async function GET(
  request: NextRequest,
  { params }: { params: { unitId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const unitId = decodeURIComponent(params.unitId);
  const { searchParams } = request.nextUrl;

  // ── Fetch unit + lease + settings ─────────────────────────────────────────
  const [unit, currentLeaseRows, allSettings] = await Promise.all([
    db.select().from(units).where(eq(units.id, unitId)).limit(1),
    db.select().from(leases)
      .where(eq(leases.unitId, unitId) && eq(leases.isCurrent, true))
      .limit(1),
    db.select().from(policySettings).limit(1),
  ]);

  if (!unit[0]) {
    return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
  }

  const currentLease = currentLeaseRows[0] ?? null;
  if (!currentLease) {
    return NextResponse.json(
      { error: 'No current lease found' },
      { status: 422 }
    );
  }

  const currentRent = parseFloat(currentLease.currentRent);

  // ── Resolve params ─────────────────────────────────────────────────────────
  const proposedRentParam = searchParams.get('proposedRent');
  const effectiveDateParam = searchParams.get('effectiveDate');

  const proposedRent = proposedRentParam
    ? parseFloat(proposedRentParam)
    : Math.round(currentRent * 1.03 * 100) / 100; // default: 3% increase

  if (isNaN(proposedRent) || proposedRent <= 0) {
    return NextResponse.json({ error: 'Invalid proposedRent parameter' }, { status: 400 });
  }

  // Default effective date: today + 91 days (safely exceeds 90-day requirement)
  const effectiveDate = effectiveDateParam
    ?? toISODate(addDays(new Date(), MOCO.NOTICE_DAYS + 1));

  // Validate that effective date is at least 90 days from today
  const today = new Date();
  const effectiveDateObj = new Date(effectiveDate + 'T00:00:00');
  const daysUntilEffective = Math.ceil(
    (effectiveDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  const warnings: string[] = [];
  if (daysUntilEffective < MOCO.NOTICE_DAYS) {
    warnings.push(
      `Effective date is only ${daysUntilEffective} days from today — MoCo requires at least ${MOCO.NOTICE_DAYS} days notice`
    );
  }

  const settings = allSettings[0];
  const landlordName = settings?.landlordName || 'Property Management';
  const propertyAddress = settings?.propertyAddress || unit[0].buildingCode || unitId;

  const noticeText = generateNotice({
    landlordName,
    propertyAddress,
    unitId,
    tenantName: currentLease.tenantName,
    currentRent,
    proposedRent,
    effectiveDate,
    noticeDate: toISODate(today),
  });

  // ── Return JSON or plain text depending on Accept header ──────────────────
  const acceptHeader = request.headers.get('accept') ?? '';
  if (acceptHeader.includes('text/plain')) {
    return new NextResponse(noticeText, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="notice-${unitId}-${effectiveDate}.txt"`,
      },
    });
  }

  return NextResponse.json({
    unitId,
    tenantName: currentLease.tenantName,
    currentRent,
    proposedRent,
    effectiveDate,
    noticeDate: toISODate(today),
    daysUntilEffective,
    noticeText,
    warnings,
  });
}
