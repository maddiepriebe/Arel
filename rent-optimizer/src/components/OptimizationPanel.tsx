'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { CompRangeChart } from '@/src/components/CompRangeChart';
import { formatCurrency, formatPct } from '@/src/lib/utils';

interface Scenario {
  label: string;
  proposedRent: number;
  increasePct: number;
  concessionMonths: number;
  effectiveMonthlyNet: number;
  annualNetRevenue: number;
  compDeltaPct: number;
  bankedPctConsumed: number;
  remainingBankAfter: number;
  meetsPolicy: boolean;
}

interface CompRange {
  min: number; p25: number; median: number; p75: number; max: number; sampleSize: number;
}

interface OptResult {
  recommended: Scenario;
  allScenarios: Scenario[];
  compRange: CompRange | null;
  hasCompData: boolean;
  warnings: string[];
}

interface OptimizationPanelProps {
  unitId: string;
  currentRent: number;
  initialResult: OptResult | null;
  compRange: CompRange | null;
}

export function OptimizationPanel({ unitId, currentRent, initialResult, compRange }: OptimizationPanelProps) {
  const [result, setResult] = useState<OptResult | null>(initialResult);
  const [concessionOverride, setConcessionOverride] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  async function refetch(maxConcession: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/units/${encodeURIComponent(unitId)}/optimize?maxConcessionMonths=${maxConcession}`);
      if (res.ok) setResult(await res.json());
    } finally {
      setLoading(false);
    }
  }

  function handleSlider(val: number) {
    setConcessionOverride(val);
    refetch(val);
  }

  if (!result) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-gray-500">Unit is not yet eligible for an increase.</p>
        </CardContent>
      </Card>
    );
  }

  const recommended = result.recommended;
  const proposed = concessionOverride !== null
    ? result.allScenarios.find(s => s.concessionMonths <= concessionOverride) ?? recommended
    : recommended;

  return (
    <div className="space-y-4">
      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 space-y-1">
          {result.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
        </div>
      )}

      {/* Concession override */}
      <Card>
        <CardHeader><CardTitle>Concession Override (this unit)</CardTitle></CardHeader>
        <CardContent>
          <label className="flex items-center gap-4">
            <span className="text-sm text-gray-600 w-32">Max concession:</span>
            <input
              type="range" min={0} max={3} step={0.5}
              value={concessionOverride ?? result.recommended.concessionMonths}
              onChange={e => handleSlider(Number(e.target.value))}
              className="flex-1 accent-blue-600"
            />
            <span className="text-sm font-medium w-16 text-right">
              {concessionOverride ?? result.recommended.concessionMonths} mo
            </span>
          </label>
          {loading && <p className="text-xs text-blue-600 mt-2">Recalculating…</p>}
        </CardContent>
      </Card>

      {/* Scenario table */}
      <Card>
        <CardHeader><CardTitle>Scenarios</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Scenario</th>
                <th className="px-4 py-3 text-right">Rent</th>
                <th className="px-4 py-3 text-right">Increase</th>
                <th className="px-4 py-3 text-right">Concession</th>
                <th className="px-4 py-3 text-right">Net/mo</th>
                <th className="px-4 py-3 text-right">vs Median</th>
                <th className="px-4 py-3 text-right">Bank Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {result.allScenarios.map((s, i) => {
                const isRec = s.label === result.recommended.label;
                return (
                  <tr key={i} className={isRec ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {s.label}
                        {isRec && <Badge variant="blue">Rec</Badge>}
                        {!s.meetsPolicy && <Badge variant="amber">Over policy</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(s.proposedRent)}</td>
                    <td className="px-4 py-3 text-right text-green-700">{formatPct(s.increasePct)}</td>
                    <td className="px-4 py-3 text-right">{s.concessionMonths > 0 ? `${s.concessionMonths} mo` : '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(s.effectiveMonthlyNet)}</td>
                    <td className={`px-4 py-3 text-right ${s.compDeltaPct > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                      {formatPct(s.compDeltaPct)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{formatPct(s.remainingBankAfter)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Comp range chart */}
      <Card>
        <CardHeader><CardTitle>Market Comp Range</CardTitle></CardHeader>
        <CardContent>
          <CompRangeChart
            compRange={result.compRange ?? compRange}
            currentRent={currentRent}
            proposedRent={proposed.proposedRent}
          />
        </CardContent>
      </Card>
    </div>
  );
}
