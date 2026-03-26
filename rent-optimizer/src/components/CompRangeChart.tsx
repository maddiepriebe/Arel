import { formatCurrency } from '@/src/lib/utils';

interface CompRange {
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  sampleSize: number;
}

interface CompRangeChartProps {
  compRange: CompRange | null;
  currentRent: number | null;
  proposedRent?: number | null;
}

export function CompRangeChart({ compRange, currentRent, proposedRent }: CompRangeChartProps) {
  if (!compRange || compRange.sampleSize === 0) {
    return (
      <div className="text-sm text-gray-400 italic py-4 text-center">
        No comp data available for this unit type
      </div>
    );
  }

  const { min, p25, median, p75, max } = compRange;
  const span = max - min || 1;

  function pct(val: number) {
    return Math.min(100, Math.max(0, ((val - min) / span) * 100));
  }

  const markers = [
    { val: min,    label: 'Min',    color: '#94a3b8' },
    { val: p25,    label: 'P25',    color: '#64748b' },
    { val: median, label: 'Median', color: '#0f172a' },
    { val: p75,    label: 'P75',    color: '#64748b' },
    { val: max,    label: 'Max',    color: '#94a3b8' },
  ];

  return (
    <div className="space-y-4">
      <div className="text-xs text-gray-500 text-right">{compRange.sampleSize} comps</div>

      {/* Bar */}
      <div className="relative h-8">
        {/* Background track */}
        <div className="absolute top-3 left-0 right-0 h-2 bg-gray-100 rounded-full" />

        {/* IQR (P25–P75) */}
        <div
          className="absolute top-3 h-2 bg-blue-200 rounded"
          style={{ left: `${pct(p25)}%`, width: `${pct(p75) - pct(p25)}%` }}
        />

        {/* Median line */}
        <div
          className="absolute top-1 h-6 w-0.5 bg-blue-700"
          style={{ left: `${pct(median)}%` }}
        />

        {/* Current rent marker */}
        {currentRent !== null && (
          <div
            className="absolute top-0 h-8 w-1 rounded bg-gray-600"
            style={{ left: `${pct(currentRent)}%` }}
            title={`Current: ${formatCurrency(currentRent)}`}
          />
        )}

        {/* Proposed rent marker */}
        {proposedRent != null && (
          <div
            className="absolute top-0 h-8 w-1 rounded bg-green-500"
            style={{ left: `${pct(proposedRent)}%` }}
            title={`Proposed: ${formatCurrency(proposedRent)}`}
          />
        )}
      </div>

      {/* Scale labels */}
      <div className="relative h-5">
        {markers.map(m => (
          <span
            key={m.label}
            className="absolute text-xs text-gray-500 -translate-x-1/2"
            style={{ left: `${pct(m.val)}%` }}
          >
            {formatCurrency(m.val)}
          </span>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-500 flex-wrap pt-1">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 bg-blue-200 rounded" /> IQR (P25–P75)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-0.5 h-3 bg-blue-700" /> Median</span>
        {currentRent !== null && (
          <span className="flex items-center gap-1"><span className="inline-block w-1 h-3 bg-gray-600 rounded" /> Current</span>
        )}
        {proposedRent != null && (
          <span className="flex items-center gap-1"><span className="inline-block w-1 h-3 bg-green-500 rounded" /> Proposed</span>
        )}
      </div>
    </div>
  );
}
