import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/src/lib/db/client';
import { policySettings } from '@/src/lib/db/schema';

/** Ensure at least one row exists; return it. */
async function getOrCreateSettings() {
  const rows = await db.select().from(policySettings).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(policySettings).values({}).returning();
  return created;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const settings = await getOrCreateSettings();
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const settings = await getOrCreateSettings();

  // Build a type-safe patch by only including explicitly known fields
  interface SettingsPatch {
    maxConcessionMonths?: string | null;
    targetOccupancyPct?: string | null;
    compRadiusMiles?: string | null;
    compRefreshIntervalDays?: number | null;
    landlordName?: string | null;
    propertyAddress?: string | null;
    updatedAt?: Date;
    updatedBy?: string;
  }

  const patch: SettingsPatch = {};
  if ('maxConcessionMonths' in body)   patch.maxConcessionMonths   = body.maxConcessionMonths   != null ? String(body.maxConcessionMonths)   : null;
  if ('targetOccupancyPct' in body)    patch.targetOccupancyPct    = body.targetOccupancyPct    != null ? String(body.targetOccupancyPct)    : null;
  if ('compRadiusMiles' in body)       patch.compRadiusMiles       = body.compRadiusMiles       != null ? String(body.compRadiusMiles)       : null;
  if ('compRefreshIntervalDays' in body) patch.compRefreshIntervalDays = body.compRefreshIntervalDays != null ? Number(body.compRefreshIntervalDays) : null;
  if ('landlordName' in body)          patch.landlordName          = body.landlordName          != null ? String(body.landlordName)          : null;
  if ('propertyAddress' in body)       patch.propertyAddress       = body.propertyAddress       != null ? String(body.propertyAddress)       : null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
  }

  const [updated] = await db
    .update(policySettings)
    .set({ ...patch, updatedAt: new Date(), updatedBy: userId })
    .where(eq(policySettings.id, settings.id))
    .returning();

  return NextResponse.json(updated);
}
