import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/src/lib/db/client';
import { units, leases, rentHistory, cpiRates } from '@/src/lib/db/schema';
import { computeBankingState } from '@/src/lib/core/banking';
import { MOCO } from '@/src/lib/constants';
import { Badge } from '@/src/components/ui/Badge';
import { formatCurrency, formatPct, formatDate } from '@/src/lib/utils';
import type { RentHistoryRow, CpiRateRow } from '@/src/lib/core/types';

export const revalidate = 60;

export default async function BankingPage() {
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
  const asOfDate = new Date();

  const rows = allUnits.map(unit => {
    const lease = leaseByUnit.get(unit.id);
    const history = historyByUnit.get(unit.id) ?? [];
    const banking = computeBankingState(history, cpiRows, asOfDate);
    const currentRent = lease ? parseFloat(lease.currentRent) : null;
    return { unit, lease, banking, currentRent };
  }).sort((a, b) => b.banking.cumulativeBanked - a.banking.cumulativeBanked);

  const highBanked = rows.filter(r => r.banking.cumulativeBanked > 0.05).length;
  const atCeiling  = rows.filter(r => r.banking.hitCeiling).length;
  const violations = rows.filter(r => r.banking.complianceViolation).length;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Banking Ledger</h1>
        <a href="/api/reports/export?include=banking" className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-300 rounded-md hover:bg-gray-50">
          ⬇ Export
        </a>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-medium">Units with &gt;5% banked</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{highBanked}</p>
          <p className="text-xs text-gray-400">significant unused capacity</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-medium">At 10% ceiling</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{atCeiling}</p>
          <p className="text-xs text-gray-400">no further banking possible</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-medium">Compliance violations</p>
          <p className={`text-2xl font-bold mt-1 ${violations > 0 ? 'text-red-700' : 'text-gray-900'}`}>{violations}</p>
          <p className="text-xs text-gray-400">exceeded allowable in a period</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                {['Unit', 'Type', 'Tenant', 'Current Rent', 'Cumulative Banked', 'Periods', 'Flags'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">No units with banking history</td></tr>
              )}
              {rows.map(r => {
                const banked = r.banking.cumulativeBanked;
                const pct = Math.min(100, (banked / 0.10) * 100);
                return (
                  <tr key={r.unit.id} className={`hover:bg-gray-50 ${r.banking.complianceViolation ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-3">
                      <Link href={`/units/${r.unit.id}`} className="font-medium text-blue-600 hover:underline">{r.unit.unitNumber}</Link>
                    </td>
                    <td className="px-4 py-3">{r.unit.unitType ? <Badge variant="gray">{r.unit.unitType}</Badge> : '—'}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[120px] truncate">{r.lease?.tenantName ?? '—'}</td>
                    <td className="px-4 py-3 font-medium">{formatCurrency(r.currentRent)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 max-w-[80px] bg-gray-100 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${banked > 0.05 ? 'bg-blue-500' : 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={`font-semibold text-xs ${banked > 0.05 ? 'text-blue-700' : 'text-gray-600'}`}>{formatPct(banked)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.banking.periods.length}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {r.banking.hitCeiling && <Badge variant="amber">At ceiling</Badge>}
                        {r.banking.complianceViolation && <Badge variant="red">Violation</Badge>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
