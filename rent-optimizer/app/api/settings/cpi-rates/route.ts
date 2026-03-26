import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { asc } from 'drizzle-orm';
import { db } from '@/src/lib/db/client';
import { cpiRates } from '@/src/lib/db/schema';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rates = await db
    .select()
    .from(cpiRates)
    .orderBy(asc(cpiRates.periodStart));

  return NextResponse.json(rates);
}
