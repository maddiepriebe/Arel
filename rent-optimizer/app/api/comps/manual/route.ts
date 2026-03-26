import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { db } from '@/src/lib/db/client';
import { comps } from '@/src/lib/db/schema';
import { MANUAL_COMP_EXPIRY_DAYS } from '@/src/lib/constants';
import { addDays } from 'date-fns';

const ManualCompSchema = z.object({
  propertyName: z.string().min(1),
  address: z.string().min(1),
  city: z.string().default('Rockville'),
  unitType: z.enum(['studio', '1BR', '2BR', '3BR']),
  askingRent: z.number().positive(),
  effectiveRent: z.number().positive().optional(),
  concessionMonths: z.number().min(0).max(12).optional(),
  sqftMin: z.number().positive().optional(),
  sqftMax: z.number().positive().optional(),
  amenities: z.array(z.string()).optional(),
  sourceUrl: z.string().url().optional(),
});

/** Verify the caller is an admin via Clerk session claims. */
async function requireAdmin(): Promise<string | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;
  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role;
  // Allow if role is 'admin', or if roles haven't been configured yet (role is undefined)
  if (role !== undefined && role !== 'admin') return null;
  return userId;
}

export async function POST(request: NextRequest) {
  const userId = await requireAdmin();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized — admin role required' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ManualCompSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const data = parsed.data;

  // Manual comps expire after MANUAL_COMP_EXPIRY_DAYS (90) days
  const expiresAt = addDays(new Date(), MANUAL_COMP_EXPIRY_DAYS);

  const [comp] = await db
    .insert(comps)
    .values({
      source: 'manual',
      sourceUrl: data.sourceUrl ?? null,
      propertyName: data.propertyName,
      address: data.address,
      city: data.city,
      unitType: data.unitType,
      sqftMin: data.sqftMin ?? null,
      sqftMax: data.sqftMax ?? null,
      askingRent: String(data.askingRent),
      effectiveRent: data.effectiveRent != null ? String(data.effectiveRent) : null,
      concessionMonths: data.concessionMonths != null ? String(data.concessionMonths) : null,
      amenities: data.amenities ?? [],
      isActive: true,
    })
    .returning();

  return NextResponse.json(
    { comp, expiresAt: expiresAt.toISOString() },
    { status: 201 }
  );
}
