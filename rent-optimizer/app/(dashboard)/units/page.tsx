import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/src/lib/db/client';
import { units, leases, rentHistory, cpiRates } from '@/src/lib/db/schema';
import { checkEligibility } from '@/src/lib/core/eligibility';
import { computeBankingState } from '@/src/lib/core/banking';
import { MOCO, UNIT_TYPES } from '@/src/lib/constants';
import { Badge } from '@/src/components/ui/Badge';
import { UnitStatusBadge } from '@/src/components/UnitStatusBadge';
import { formatCurrency, formatPct, formatDate } from '@/src/lib/utils';
import type { RentHistoryRow, CpiRateRow } from '@/src/lib/core/types';

export const revalidate = 60;

interface PageProps {
  searchParams: { page?: string; eligible?: string; unitType?: string; overdue?: string; sortBy?: string };
}

export default async function UnitsPage({ searchParams }: PageProps) {
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const pageSize = 50;

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

  let rows = allUnits.map(unit => {
    const lease = leaseByUnit.get(unit.id);
    const history = historyByUnit.get(unit.id) ?? [];
    const banking = computeBankingState(history, cpiRows, asOfDate);
    const eligibility = checkEligibility(history, asOfDate);
    const currentRent = lease ? parseFloat(lease.currentRent) : null;
    const maxAllowablePct = Math.min(latestCap + banking.cumulativeBanked, latestCap + MOCO.MAX_BANKING_CUMULATIVE);
    return { unit, lease, eligibility, banking, currentRent, maxAllowablePct, maxAllowableRent: currentRent ? currentRent * (1 + maxAllowablePct) : null };
  });

  // Filters
  if (searchParams.eligible === 'true') rows = rows.filter(r => r.eligibility.isEligible);
  if (searchParams.eligible === 'false') rows = rows.filter(r => !r.eligibility.isEligible);
  if (searchParams.overdue === 'true') rows = rows.filter(r => r.eligibility.noticeOverdue);
  if (searchParams.unitType) rows = rows.filter(r => r.unit.unitType === searchParams.unitType);

  // Sort
  const sortBy = searchParams.sortBy ?? 'noticeDeadline';
  const sortFns: Record<string, typeof rows[number] extends infer T ? (a: T, b: T) => number : never> = {
    unitId:          (a: typeof rows[0], b: typeof rows[0]) => a.unit.id.localeCompare(b.unit.id),
    noticeDeadline:  (a: typeof rows[0], b: typeof rows[0]) => a.eligibility.noticeDeadline.getTime() - b.eligibility.noticeDeadline.getTime(),
    currentRent:     (a: typeof rows[0], b: typeof rows[0]) => (a.currentRent ?? 0) - (b.currentRent ?? 0),
    maxAllowablePct: (a: typeof rows[0], b: typeof rows[0]) => b.maxAllowablePct - a.maxAllowablePct,
  };
  rows.sort((sortFns as Record<string, (a: typeof rows[0], b: typeof rows[0]) => number>)[sortBy] ?? sortFns.noticeDeadline);

  const total = rows.length;
  const totalPages = Math.ceil(total / pageSize);
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  function filterUrl(params: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    const all = { page: '1', eligible: searchParams.eligible, unitType: searchParams.unitType, overdue: searchParams.overdue, sortBy: searchParams.sortBy, ...params };
    for (const [k, v] of Object.entries(all)) if (v) sp.set(k, v);
    return `/units?${sp}`;
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Units <span className="text-gray-400 font-normal text-base">({total})</span></h1>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {/* Eligibility */}
        {[
          { label: 'All',      eligible: undefined },
          { label: 'Eligible', eligible: 'true'    },
          { label: 'Not yet',  eligible: 'false'   },
        ].map(f => (
          <Link key={f.label} href={filterUrl({ eligible: f.eligible })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${searchParams.eligible === f.eligible ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            {f.label}
          </Link>
        ))}
        <div className="w-px bg-gray-200 self-stretch mx-1" />
        {/* Overdue */}
        <Link href={filterUrl({ overdue: searchParams.overdue === 'true' ? undefined : 'true' })}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${searchParams.overdue === 'true' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
          Overdue only
        </Link>
        <div className="w-px bg-gray-200 self-stretch mx-1" />
        {/* Unit type */}
        {UNIT_TYPES.map(t => (
          <Link key={t} href={filterUrl({ unitType: searchParams.unitType === t ? undefined : t })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${searchParams.unitType === t ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            {t}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                {[
                  { label: 'Unit',        sort: 'unitId'         },
                  { label: 'Tenant',      sort: undefined        },
                  { label: 'Type',        sort: undefined        },
                  { label: 'Rent',        sort: 'currentRent'    },
                  { label: 'Max Allow.',  sort: 'maxAllowablePct'},
                  { label: 'Banked',      sort: undefined        },
                  { label: 'Status',      sort: undefined        },
                  { label: 'Notice By',   sort: 'noticeDeadline' },
                ].map(h => (
                  <th key={h.label} className="px-4 py-3 text-left font-medium">
                    {h.sort ? (
                      <Link href={filterUrl({ sortBy: h.sort })} className={`hover:text-gray-900 ${sortBy === h.sort ? 'text-blue-600' : ''}`}>
                        {h.label} {sortBy === h.sort ? '↑' : ''}
                      </Link>
                    ) : h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pageRows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 text-sm">No units match the current filters</td></tr>
              )}
              {pageRows.map(r => (
                <tr key={r.unit.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/units/${r.unit.id}`} className="font-medium text-blue-600 hover:underline">{r.unit.unitNumber}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-[140px] truncate">{r.lease?.tenantName ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">{r.unit.unitType ? <Badge variant="gray">{r.unit.unitType}</Badge> : '—'}</td>
                  <td className="px-4 py-3 font-medium">{formatCurrency(r.currentRent)}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{formatCurrency(r.maxAllowableRent)}</span>
                    <span className="text-xs text-gray-400 ml-1">({formatPct(r.maxAllowablePct)})</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.banking.cumulativeBanked > 0
                      ? <span className="text-blue-700 font-medium">{formatPct(r.banking.cumulativeBanked)}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <UnitStatusBadge isEligible={r.eligibility.isEligible} noticeOverdue={r.eligibility.noticeOverdue} daysUntilEligible={r.eligibility.daysUntilEligible} />
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(r.eligibility.noticeDeadline.toISOString())}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
            <span className="text-gray-500">Page {page} of {totalPages} · {total} units</span>
            <div className="flex gap-2">
              {page > 1 && <Link href={filterUrl({ page: String(page - 1) })} className="px-3 py-1 border rounded hover:bg-gray-50">← Prev</Link>}
              {page < totalPages && <Link href={filterUrl({ page: String(page + 1) })} className="px-3 py-1 border rounded hover:bg-gray-50">Next →</Link>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
