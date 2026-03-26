import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/src/lib/db/client';
import { importJobs, units, leases, rentHistory } from '@/src/lib/db/schema';
import { parseRentRoll } from '@/src/lib/parser/import';
import { IMPORT_STATUS } from '@/src/lib/constants';

export async function POST(
  _request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = Number(params.jobId);
  if (isNaN(jobId)) {
    return NextResponse.json({ error: 'Invalid jobId' }, { status: 400 });
  }

  // ── Load job ────────────────────────────────────────────────────────────
  const [job] = await db
    .select()
    .from(importJobs)
    .where(eq(importJobs.id, jobId))
    .limit(1);

  if (!job) {
    return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  }

  if (job.status === IMPORT_STATUS.PARSING || job.status === IMPORT_STATUS.DONE) {
    return NextResponse.json({ error: 'Job is already being processed or complete' }, { status: 409 });
  }

  // ── Mark as parsing ─────────────────────────────────────────────────────
  await db
    .update(importJobs)
    .set({ status: IMPORT_STATUS.PARSING })
    .where(eq(importJobs.id, jobId));

  try {
    // ── Fetch Excel from Blob ──────────────────────────────────────────────
    const response = await fetch(job.blobUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();

    // ── Parse ─────────────────────────────────────────────────────────────
    const result = parseRentRoll(buffer);

    // ── Upsert to DB ──────────────────────────────────────────────────────
    let rowsProcessed = 0;
    const dbWarnings: { unit: string; message: string }[] = result.warnings.map(w => ({
      unit: w.unit,
      message: w.message,
    }));

    for (const row of result.rows) {
      // ── units ────────────────────────────────────────────────────────
      await db
        .insert(units)
        .values({
          id: row.unitId,
          buildingCode: row.buildingCode,
          unitNumber: row.unitId,
          sqft: row.sqft ?? undefined,
          bedrooms: row.bedrooms ?? undefined,
          bathrooms: row.bathrooms != null ? String(row.bathrooms) : undefined,
          unitType: row.unitType ?? undefined,
        })
        .onConflictDoUpdate({
          target: units.id,
          set: {
            buildingCode: row.buildingCode,
            sqft: row.sqft ?? undefined,
            bedrooms: row.bedrooms ?? undefined,
            bathrooms: row.bathrooms != null ? String(row.bathrooms) : undefined,
            unitType: row.unitType ?? undefined,
          },
        });

      // ── leases ───────────────────────────────────────────────────────
      // Mark any existing current lease as not current before inserting new one
      if (row.leaseStart) {
        const existing = await db
          .select({ id: leases.id })
          .from(leases)
          .where(
            and(
              eq(leases.unitId, row.unitId),
              eq(leases.leaseStart, row.leaseStart)
            )
          )
          .limit(1);

        if (existing.length === 0) {
          // Archive previous current lease
          await db
            .update(leases)
            .set({ isCurrent: false })
            .where(and(eq(leases.unitId, row.unitId), eq(leases.isCurrent, true)));

          await db.insert(leases).values({
            unitId: row.unitId,
            tenantName: row.tenantName,
            leaseStart: row.leaseStart,
            leaseEnd: row.leaseEnd ?? undefined,
            currentRent: String(row.currentRent),
            rentEffectiveDate: row.rentEffectiveDate ?? row.leaseStart,
            isCurrent: true,
            sourceFileId: job.blobUrl,
            sourceFileLabel: job.filename,
            rowIndex: row.rawRowIndex,
          });
        } else {
          // Update the existing lease record
          await db
            .update(leases)
            .set({
              tenantName: row.tenantName,
              leaseEnd: row.leaseEnd ?? undefined,
              currentRent: String(row.currentRent),
              rentEffectiveDate: row.rentEffectiveDate ?? row.leaseStart,
              isCurrent: true,
              sourceFileId: job.blobUrl,
              sourceFileLabel: job.filename,
            })
            .where(eq(leases.id, existing[0].id));
        }
      }

      // ── rent_history ─────────────────────────────────────────────────
      const effectiveDate = row.rentEffectiveDate ?? row.leaseStart;
      if (effectiveDate) {
        const existingHistory = await db
          .select({ id: rentHistory.id, rentAmount: rentHistory.rentAmount })
          .from(rentHistory)
          .where(
            and(
              eq(rentHistory.unitId, row.unitId),
              eq(rentHistory.effectiveDate, effectiveDate)
            )
          )
          .limit(1);

        if (existingHistory.length === 0) {
          // Determine increase type by comparing to most recent prior entry
          const prior = await db
            .select({ rentAmount: rentHistory.rentAmount })
            .from(rentHistory)
            .where(eq(rentHistory.unitId, row.unitId))
            .orderBy(rentHistory.effectiveDate)
            .limit(1);

          let increaseType: string;
          if (prior.length === 0) {
            increaseType = 'initial';
          } else {
            const priorRent = parseFloat(prior[0].rentAmount);
            if (row.currentRent > priorRent) increaseType = 'increase';
            else if (row.currentRent < priorRent) increaseType = 'concession';
            else increaseType = 'initial'; // no change — treat as baseline
          }

          await db.insert(rentHistory).values({
            unitId: row.unitId,
            effectiveDate,
            rentAmount: String(row.currentRent),
            increaseType,
            sourceFileId: job.blobUrl,
          });
        }
      }

      rowsProcessed++;
    }

    // ── Update job status ──────────────────────────────────────────────
    await db
      .update(importJobs)
      .set({
        status: result.skippedCount > 0 && rowsProcessed === 0
          ? IMPORT_STATUS.FAILED
          : result.skippedCount > 0
          ? IMPORT_STATUS.PARTIAL
          : IMPORT_STATUS.DONE,
        rowsProcessed,
        rowsSkipped: result.skippedCount,
        warnings: dbWarnings,
        completedAt: new Date(),
      })
      .where(eq(importJobs.id, jobId));

    return NextResponse.json({
      status: IMPORT_STATUS.DONE,
      rowsProcessed,
      rowsSkipped: result.skippedCount,
      detectedColumns: result.detectedColumns,
      warnings: dbWarnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await db
      .update(importJobs)
      .set({ status: IMPORT_STATUS.FAILED, completedAt: new Date() })
      .where(eq(importJobs.id, jobId));

    console.error('[import/parse] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
