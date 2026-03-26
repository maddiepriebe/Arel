import { db } from '@/src/lib/db/client';
import { importJobs } from '@/src/lib/db/schema';
import { ImportDropzone } from '@/src/components/ImportDropzone';
import { Badge } from '@/src/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { formatDate } from '@/src/lib/utils';
import { desc } from 'drizzle-orm';

export const revalidate = 0; // always fresh — user wants latest import state

const STATUS_COLORS: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'gray'> = {
  done: 'green', partial: 'amber', failed: 'red', parsing: 'blue', pending: 'gray',
};

export default async function ImportPage() {
  const history = await db.select().from(importJobs).orderBy(desc(importJobs.createdAt)).limit(20);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Import Rent Roll</h1>
        <p className="text-sm text-gray-500 mt-1">Upload an Excel file (.xlsx or .xls) to import or update unit data.</p>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-900 space-y-1">
        <p className="font-semibold">Expected columns (fuzzy matched — order doesn't matter):</p>
        <p className="text-blue-700">Unit, Building, Tenant Name, Lease Start, Lease End, Rent, Effective Date, Unit Type, Bedrooms, Sq Ft</p>
        <p className="text-xs text-blue-500 mt-1">Column names don't need to match exactly — common variations are recognised automatically.</p>
      </div>

      {/* Drop zone */}
      <ImportDropzone />

      {/* History */}
      {history.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Import History</CardTitle></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  {['File', 'Date', 'Status', 'Rows', 'Skipped', 'Warnings'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map(job => {
                  const warnings = Array.isArray(job.warnings) ? job.warnings as { unit: string; message: string }[] : [];
                  return (
                    <tr key={job.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800 max-w-[180px] truncate">{job.filename}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{job.createdAt ? formatDate(job.createdAt.toISOString()) : '—'}</td>
                      <td className="px-4 py-3"><Badge variant={STATUS_COLORS[job.status] ?? 'gray'}>{job.status}</Badge></td>
                      <td className="px-4 py-3 font-medium">{job.rowsProcessed ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{job.rowsSkipped ?? '—'}</td>
                      <td className="px-4 py-3 text-xs">
                        {warnings.length > 0
                          ? <span className="text-amber-700 font-medium">{warnings.length} warning{warnings.length !== 1 ? 's' : ''}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
