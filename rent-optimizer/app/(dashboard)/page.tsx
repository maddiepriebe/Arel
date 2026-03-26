import { eq } from 'drizzle-orm';
import { db } from '@/src/lib/db/client';
import { units, leases, rentHistory, cpiRates } from '@/src/lib/db/schema';
import { checkEligibility } from '@/src/lib/core/eligibility';
import { computeBankingState } from '@/src/lib/core/banking';
import { MOCO } from '@/src/lib/constants';
import { Card, CardContent } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { UnitStatusBadge } from '@/src/components/UnitStatusBadge';
import { formatCurrency, formatPct, formatDate } from '@/src/lib/utils';
import Link from 'next/link';
import type { RentHistoryRow, CpiRateRow } from '@/src/lib/core/types';

export const revalidate = 60; // revalidate every minute

export default async function PortfolioPage() {
  // One round-trip: fetch all data in parallel
  const [allUnits, allLeases, allHistory, allCpi] = await Promise.all([
    db.select().from(units),
    db.select().from(leases).where(eq(leases.isCurrent, true)),
    db.select().from(rentHistory),
    db.select().from(cpiRates),
  ]);

  const leaseByUnit = new Map(allLeases.map(l => [l.unitId!, l]));
  const historyByUnit = new Map<string, RentHistoryRow[]>();
  for (const r of allHistory) {
    if (!r.unitId) continue;
    const arr = historyByUnit.get(r.unitId) ?? [];
    arr.push({ effectiveDate: r.effectiveDate, increaseType: r.increaseType, increasePct: r.increasePct });
    historyByUnit.set(r.unitId, arr);
  }
  const cpiRows: CpiRateRow[] = allCpi.map(r => ({
    periodStart: r.periodStart, periodEnd: r.periodEnd, capPct: r.capPct, cpiRate: r.cpiRate,
  }));
  const latestCap = allCpi.length > 0
    ? parseFloat(allCpi.slice().sort((a, b) => b.periodStart.localeCompare(a.periodStart))[0].capPct)
    : MOCO.ABSOLUTE_CAP;

  const asOfDate = new Date();

  // Compute per-unit stats
  const rows = allUnits.map(unit => {
    const lease = leaseByUnit.get(unit.id);
    const history = historyByUnit.get(unit.id) ?? [];
    const banking = computeBankingState(history, cpiRows, asOfDate);
    const eligibility = checkEligibility(history, asOfDate);
    const currentRent = lease ? parseFloat(lease.currentRent) : null;
    const maxAllowablePct = Math.min(latestCap + banking.cumulativeBanked, latestCap + MOCO.MAX_BANKING_CUMULATIVE);
    const maxAllowableRent = currentRent ? currentRent * (1 + maxAllowablePct) : null;
    return { unit, lease, eligibility, banking, currentRent, maxAllowablePct, maxAllowableRent };
  });

  // Summary stats
  const totalUnits = rows.length;
  const eligibleCount = rows.filter(r => r.eligibility.isEligible).length;
  const overdueCount = rows.filter(r => r.eligibility.noticeOverdue).length;
  const projectedLift = rows
    .filter(r => r.eligibility.isEligible && r.currentRent && r.maxAllowableRent)
    .reduce((sum, r) => sum + ((r.maxAllowableRent ?? 0) - (r.currentRent ?? 0)), 0);

  // Alerts: notice deadline within 14 days
  const alerts = rows
    .filter(r => r.eligibility.isEligible && r.eligibility.daysUntilEligible <= 0
      && r.eligibility.daysUntilEligible > -14 && !r.eligibility.noticeOverdue)
    .slice(0, 10);

  // Table: sort by notice deadline
  const tableRows = rows
    .slice()
    .sort((a, b) => a.eligibility.noticeDeadline.getTime() - b.eligibility.noticeDeadline.getTime())
    .slice(0, 50);

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Portfolio Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/import" className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700">
            📤 Import Roll
          </Link>
          <a href="/api/reports/export" className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700">
            ⬇ Export Report
          </a>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Units',          value: totalUnits,                   sub: 'in portfolio' },
          { label: 'Eligible for Increase', value: eligibleCount,               sub: `${((eligibleCount/Math.max(totalUnits,1))*100).toFixed(0)}% of portfolio`, color: eligibleCount > 0 ? 'text-green-700' : '' },
          { label: 'Notice Overdue',        value: overdueCount,                sub: 'require immediate action', color: overdueCount > 0 ? 'text-red-700' : '' },
          { label: 'Projected Monthly Lift',value: formatCurrency(projectedLift), sub: 'if all eligible units raised', color: 'text-blue-700' },
        ].map(c => (
          <Card key={c.label}>
            <CardContent className="py-4">
              <p className="text-xs text-gray-500 font-medium">{c.label}</p>
              <p className={`text-2xl font-bold mt-1 ${c.color ?? 'text-gray-900'}`}>{c.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alerts strip */}
      {alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800">⏰ Action needed within 14 days</p>
          <div className="flex flex-wrap gap-2">
            {alerts.map(r => (
              <Link key={r.unit.id} href={`/units/${r.unit.id}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-amber-300 rounded-lg text-xs hover:bg-amber-50">
                <span className="font-medium">{r.unit.unitNumber}</span>
                <span className="text-gray-500">{r.lease?.tenantName ?? '—'}</span>
                <Badge variant="amber">{r.eligibility.daysUntilEligible === 0 ? 'Today' : `${Math.abs(r.eligibility.daysUntilEligible)}d ago`}</Badge>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* No data state */}
      {totalUnits === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🏢</p>
          <p className="font-medium text-gray-600">No units imported yet</p>
          <p className="text-sm mt-1">Upload a rent roll to get started</p>
          <Link href="/import" className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">Import Rent Roll</Link>
        </div>
      )}

      {/* Unit table */}
      {totalUnits > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Units <span className="text-gray-400 font-normal">({totalUnits})</span></h2>
            <Link href="/units" className="text-xs text-blue-600 hover:underline">View all →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  {['Unit', 'Tenant', 'Type', 'Rent', 'Max Allowable', 'Status', 'Notice Deadline'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tableRows.map(r => (
                  <tr key={r.unit.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/units/${r.unit.id}`} className="font-medium text-blue-600 hover:underline">{r.unit.unitNumber}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.lease?.tenantName ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3">
                      {r.unit.unitType ? <Badge variant="gray">{r.unit.unitType}</Badge> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 font-medium">{formatCurrency(r.currentRent)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{formatCurrency(r.maxAllowableRent)}</span>
                        <span className="text-xs text-gray-400">{formatPct(r.maxAllowablePct)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <UnitStatusBadge
                        isEligible={r.eligibility.isEligible}
                        noticeOverdue={r.eligibility.noticeOverdue}
                        daysUntilEligible={r.eligibility.daysUntilEligible}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(r.eligibility.noticeDeadline.toISOString())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

