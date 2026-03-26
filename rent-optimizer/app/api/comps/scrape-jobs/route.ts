import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { desc } from 'drizzle-orm';
import { db } from '@/src/lib/db/client';
import { compScrapeJobs } from '@/src/lib/db/schema';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const jobs = await db
    .select()
    .from(compScrapeJobs)
    .orderBy(desc(compScrapeJobs.createdAt))
    .limit(10);

  return NextResponse.json({ jobs });
}
