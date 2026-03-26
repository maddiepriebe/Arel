import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/src/lib/db/client';
import { importJobs } from '@/src/lib/db/schema';

export async function GET(
  _request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = Number(params.jobId);
  if (isNaN(jobId)) {
    return NextResponse.json({ error: 'Invalid jobId' }, { status: 400 });
  }

  const [job] = await db
    .select()
    .from(importJobs)
    .where(eq(importJobs.id, jobId))
    .limit(1);

  if (!job) {
    return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    filename: job.filename,
    rowsProcessed: job.rowsProcessed,
    rowsSkipped: job.rowsSkipped,
    warnings: job.warnings,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  });
}
