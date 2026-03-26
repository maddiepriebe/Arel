'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { Spinner } from '@/src/components/ui/Spinner';
import { formatCurrency, formatDate } from '@/src/lib/utils';
import { UNIT_TYPES } from '@/src/lib/constants';

interface Comp {
  id: number; source: string; propertyName: string | null; address: string | null;
  city: string | null; unitType: string; askingRent: string; effectiveRent: string | null;
  concessionMonths: string | null; scrapedAt: string; isActive: boolean; sourceUrl: string | null;
}
interface CompRange { min: number; p25: number; median: number; p75: number; max: number; sampleSize: number; }
interface ScrapeJob { id: number; status: string; triggeredBy: string | null; resultCount: number | null; errorMessage: string | null; createdAt: string; completedAt: string | null; }

interface AddCompForm { propertyName: string; address: string; city: string; unitType: string; askingRent: string; }

const STATUS_COLORS: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'gray'> = {
  done: 'green', partial: 'amber', failed: 'red', running: 'blue', pending: 'gray',
};

export default function CompsPage() {
  const [grouped, setGrouped] = useState<Record<string, { comps: Comp[]; range: CompRange | null; count: number }>>({});
  const [scrapeJobs, setScrapeJobs] = useState<ScrapeJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(UNIT_TYPES[0]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<AddCompForm>({ propertyName: '', address: '', city: 'Rockville', unitType: '1BR', askingRent: '' });
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    const [compsRes, jobsRes] = await Promise.all([
      fetch('/api/comps').then(r => r.json()),
      fetch('/api/comps/scrape-jobs').then(r => r.json()),
    ]);
    setGrouped(compsRes.grouped ?? {});
    setScrapeJobs(jobsRes.jobs ?? []);
  }

  useEffect(() => { loadData().finally(() => setLoading(false)); }, []);

  async function triggerRefresh() {
    setRefreshing(true); setRefreshMsg(null);
    const res = await fetch('/api/comps/refresh', { method: 'POST' });
    const data = await res.json();
    if (res.status === 429) setRefreshMsg(`Rate limited. ${data.nextAllowedAt ? `Next: ${formatDate(data.nextAllowedAt)}` : ''}`);
    else if (res.ok) { setRefreshMsg(`✓ Done — ${data.resultCount} comps updated`); await loadData(); }
    else setRefreshMsg(data.error ?? 'Failed');
    setRefreshing(false);
  }

  async function addComp() {
    setSubmitting(true);
    const res = await fetch('/api/comps/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, askingRent: parseFloat(form.askingRent) }),
    });
    if (res.ok) { setShowAddForm(false); await loadData(); }
    setSubmitting(false);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;

  const currentGroup = grouped[activeTab];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Comp Data</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowAddForm(s => !s)}>+ Add Manual Comp</Button>
          <Button size="sm" onClick={triggerRefresh} loading={refreshing}>Refresh Now</Button>
        </div>
      </div>

      {refreshMsg && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-800">{refreshMsg}</div>
      )}

      {/* Add form */}
      {showAddForm && (
        <Card>
          <CardHeader><CardTitle>Add Manual Comp</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {[
              { label: 'Property name', key: 'propertyName' as const },
              { label: 'Address', key: 'address' as const },
              { label: 'City', key: 'city' as const },
              { label: 'Asking rent ($)', key: 'askingRent' as const },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs text-gray-600 mb-1">{f.label}</label>
                <input value={form[f.key]} onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
            ))}
            <div>
              <label className="block text-xs text-gray-600 mb-1">Unit type</label>
              <select value={form.unitType} onChange={e => setForm(s => ({ ...s, unitType: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                {UNIT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={addComp} loading={submitting} size="sm">Save</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unit type tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {UNIT_TYPES.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
              ${activeTab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t} <span className="ml-1 text-xs text-gray-400">({grouped[t]?.count ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Range summary */}
      {currentGroup?.range && currentGroup.range.sampleSize > 0 && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Min', val: currentGroup.range.min },
            { label: 'P25', val: currentGroup.range.p25 },
            { label: 'Median', val: currentGroup.range.median },
            { label: 'P75', val: currentGroup.range.p75 },
            { label: 'Max', val: currentGroup.range.max },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">{formatCurrency(s.val)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Comps table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {!currentGroup || currentGroup.count === 0 ? (
          <div className="px-4 py-12 text-center text-gray-400 text-sm">No active comps for {activeTab}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  {['Property', 'Address', 'City', 'Asking Rent', 'Concession', 'Source', 'Scraped'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {currentGroup.comps.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      {c.sourceUrl ? <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{c.propertyName ?? '—'}</a> : (c.propertyName ?? '—')}
                      {c.source === 'manual' && <Badge variant="purple" className="ml-2">Manual</Badge>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate">{c.address ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.city ?? '—'}</td>
                    <td className="px-4 py-3 font-semibold">{formatCurrency(parseFloat(c.askingRent))}</td>
                    <td className="px-4 py-3 text-gray-600">{c.concessionMonths ? `${c.concessionMonths} mo` : '—'}</td>
                    <td className="px-4 py-3"><Badge variant="gray">{c.source.replace('_', '.')}</Badge></td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(c.scrapedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Scrape history */}
      <Card>
        <CardHeader><CardTitle>Scrape History</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                {['#', 'Status', 'Triggered by', 'Results', 'Started', 'Completed', 'Error'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {scrapeJobs.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">No scrape jobs yet</td></tr>
              )}
              {scrapeJobs.map(j => (
                <tr key={j.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400 text-xs">#{j.id}</td>
                  <td className="px-4 py-3"><Badge variant={STATUS_COLORS[j.status] ?? 'gray'}>{j.status}</Badge></td>
                  <td className="px-4 py-3 text-gray-600">{j.triggeredBy ?? '—'}</td>
                  <td className="px-4 py-3 font-medium">{j.resultCount ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{j.createdAt ? formatDate(j.createdAt) : '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{j.completedAt ? formatDate(j.completedAt) : '—'}</td>
                  <td className="px-4 py-3 text-red-600 text-xs max-w-[200px] truncate">{j.errorMessage ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
