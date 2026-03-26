'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { UnitStatusBadge } from '@/src/components/UnitStatusBadge';
import { OptimizationPanel } from '@/src/components/OptimizationPanel';
import { NoticeModal } from '@/src/components/NoticeModal';
import { Spinner } from '@/src/components/ui/Spinner';
import { Button } from '@/src/components/ui/Button';
import { formatCurrency, formatPct, formatDate } from '@/src/lib/utils';

interface UnitDetail {
  unit: { id: string; unitNumber: string; unitType: string | null; sqft: number | null; bedrooms: number | null; buildingCode: string | null };
  currentLease: { tenantName: string | null; leaseStart: string; leaseEnd: string | null; currentRent: string; rentEffectiveDate: string } | null;
  rentHistory: Array<{ effectiveDate: string; rentAmount: string; increaseType: string | null; increasePct: string | null }>;
  eligibility: { isEligible: boolean; monthsSinceLastIncrease: number; lastIncreaseDate: string | null; earliestEligibleDate: string; noticeDeadline: string; daysUntilEligible: number; noticeOverdue: boolean };
  banking: { cumulativeBanked: number; hitCeiling: boolean; complianceViolation: boolean; periods: Array<{ periodStart: string; periodEnd: string; allowablePct: number; usedPct: number; bankedThisPeriod: number; cumulativeBanked: number }> };
  maxAllowablePct: number;
  maxAllowableRent: number | null;
  compRange: { min: number; p25: number; median: number; p75: number; max: number; sampleSize: number } | null;
  optimization: { recommended: { proposedRent: number; label: string }; allScenarios: unknown[]; compRange: unknown | null; hasCompData: boolean; warnings: string[] } | null;
}

