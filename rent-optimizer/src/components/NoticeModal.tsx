'use client';

import { useState } from 'react';
import { Button } from '@/src/components/ui/Button';

interface NoticeModalProps {
  unitId: string;
  tenantName: string | null;
  currentRent: number;
  proposedRent: number;
  effectiveDate: string;
  landlordName: string;
  propertyAddress: string;
  onClose: () => void;
}

export function NoticeModal({
  unitId, tenantName, currentRent, proposedRent, effectiveDate,
  landlordName, propertyAddress, onClose,
}: NoticeModalProps) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        proposedRent: String(proposedRent),
        effectiveDate,
      });
      const res = await fetch(`/api/units/${encodeURIComponent(unitId)}/notice?${params}`);
      const data = await res.json();
      setText(data.notice ?? data.error ?? 'Error generating notice');
    } finally {
      setLoading(false);
    }
  }

  function download() {
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notice-unit-${unitId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Notice Letter</h2>
            <p className="text-xs text-gray-500">Unit {unitId} · Proposed {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(proposedRent)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {!text ? (
            <div className="flex flex-col items-center gap-4 py-10">
              <p className="text-sm text-gray-600">Generate the notice letter to preview and edit.</p>
              <Button onClick={generate} loading={loading}>Generate Notice</Button>
            </div>
          ) : (
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              className="w-full h-80 font-mono text-xs border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>

        {/* Footer */}
        {text && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
            <Button variant="secondary" onClick={copy}>{copied ? '✓ Copied' : 'Copy text'}</Button>
            <Button onClick={download}>Download .txt</Button>
          </div>
        )}
      </div>
    </div>
  );
}
