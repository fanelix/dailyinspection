'use client';

// T6: daftar riwayat dengan filter tanggal/area/status dan ekspor CSV/GeoJSON dari hasil terfilter.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CHECKLISTS } from '../../lib/inspection.ts';
import { buildCsv, buildGeoJson } from '../../lib/history.ts';
import type { HistoryItem } from '../../lib/history.ts';

const PAGE = 20;
const areaLabel = (id: string) => CHECKLISTS.areas.find((a) => a.id === id)?.label ?? (id || 'Area tidak dikenal');
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) : '—');

export default function Riwayat() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [matched, setMatched] = useState<number | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [filters, setFilters] = useState({ areaId: '', status: '', from: '', to: '' });
  const [applied, setApplied] = useState(filters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(applied)) if (value) params.set(key, value);
      params.set('limit', String(PAGE));
      params.set('offset', String(offset));
      const res = await fetch(`/api/inspections?${params.toString()}`, { cache: 'no-store' });
      const body = await res.json().catch(() => null) as { ok?: boolean; inspections?: HistoryItem[]; matched?: number; skipped?: number; hasMore?: boolean; message?: string } | null;
      if (!res.ok || !body?.ok || !Array.isArray(body.inspections)) throw new Error(body?.message ?? 'Riwayat tidak dapat dimuat.');
      setItems((prev) => (offset === 0 ? body.inspections! : [...prev, ...body.inspections!]));
      setMatched(body.matched ?? null);
      setSkipped(body.skipped ?? 0);
      setHasMore(!!body.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Riwayat tidak dapat dimuat.');
    }
    setLoading(false);
  }, [applied]);
  useEffect(() => { void load(0); }, [load]);

  const download = (content: string, name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main>
      <div className="title-row">
        <h1>Riwayat inspeksi</h1>
        <Link className="button secondary" href="/"><i className="ic ic-arrow-left" aria-hidden="true" />Beranda</Link>
        <p className="hint">Data dari server. Perlu sinyal untuk memuat.</p>
      </div>
      <section className="panel" aria-labelledby="filter-title">
        <h2 id="filter-title">Filter</h2>
        <div className="filters">
          <div><label htmlFor="filter-area">Area</label>
          <select id="filter-area" value={filters.areaId} onChange={(e) => setFilters({ ...filters, areaId: e.target.value })}>
            <option value="">Semua area</option>
            {CHECKLISTS.areas.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}
          </select></div>
          <div><label htmlFor="filter-status">Status</label>
          <select id="filter-status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">Semua status</option>
            <option value="submitted">Terkirim</option>
            <option value="uploading">Belum selesai</option>
          </select></div>
          <div><label htmlFor="filter-from">Dari tanggal observasi</label><input id="filter-from" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
          <div><label htmlFor="filter-to">Sampai tanggal observasi</label><input id="filter-to" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
        </div>
        <div className="photo-actions">
          <button type="button" onClick={() => setApplied(filters)} disabled={loading}>Terapkan filter</button>
          <button type="button" className="secondary" onClick={() => download(buildCsv(items), 'riwayat-inspeksi.csv', 'text/csv;charset=utf-8')} disabled={!items.length}><i className="ic ic-sm ic-file-text" aria-hidden="true" />Unduh CSV ({items.length})</button>
          <button type="button" className="secondary" onClick={() => download(buildGeoJson(items), 'riwayat-inspeksi.geojson', 'application/geo+json')} disabled={!items.length}><i className="ic ic-sm ic-map-pin" aria-hidden="true" />Unduh GeoJSON ({items.length})</button>
        </div>
        <p className="hint">Ekspor memuat {items.length} baris yang sudah tampil{hasMore ? '; tekan “Muat lagi” untuk menambah baris' : ''}. GeoJSON memakai urutan [longitude, latitude] WGS84; inspeksi tanpa koordinat tetap muncul dengan geometry null.</p>
        {skipped > 0 && <p className="hint">{skipped} baris lama tanpa ID inspeksi valid dilewati; baris itu tidak diubah.</p>}
      </section>
      {error && <p className="status error" role="alert">✖ {error}</p>}
      {loading && !items.length && <p className="status" role="status">Memuat riwayat…</p>}
      {!loading && !items.length && !error && <p className="status" role="status">Tidak ada inspeksi yang cocok. Ubah area, status, atau rentang tanggal.</p>}
      <ul className="cards" style={{ marginTop: 14 }}>
        {items.map((i) => (
          <li key={i.inspectionId}>
            <Link className="row" href={`/riwayat/${i.inspectionId}`}>
              <span className="row-title">{areaLabel(i.areaId)}{i.subArea ? ` — ${i.subArea}` : ''}</span>
              <span className="meta">
                {i.status === 'submitted'
                  ? <span className="badge ok"><i className="ic ic-sm ic-check-circle" aria-hidden="true" />Terkirim</span>
                  : <span className="badge warn"><i className="ic ic-sm ic-clock" aria-hidden="true" />Belum selesai</span>}
                <span><i className="ic ic-sm ic-calendar" aria-hidden="true" />{time(i.observedAt)}</span>
                <span><i className="ic ic-sm ic-user" aria-hidden="true" />{i.inspectorName || 'Tanpa nama'}</span>
                <span>Revisi {i.version}</span>
                <span><i className="ic ic-sm ic-camera" aria-hidden="true" />{i.photoCount} foto</span>
                <span><i className={`ic ic-sm ${i.findings.open ? 'ic-alert-triangle' : 'ic-check-circle'}`} aria-hidden="true" />{i.findings.total ? `${i.findings.total} temuan: ${i.findings.open} belum selesai · ${i.findings.closed} ditutup` : 'Tidak ada temuan'}</span>
                <span><i className="ic ic-sm ic-comment" aria-hidden="true" />{i.reviews} review{i.reviewRequired ? ' · perlu review' : ''}</span>
              </span>
              <span className="row-link">Buka detail dan review<i className="ic ic-sm ic-chevron-right" aria-hidden="true" /></span>
            </Link>
          </li>
        ))}
      </ul>
      {hasMore && <button type="button" className="secondary" onClick={() => void load(items.length)} disabled={loading}>{loading ? 'Memuat…' : 'Muat lagi'}</button>}
      {matched !== null && <p className="hint">{matched} inspeksi cocok dengan filter ini.</p>}
    </main>
  );
}