export default function UnitDetailPage() {
  const params = useParams();
  const unitId = decodeURIComponent(params.unitId as string);

  const [data, setData] = useState<UnitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticePropRent, setNoticePropRent] = useState<number | null>(null);
  const [settings, setSettings] = useState<{ landlordName: string; propertyAddress: string } | null>(null);

  useEffect(() => {
    fetch(`/api/units/${encodeURIComponent(unitId)}`)
      .then(r => r.json())
      .then(d => { setData(d); setNoticePropRent(d.maxAllowableRent); })
      .catch(() => setError('Failed to load unit'))
      .finally(() => setLoading(false));

    fetch('/api/settings')
      .then(r => r.json())
      .then(s => setSettings({ landlordName: s.landlordName ?? '', propertyAddress: s.propertyAddress ?? '' }));
  }, [unitId]);

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;
  if (error || !data) return <div className="p-8 text-red-600">{error ?? 'Unit not found'}</div>;

  const { unit, currentLease, eligibility, banking, maxAllowablePct, maxAllowableRent, compRange, optimization } = data;
  const currentRent = currentLease ? parseFloat(currentLease.currentRent) : null;
  const effectiveDate = new Date();
  effectiveDate.setDate(effectiveDate.getDate() + 91); // 91 days from now (>90 required)
  const effectiveDateStr = effectiveDate.toISOString().split('T')[0];

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500">
        <Link href="/units" className="hover:text-blue-600">Units</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-medium">Unit {unit.unitNumber}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Unit {unit.unitNumber}</h1>
            {unit.unitType && <Badge variant="gray">{unit.unitType}</Badge>}
            {unit.sqft && <span className="text-sm text-gray-500">{unit.sqft} sqft</span>}
          </div>
          <p className="text-gray-600 mt-1">
            {currentLease?.tenantName ?? 'No current tenant'} ·{' '}
            {currentLease ? `${formatDate(currentLease.leaseStart)} → ${currentLease.leaseEnd ? formatDate(currentLease.leaseEnd) : 'MTM'}` : 'No lease on file'}
          </p>
          <p className="text-xl font-semibold text-gray-900 mt-1">{formatCurrency(currentRent)}/mo</p>
        </div>
        {eligibility.isEligible && (
          <Button onClick={() => setNoticeOpen(true)}>Generate Notice</Button>
        )}
      </div>

      {/* Compliance violation */}
      {banking.complianceViolation && (
        <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 text-sm text-red-800 font-medium">
          ⚠ Compliance violation detected — rent increases in one or more periods exceeded the allowable cap.
        </div>
      )}

      {/* Top panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Eligibility */}
        <Card>
          <CardHeader><CardTitle>Eligibility</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Status</span>
              <UnitStatusBadge isEligible={eligibility.isEligible} noticeOverdue={eligibility.noticeOverdue} daysUntilEligible={eligibility.daysUntilEligible} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Last increase</span>
              <span className="text-sm">{eligibility.lastIncreaseDate ? formatDate(eligibility.lastIncreaseDate) : 'No history'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Months since</span>
              <span className="text-sm font-medium">{eligibility.monthsSinceLastIncrease}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Eligible from</span>
              <span className="text-sm">{formatDate(eligibility.earliestEligibleDate)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Notice deadline</span>
              <span className={`text-sm font-medium ${eligibility.noticeOverdue ? 'text-red-600' : ''}`}>{formatDate(eligibility.noticeDeadline)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Max allowable */}
        <Card>
          <CardHeader><CardTitle>Max Allowable Increase</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Current rent</span>
              <span className="text-sm font-medium">{formatCurrency(currentRent)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">CPI cap (base)</span>
              <span className="text-sm">{formatPct(maxAllowablePct - banking.cumulativeBanked)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Banked</span>
              <span className="text-sm text-blue-700 font-medium">+ {formatPct(banking.cumulativeBanked)}</span>
            </div>
            <div className="border-t border-gray-100 pt-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900">Total allowable</span>
              <span className="text-sm font-bold">{formatPct(maxAllowablePct)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Max rent</span>
              <span className="text-lg font-bold text-green-700">{formatCurrency(maxAllowableRent)}</span>
            </div>
            {banking.hitCeiling && <Badge variant="amber">Banking ceiling reached</Badge>}
          </CardContent>
        </Card>

        {/* Banking summary */}
        <Card>
          <CardHeader><CardTitle>Banking Balance</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Available</span>
              <span className="text-2xl font-bold text-blue-700">{formatPct(banking.cumulativeBanked)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 mt-1">
              <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(100, (banking.cumulativeBanked / 0.10) * 100)}%` }} />
            </div>
            <p className="text-xs text-gray-400">{formatPct(banking.cumulativeBanked)} of 10% ceiling</p>
          </CardContent>
        </Card>
      </div>

      {/* Optimizer */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Optimization</h2>
        <OptimizationPanel
          unitId={unitId}
          currentRent={currentRent ?? 0}
          initialResult={optimization as Parameters<typeof OptimizationPanel>[0]['initialResult']}
          compRange={compRange}
        />
      </div>

      {/* Banking ledger */}
      <Card>
        <CardHeader><CardTitle>Banking Ledger</CardTitle></CardHeader>
        {banking.periods.length === 0 ? (
          <CardContent><p className="text-sm text-gray-400">No banking periods computed yet.</p></CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  {['Period', 'CPI Cap', 'Used', 'Banked this period', 'Cumulative'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {banking.periods.map((p, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{formatDate(p.periodStart)} – {formatDate(p.periodEnd)}</td>
                    <td className="px-4 py-3">{formatPct(p.allowablePct)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatPct(p.usedPct)}</td>
                    <td className={`px-4 py-3 font-medium ${p.bankedThisPeriod >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                      {p.bankedThisPeriod >= 0 ? '+' : ''}{formatPct(p.bankedThisPeriod)}
                    </td>
                    <td className="px-4 py-3 font-bold">{formatPct(p.cumulativeBanked)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Rent history */}
      <Card>
        <CardHeader><CardTitle>Rent History</CardTitle></CardHeader>
        {data.rentHistory.length === 0 ? (
          <CardContent><p className="text-sm text-gray-400">No rent history found.</p></CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  {['Effective Date', 'Rent', 'Change', 'Type'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.rentHistory.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{formatDate(r.effectiveDate)}</td>
                    <td className="px-4 py-3 font-medium">{formatCurrency(parseFloat(r.rentAmount))}</td>
                    <td className="px-4 py-3 text-xs">{r.increasePct ? <span className="text-green-700">+{formatPct(parseFloat(r.increasePct))}</span> : '—'}</td>
                    <td className="px-4 py-3">
                      {r.increaseType && (
                        <Badge variant={r.increaseType === 'increase' ? 'green' : r.increaseType === 'concession' ? 'amber' : 'gray'}>
                          {r.increaseType}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Notice modal */}
      {noticeOpen && currentLease && settings && (
        <NoticeModal
          unitId={unitId}
          tenantName={currentLease.tenantName}
          currentRent={currentRent ?? 0}
          proposedRent={noticePropRent ?? maxAllowableRent ?? currentRent ?? 0}
          effectiveDate={effectiveDateStr}
          landlordName={settings.landlordName}
          propertyAddress={settings.propertyAddress}
          onClose={() => setNoticeOpen(false)}
        />
      )}
    </div>
  );
}
