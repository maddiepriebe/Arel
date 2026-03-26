import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { put } from '@vercel/blob';
import { db } from '@/src/lib/db/client';
import { importJobs } from '@/src/lib/db/schema';
import { MAX_UPLOAD_BYTES, IMPORT_STATUS } from '@/src/lib/constants';

const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                           // .xls
  'application/octet-stream',                                            // generic binary
]);

const ALLOWED_EXTENSIONS = /\.(xlsx|xls)$/i;

export async function POST(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse multipart form ────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file provided (field name: "file")' }, { status: 400 });
  }

  const filename = file instanceof File ? file.name : 'rent-roll.xlsx';

  if (!ALLOWED_EXTENSIONS.test(filename)) {
    return NextResponse.json(
      { error: 'Only .xlsx and .xls files are accepted' },
      { status: 415 }
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File exceeds maximum size of ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` },
      { status: 413 }
    );
  }

  // ── Upload to Vercel Blob ───────────────────────────────────────────────
  const blob = await put(
    `rent-rolls/${Date.now()}-${filename}`,
    file.stream(),
    {
      access: 'public',
      contentType:
        file.type && ALLOWED_MIME_TYPES.has(file.type)
          ? file.type
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
  );

  // ── Create import_job record ────────────────────────────────────────────
  const [job] = await db
    .insert(importJobs)
    .values({
      blobUrl: blob.url,
      filename,
      status: IMPORT_STATUS.PENDING,
      uploadedBy: userId,
    })
    .returning({ id: importJobs.id });

  return NextResponse.json({ jobId: job.id, blobUrl: blob.url }, { status: 201 });
}
