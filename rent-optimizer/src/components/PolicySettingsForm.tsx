'use client';

import { useState } from 'react';
import { Button } from '@/src/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';

interface PolicySettingsData {
  maxConcessionMonths: string | null;
  targetOccupancyPct: string | null;
  compRadiusMiles: string | null;
  compRefreshIntervalDays: number | null;
  landlordName: string | null;
  propertyAddress: string | null;
}

interface PolicySettingsFormProps {
  initialSettings: PolicySettingsData;
}

export function PolicySettingsForm({ initialSettings }: PolicySettingsFormProps) {
  const [settings, setSettings] = useState({
    maxConcessionMonths: parseFloat(initialSettings.maxConcessionMonths ?? '1.5'),
    targetOccupancyPct: parseFloat(initialSettings.targetOccupancyPct ?? '0.95') * 100,
    compRadiusMiles: parseFloat(initialSettings.compRadiusMiles ?? '3.0'),
    compRefreshIntervalDays: initialSettings.compRefreshIntervalDays ?? 7,
    landlordName: initialSettings.landlordName ?? '',
    propertyAddress: initialSettings.propertyAddress ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof typeof settings>(key: K, val: (typeof settings)[K]) {
    setSettings(s => ({ ...s, [key]: val }));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxConcessionMonths: settings.maxConcessionMonths,
          targetOccupancyPct: settings.targetOccupancyPct / 100,
          compRadiusMiles: settings.compRadiusMiles,
          compRefreshIntervalDays: settings.compRefreshIntervalDays,
          landlordName: settings.landlordName,
          propertyAddress: settings.propertyAddress,
        }),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      <Card>
        <CardHeader><CardTitle>Rent Optimization Policy</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {/* Max concession months */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max concession months
              <span className="ml-2 text-blue-600 font-semibold">{settings.maxConcessionMonths} mo</span>
            </label>
            <input type="range" min={0} max={3} step={0.5}
              value={settings.maxConcessionMonths}
              onChange={e => update('maxConcessionMonths', Number(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>0</span><span>0.5</span><span>1</span><span>1.5</span><span>2</span><span>2.5</span><span>3</span>
            </div>
          </div>

          {/* Target occupancy */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target occupancy
              <span className="ml-2 text-blue-600 font-semibold">{settings.targetOccupancyPct.toFixed(0)}%</span>
            </label>
            <input type="range" min={80} max={100} step={1}
              value={settings.targetOccupancyPct}
              onChange={e => update('targetOccupancyPct', Number(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Comp Scraping</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Comp radius (miles)
            </label>
            <input type="number" min={1} max={20} step={0.5}
              value={settings.compRadiusMiles}
              onChange={e => update('compRadiusMiles', Number(e.target.value))}
              className="w-24 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Refresh interval (days)
            </label>
            <input type="number" min={1} max={30}
              value={settings.compRefreshIntervalDays}
              onChange={e => update('compRefreshIntervalDays', Number(e.target.value))}
              className="w-24 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Notice Letter Defaults</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Landlord / company name</label>
            <input type="text"
              value={settings.landlordName}
              onChange={e => update('landlordName', e.target.value)}
              placeholder="e.g. Rockville Properties LLC"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property address</label>
            <input type="text"
              value={settings.propertyAddress}
              onChange={e => update('propertyAddress', e.target.value)}
              placeholder="e.g. 1234 Main St, Rockville, MD 20850"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} loading={saving}>Save settings</Button>
        {saved && <span className="text-sm text-green-600">✓ Saved</span>}
      </div>
    </div>
  );
}
