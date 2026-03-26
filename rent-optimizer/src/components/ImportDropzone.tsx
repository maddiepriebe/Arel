'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/src/components/ui/Button';
import { Spinner } from '@/src/components/ui/Spinner';
import { Badge } from '@/src/components/ui/Badge';
import { cn } from '@/src/lib/utils';

type ImportStage = 'idle' | 'uploading' | 'parsing' | 'done' | 'failed';

interface Warning { unit: string; message: string; }

interface ImportResult {
  jobId: number;
  rowsProcessed: number;
  rowsSkipped: number;
  warnings: Warning[];
  detectedColumns: Record<string, number>;
}

export function ImportDropzone() {
  const [stage, setStage] = useState<ImportStage>('idle');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_BYTES = 10 * 1024 * 1024;

  async function processFile(file: File) {
    setError(null);
    setResult(null);

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError('Only .xlsx and .xls files are accepted.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('File exceeds 10 MB limit.');
      return;
    }

    // ── Upload ────────────────────────────────────────────────────────────
    setStage('uploading');
    const form = new FormData();
    form.append('file', file);

    const uploadRes = await fetch('/api/import/upload', { method: 'POST', body: form });
    if (!uploadRes.ok) {
      const msg = (await uploadRes.json()).error ?? 'Upload failed';
      setError(msg); setStage('failed'); return;
    }
    const { jobId } = await uploadRes.json();

    // ── Parse ─────────────────────────────────────────────────────────────
    setStage('parsing');
    const parseRes = await fetch(`/api/import/${jobId}/parse`, { method: 'POST' });
    if (!parseRes.ok) {
      const msg = (await parseRes.json()).error ?? 'Parse failed';
      setError(msg); setStage('failed'); return;
    }

    // ── Poll until done ───────────────────────────────────────────────────
    let done = false;
    while (!done) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(`/api/import/${jobId}/status`);
      const status = await statusRes.json();
      if (status.status === 'done' || status.status === 'partial') {
        setResult({
          jobId,
          rowsProcessed: status.rowsProcessed ?? 0,
          rowsSkipped: status.rowsSkipped ?? 0,
          warnings: status.warnings ?? [],
          detectedColumns: {},
        });
        setStage('done');
        done = true;
      } else if (status.status === 'failed') {
        setError('Import failed. Check warnings below.');
        setStage('failed');
        done = true;
      }
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const STAGE_LABELS: Record<ImportStage, string> = {
    idle: '',
    uploading: 'Uploading…',
    parsing: 'Parsing…',
    done: 'Complete',
    failed: 'Failed',
  };

  const STAGES: ImportStage[] = ['uploading', 'parsing', 'done'];

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => stage === 'idle' && fileInputRef.current?.click()}
        className={cn(
          'relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 transition-colors cursor-pointer',
          dragging
            ? 'border-blue-500 bg-blue-50'
            : stage === 'idle' || stage === 'failed'
              ? 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              : 'border-gray-200 bg-gray-50 cursor-default'
        )}
      >
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={onFileChange} className="hidden" />

        {stage === 'idle' && (
          <>
            <span className="text-4xl">📤</span>
            <p className="text-sm font-medium text-gray-700">Drag & drop your rent roll here</p>
            <p className="text-xs text-gray-400">.xlsx or .xls · max 10 MB</p>
          </>
        )}

        {(stage === 'uploading' || stage === 'parsing') && (
          <div className="flex flex-col items-center gap-3">
            <Spinner className="h-8 w-8" />
            <p className="text-sm text-gray-600">{STAGE_LABELS[stage]}</p>
          </div>
        )}

        {stage === 'done' && result && (
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="text-4xl">✅</span>
            <p className="text-sm font-semibold text-green-700">Import complete</p>
            <p className="text-xs text-gray-500">
              {result.rowsProcessed} rows imported · {result.rowsSkipped} skipped
            </p>
          </div>
        )}

        {stage === 'failed' && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-4xl">❌</span>
            <p className="text-sm font-semibold text-red-700">{error ?? 'Import failed'}</p>
          </div>
        )}
      </div>

      {/* Progress stepper */}
      {stage !== 'idle' && (
        <div className="flex items-center gap-2">
          {STAGES.map((s, i) => {
            const stageIdx = STAGES.indexOf(stage === 'failed' ? 'done' : stage);
            const done = i < stageIdx || (stage === 'done' && s === 'done');
            const active = i === stageIdx && stage !== 'failed';
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                  done ? 'bg-green-500 text-white'
                    : active ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-400'
                )}>
                  {done ? '✓' : i + 1}
                </div>
                <span className={cn('text-xs capitalize', active ? 'text-blue-600 font-medium' : done ? 'text-green-600' : 'text-gray-400')}>
                  {s}
                </span>
                {i < STAGES.length - 1 && <div className={cn('h-px flex-1 w-8', done ? 'bg-green-300' : 'bg-gray-200')} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Errors */}
      {error && stage === 'failed' && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Warnings */}
      {result && result.warnings.length > 0 && (
        <div className="border border-amber-200 rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 text-sm font-medium text-amber-800"
            onClick={() => setWarningsOpen(o => !o)}
          >
            <span>⚠ {result.warnings.length} warning{result.warnings.length !== 1 ? 's' : ''}</span>
            <span>{warningsOpen ? '▲' : '▼'}</span>
          </button>
          {warningsOpen && (
            <ul className="divide-y divide-amber-100 max-h-60 overflow-y-auto">
              {result.warnings.map((w, i) => (
                <li key={i} className="px-4 py-2 text-xs text-gray-700">
                  <Badge variant="amber" className="mr-2">{w.unit || '—'}</Badge>
                  {w.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Reset */}
      {(stage === 'done' || stage === 'failed') && (
        <Button variant="secondary" size="sm" onClick={() => { setStage('idle'); setResult(null); setError(null); }}>
          Import another file
        </Button>
      )}
    </div>
  );
}
