'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { NoticeModal } from '@/src/components/NoticeModal';
import { formatCurrency, formatDate } from '@/src/lib/utils';
import { Spinner } from '@/src/components/ui/Spinner';

interface NoticeUnit {
  unitId: string;
  unitNumber: string;
  unitType: string | null;
  tenantName: string | null;
  currentRent: number | null;
  maxAllowableRent: number | null;
  noticeDeadline: string;
  daysUntilEligible: number;
  noticeOverdue: boolean;
  isEligible: boolean;
}

interface Settings { landlordName: string; propertyAddress: string; }

export default function NoticesPage() {
  const [units, setUnits] = useState<NoticeUnit[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeNotice, setActiveNotice] = useState<NoticeUnit | null>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');

  useEffect(() => {
    Promise.all([
      fetch('/api/units?pageSize=200').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ]).then(([unitsData, settingsData]) => {
      const eligible: NoticeUnit[] = (unitsData.units ?? [])
        .filter((u: NoticeUnit) => u.isEligible || u.noticeOverdue)
        .map((u: NoticeUnit) => u);
      setUnits(eligible);
      setSettings(settingsData);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;

  const overdue   = units.filter(u => u.noticeOverdue);
  const within30  = units.filter(u => !u.noticeOverdue && u.isEligible && u.daysUntilEligible <= 0 && u.daysUntilEligible > -30);
  const within90  = units.filter(u => !u.noticeOverdue && u.isEligible && u.daysUntilEligible <= 0 && u.daysUntilEligible <= -30);

  function UnitRow({ unit, urgency }: { unit: NoticeUnit; urgency: 'red' | 'amber' | 'gray' }) {
    return (
      <div className="flex items-center justify-between py-3 px-4 hover:bg-gray-50 rounded-lg">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/units/${unit.unitId}`} className="font-medium text-blue-600 hover:underline text-sm">{unit.unitNumber}</Link>
          {unit.unitType && <Badge variant="gray">{unit.unitType}</Badge>}
          <span className="text-sm text-gray-600 truncate">{unit.tenantName ?? '—'}</span>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <span className="text-xs text-gray-500">{formatCurrency(unit.currentRent)}/mo → <span className="font-medium text-green-700">{formatCurrency(unit.maxAllowableRent)}</span></span>
          <Badge variant={urgency}>
            {unit.noticeOverdue
              ? `${Math.abs(unit.daysUntilEligible)}d overdue`
              : `Due ${formatDate(unit.noticeDeadline)}`}
          </Badge>
          <Button size="sm" variant="secondary"
            onClick={() => setActiveNotice(unit)}>
            Generate
          </Button>
        </div>
      </div>
    );
  }

  function Section({ title, items, urgency, color }: { title: string; items: NoticeUnit[]; urgency: 'red' | 'amber' | 'gray'; color: string }) {
    if (items.length === 0) return null;
    return (
      <div>
        <h2 className={`text-sm font-semibold ${color} mb-2 px-4`}>{title} ({items.length})</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {items.map(u => <UnitRow key={u.unitId} unit={u} urgency={urgency} />)}
        </div>
      </div>
    );
  }

  const noData = units.length === 0;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Notice Manager</h1>
        <div className="flex gap-2">
          <div className="bg-gray-100 rounded-lg p-0.5 flex">
            {(['list', 'calendar'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${view === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {noData && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-medium text-gray-600">No eligible units</p>
          <p className="text-sm mt-1">Units will appear here when they become eligible for a rent increase</p>
        </div>
      )}

      {!noData && view === 'list' && (
        <div className="space-y-6">
          <Section title="Overdue"           items={overdue}   urgency="red"   color="text-red-700"   />
          <Section title="Due within 30 days" items={within30}  urgency="amber" color="text-amber-700" />
          <Section title="Due within 90 days" items={within90}  urgency="gray"  color="text-gray-600"  />
        </div>
      )}

      {!noData && view === 'calendar' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-4">Notice deadlines by unit</p>
          <div className="space-y-2">
            {[...units].sort((a, b) => a.noticeDeadline.localeCompare(b.noticeDeadline)).map(u => (
              <div key={u.unitId} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-24 flex-shrink-0">{formatDate(u.noticeDeadline)}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-5 relative">
                  <div className={`h-5 rounded-full text-xs flex items-center pl-2 text-white font-medium
                    ${u.noticeOverdue ? 'bg-red-500' : u.daysUntilEligible > -30 ? 'bg-amber-500' : 'bg-gray-400'}`}
                    style={{ width: `${Math.min(100, Math.max(10, 100 - ((-u.daysUntilEligible) / 365) * 100))}%` }}>
                    Unit {u.unitNumber}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeNotice && settings && (
        <NoticeModal
          unitId={activeNotice.unitId}
          tenantName={activeNotice.tenantName}
          currentRent={activeNotice.currentRent ?? 0}
          proposedRent={activeNotice.maxAllowableRent ?? activeNotice.currentRent ?? 0}
          effectiveDate={new Date(Date.now() + 91 * 86400000).toISOString().split('T')[0]}
          landlordName={settings.landlordName}
          propertyAddress={settings.propertyAddress}
          onClose={() => setActiveNotice(null)}
        />
      )}
    </div>
  );
}
