import { db } from '@/src/lib/db/client';
import { policySettings, cpiRates } from '@/src/lib/db/schema';
import { PolicySettingsForm } from '@/src/components/PolicySettingsForm';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { formatPct, formatDate } from '@/src/lib/utils';
import { MOCO, CPI_BANNER_WARNING_DAYS } from '@/src/lib/constants';
import { asc } from 'drizzle-orm';

export const revalidate = 60;

export default async function SettingsPage() {
  const [settings, rates] = await Promise.all([
    db.select().from(policySettings).limit(1),
    db.select().from(cpiRates).orderBy(asc(cpiRates.periodStart)),
  ]);

  const currentSettings = settings[0] ?? null;

  // Check if we're approaching the end of the last CPI period
  const lastRate = rates.at(-1);
  const showCpiBanner = lastRate
    ? (new Date(lastRate.periodEnd + 'T00:00:00Z').getTime() - Date.now()) / (1000 * 60 * 60 * 24) < CPI_BANNER_WARNING_DAYS
    : true;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Settings</h1>

      {/* CPI banner */}
      {showCpiBanner && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-900">
          <p className="font-semibold">⚠ CPI rate update needed</p>
          <p className="mt-1 text-amber-700">
            {lastRate
              ? `The current CPI period ends on ${formatDate(lastRate.periodEnd)}. Add the next period to the seed file.`
              : 'No CPI rates are seeded. Run npm run db:seed.'}
          </p>
          <p className="mt-1 text-xs text-amber-500">Edit <code>src/lib/db/seed.ts</code> and run <code>npm run db:seed</code> after MoCo publishes new rates each July.</p>
        </div>
      )}

      {/* Policy settings */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Policy Settings</h2>
        <PolicySettingsForm initialSettings={{
          maxConcessionMonths: currentSettings?.maxConcessionMonths ?? '1.5',
          targetOccupancyPct: currentSettings?.targetOccupancyPct ?? '0.95',
          compRadiusMiles: currentSettings?.compRadiusMiles ?? '3.0',
          compRefreshIntervalDays: currentSettings?.compRefreshIntervalDays ?? 7,
          landlordName: currentSettings?.landlordName ?? '',
          propertyAddress: currentSettings?.propertyAddress ?? '',
        }} />
      </div>

      {/* Compliance constants */}
      <Card>
        <CardHeader><CardTitle>Compliance Constants (read-only)</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-gray-500 mb-3">Set by Montgomery County law — not user-editable.</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: 'Eligibility interval', value: `${MOCO.ELIGIBILITY_MONTHS} months` },
              { label: 'Notice required',       value: `${MOCO.NOTICE_DAYS} days`    },
              { label: 'Banking ceiling',        value: formatPct(MOCO.MAX_BANKING_CUMULATIVE) },
              { label: 'CPI add-on',             value: formatPct(MOCO.BASE_ADDON)    },
              { label: 'Absolute cap',           value: formatPct(MOCO.ABSOLUTE_CAP)  },
              { label: 'Cap formula',            value: 'min(CPI + 3%, 6%)'           },
            ].map(c => (
              <div key={c.label} className="flex justify-between py-1.5 border-b border-gray-50">
                <span className="text-gray-600">{c.label}</span>
                <span className="font-medium text-gray-900">{c.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* CPI rates table */}
      <Card>
        <CardHeader><CardTitle>CPI Rate Periods</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                {['Period', 'Start', 'End', 'CPI Rate', 'Cap %', 'Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rates.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No CPI rates seeded yet. Run <code className="bg-gray-100 px-1 rounded">npm run db:seed</code></td></tr>
              )}
              {rates.map(r => {
                const now = new Date();
                const start = new Date(r.periodStart + 'T00:00:00Z');
                const end   = new Date(r.periodEnd   + 'T00:00:00Z');
                const isCurrent = start <= now && now <= end;
                return (
                  <tr key={r.id} className={isCurrent ? 'bg-green-50' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-3 font-medium">{r.periodLabel}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(r.periodStart)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(r.periodEnd)}</td>
                    <td className="px-4 py-3">{formatPct(parseFloat(r.cpiRate))}</td>
                    <td className="px-4 py-3 font-semibold text-blue-700">{formatPct(parseFloat(r.capPct))}</td>
                    <td className="px-4 py-3">
                      {isCurrent ? <Badge variant="green">Current</Badge> : now > end ? <Badge variant="gray">Past</Badge> : <Badge variant="blue">Upcoming</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
