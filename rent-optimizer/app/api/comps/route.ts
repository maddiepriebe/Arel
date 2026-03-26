import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/src/lib/db/client';
import { comps } from '@/src/lib/db/schema';
import { buildCompRange } from '@/src/lib/core/optimizer';
import { UNIT_TYPES } from '@/src/lib/constants';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const filterUnitType = searchParams.get('unitType');

  // Fetch active comps, optionally filtered by unit type
  const conditions = filterUnitType
    ? and(eq(comps.isActive, true), eq(comps.unitType, filterUnitType))
    : eq(comps.isActive, true);

  const rows = await db
    .select()
    .from(comps)
    .where(conditions)
    .orderBy(desc(comps.scrapedAt));

  if (filterUnitType) {
    // Single unit type — return flat list + range stats
    const effectiveRents = rows.map(c =>
      c.effectiveRent ? parseFloat(c.effectiveRent) : parseFloat(c.askingRent)
    );
    const range = buildCompRange(effectiveRents);

    return NextResponse.json({
      unitType: filterUnitType,
      comps: rows,
      range,
      count: rows.length,
    });
  }

  // Group by unit type, with stats per group
  const grouped: Record<
    string,
    { comps: typeof rows; range: ReturnType<typeof buildCompRange>; count: number }
  > = {};

  for (const unitType of UNIT_TYPES) {
    const group = rows.filter(c => c.unitType === unitType);
    const effectiveRents = group.map(c =>
      c.effectiveRent ? parseFloat(c.effectiveRent) : parseFloat(c.askingRent)
    );
    grouped[unitType] = {
      comps: group,
      range: buildCompRange(effectiveRents),
      count: group.length,
    };
  }

  // Also include any unit types not in the canonical list (e.g. "4BR")
  const extraTypes = [...new Set(rows.map(c => c.unitType))].filter(
    t => !UNIT_TYPES.includes(t as typeof UNIT_TYPES[number])
  );
  for (const unitType of extraTypes) {
    const group = rows.filter(c => c.unitType === unitType);
    const effectiveRents = group.map(c =>
      c.effectiveRent ? parseFloat(c.effectiveRent) : parseFloat(c.askingRent)
    );
    grouped[unitType] = {
      comps: group,
      range: buildCompRange(effectiveRents),
      count: group.length,
    };
  }

  return NextResponse.json({ grouped, totalActive: rows.length });
}
