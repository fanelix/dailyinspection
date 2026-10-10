'use client';

// T6: detail inspeksi dan form review per temuan dengan penanganan konflik revisi.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CHECKLISTS } from '../../../lib/inspection.ts';
import LocationMap from '../../../components/LocationMap.tsx';
import type { ReviewEntry } from '../../../lib/history.ts';

type Detail = {
  inspectionId: string; inspectorName: string; observedAt: string | null; receivedAt: string | null; note: string; status: string; version: number;
  schemaVersion: number | null; templateVersion: string; areaId: string; subArea: string;
  checklist: null | {
    templateSnapshot?: { label?: string; items?: { id: string; label: string }[] };
    answers?: { itemId: string; answer: string | null; finding: null | { type: string; description: string; photoIds: string[]; noPhotoReason: string | null; measurement: null | { value: number; unit: string; method: string } } }[];
    reviewRequired?: boolean;
  };
  location: null | { object?: { latitude: number; longitude: number; method?: string; utm?: { datum: string; zone: number; hemisphere: string; crs: string; easting: number; northing: number } } };
  photoManifest: { photoId: string; sha256: string; size: number; caption: string }[];
  reviews: ReviewEntry[];
  photos: { photoId: string; status: string; size: number | null; caption: string; storedAt: string | null }[];
};
const ANSWER_LABEL: Record<string, string> = { no_finding: 'Tidak ada temuan', finding: 'Ada temuan', not_inspected: 'Tidak diperiksa', not_applicable: 'Tidak berlaku' };
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) : '—');
const areaLabel = (id: string) => CHECKLISTS.areas.find((a) => a.id === id)?.label ?? (id || 'Area tidak dikenal');
type FindingState = Record<string, { status: 'open' | 'closed'; note: string }>;

export default function DetailInspeksi() {
  const id = String(useParams().id ?? '');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reviewer, setReviewer] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [findings, setFindings] = useState<FindingState>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const reviewId = useRef(crypto.randomUUID());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/inspections/${encodeURIComponent(id)}`, { cache: 'no-store' });
      const body = await res.json().catch(() => null) as { ok?: boolean; inspection?: Detail; code?: string; message?: string } | null;
      if (!res.ok || !body?.ok || !body.inspection) throw new Error(body?.message ?? 'Detail tidak dapat dimuat.');
      const next = body.inspection;
      setDetail(next);
      const state: FindingState = {};
      for (const answer of next.checklist?.answers ?? []) {
        if (answer.answer !== 'finding') continue;
        let status: 'open' | 'closed' = 'open';
        for (let i = next.reviews.length - 1; i >= 0; i--) {
          const entry = next.reviews[i].findings.find((f) => f.itemId === answer.itemId);
          if (entry) { status = entry.status; break; }
        }
        state[answer.itemId] = { status, note: '' };
      }
      setFindings(state);
      setConflict(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detail tidak dapat dimuat.');
    }
    setLoading(false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function saveReview(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`/api/inspections/${encodeURIComponent(id)}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: detail.version,
          review: {
            reviewId: reviewId.current, reviewerName: reviewer.trim(), note: reviewNote.trim(),
            findings: Object.entries(findings).map(([itemId, f]) => ({ itemId, status: f.status, note: f.note.trim() })),
          },
        }),
      });
      const body = await res.json().catch(() => null) as { ok?: boolean; version?: number; code?: string; message?: string } | null;
      if (!res.ok || !body?.ok) {
        if (body?.code === 'VERSION_CONFLICT') setConflict(true);
        throw new Error(body?.message ?? 'Review tidak tersimpan.');
      }
      reviewId.current = crypto.randomUUID();
      setReviewer('');
      setReviewNote('');
      setMessage(`✔ Review tersimpan sebagai revisi ${body.version}.`);
      await load();
    } catch (err) {
      setMessage(`✖ ${err instanceof Error ? err.message : 'Review tidak tersimpan.'}`);
    }
    setSaving(false);
  }

  if (loading && !detail) return <main><p role="status">Memuat detail…</p></main>;
  if (error && !detail) return <main><p className="status error" role="alert">{error}</p><button type="button" onClick={() => void load()}>Coba lagi</button></main>;
  if (!detail) return null;
  const items = new Map((detail.checklist?.templateSnapshot?.items ?? []).map((item) => [item.id, item.label]));
  const object = detail.location?.object;
  const point = object && Number.isFinite(object.latitude) && Number.isFinite(object.longitude)
    ? { latitude: object.latitude, longitude: object.longitude, method: 'saved_location' as const, accuracyM: null, capturedAt: detail.observedAt ?? '', savedLocation: null }
    : null;
  const storedPhotos = detail.photos.filter((p) => p.status === 'stored');

  return (
    <main>
      <h1>Detail inspeksi</h1>
      <p><Link href="/riwayat">← Riwayat</Link></p>
      <section className="history-card" aria-label="Ringkasan inspeksi">
        <h2>{areaLabel(detail.areaId)}{detail.subArea ? ` — ${detail.subArea}` : ''}</h2>
        <p className="hint">Petugas {detail.inspectorName || '—'} · observasi {time(detail.observedAt)} · diterima {time(detail.receivedAt)}</p>
        <p className="hint">Status {detail.status === 'submitted' ? 'Terkirim' : 'Belum selesai'} · revisi {detail.version} · template {detail.templateVersion || '—'} · {storedPhotos.length} foto tersimpan{detail.checklist?.reviewRequired ? ' · perlu review' : ''}</p>
        {detail.note && <p>Catatan kondisi: {detail.note}</p>}
      </section>
      {object && <section aria-label="Lokasi objek">
        <h2>Lokasi objek</h2>
        <p className="hint">WGS84 {object.latitude}, {object.longitude}{object.utm ? ` · UTM ${object.utm.datum} zona ${object.utm.zone}${object.utm.hemisphere} (${object.utm.crs}) E ${object.utm.easting.toFixed(3)} N ${object.utm.northing.toFixed(3)}` : ''}</p>
        <LocationMap observer={null} point={point} disabled onPin={() => {}} readOnly />
      </section>}
      {detail.checklist && <section aria-label="Checklist terisi">
        <h2>Checklist dan temuan</h2>
        {(detail.checklist.answers ?? []).map((answer, index) => {
          const label = items.get(answer.itemId) ?? answer.itemId;
          const linked = (answer.finding ? answer.finding.photoIds.map((photoId) => detail.photoManifest.findIndex((m) => m.photoId === photoId) + 1) : []).filter((n) => n > 0);
          return <article key={answer.itemId} className="checklist-item">
            <h3>{index + 1}. {label}</h3>
            <p className="hint">{ANSWER_LABEL[answer.answer ?? ''] ?? 'Tidak dijawab'}</p>
            {answer.finding && <>
              <p><strong>{answer.finding.type}</strong> — {answer.finding.description}</p>
              {linked.length > 0 && <p className="hint">Foto terkait: {linked.map((n) => `Foto ${n}`).join(', ')}</p>}
              {answer.finding.noPhotoReason && <p className="hint">Tanpa foto: {answer.finding.noPhotoReason}</p>}
              {answer.finding.measurement && <p className="hint">Pengukuran {answer.finding.measurement.value} {answer.finding.measurement.unit} ({answer.finding.measurement.method})</p>}
            </>}
          </article>;
        })}
      </section>}
      {storedPhotos.length > 0 && <section aria-label="Foto inspeksi">
        <h2>Foto tersimpan</h2>
        <div className="photo-list">
          {storedPhotos.map((photo) => {
            const index = detail.photoManifest.findIndex((m) => m.photoId === photo.photoId) + 1;
            return <figure key={photo.photoId} className="photo-card">
              <figcaption>Foto {index > 0 ? index : '—'} {photo.caption ? `— ${photo.caption}` : ''} <span className="hint">{photo.size ? `${Math.max(1, Math.round(photo.size / 1024))} KB` : ''}</span></figcaption>
              <img src={`/api/inspections/${detail.inspectionId}/photos/${photo.photoId}`} alt={`Foto ${index > 0 ? index : ''} inspeksi`} className="photo-thumb" loading="lazy" />
            </figure>;
          })}
        </div>
      </section>}
      <section aria-label="Review inspeksi">
        <h2>Review dan tindak lanjut</h2>
        {detail.status !== 'submitted'
          ? <p className="hint">Review tersedia setelah inspeksi berstatus Terkirim.</p>
          : <>
            <p className="hint">Terakhir dimuat revisi {detail.version}. Reviewer memakai nama manual; review bukan identitas login dan tidak menetapkan ambang geoteknik.</p>
            <form onSubmit={(e) => void saveReview(e)}>
              <label htmlFor="reviewer-name">Nama reviewer</label>
              <input id="reviewer-name" value={reviewer} maxLength={100} required onChange={(e) => setReviewer(e.target.value)} />
              <label htmlFor="review-note">Catatan review (opsional)</label>
              <textarea id="review-note" value={reviewNote} maxLength={2000} onChange={(e) => setReviewNote(e.target.value)} />
              {(detail.checklist?.answers ?? []).filter((a) => a.answer === 'finding').map((answer) => {
                const state = findings[answer.itemId] ?? { status: 'open' as const, note: '' };
                return <fieldset key={answer.itemId} className="checklist-item review-item">
                  <legend>{items.get(answer.itemId) ?? answer.itemId}</legend>
                  <label htmlFor={`review-status-${answer.itemId}`}>Tindak lanjut</label>
                  <select id={`review-status-${answer.itemId}`} value={state.status} onChange={(e) => setFindings({ ...findings, [answer.itemId]: { ...state, status: e.target.value as 'open' | 'closed' } })}>
                    <option value="open">Belum selesai</option>
                    <option value="closed">Ditutup</option>
                  </select>
                  <label htmlFor={`review-finding-note-${answer.itemId}`}>Catatan temuan (opsional)</label>
                  <input id={`review-finding-note-${answer.itemId}`} value={state.note} maxLength={500} onChange={(e) => setFindings({ ...findings, [answer.itemId]: { ...state, note: e.target.value } })} />
                </fieldset>;
              })}
              <div className="photo-actions">
                <button type="submit" disabled={saving || !reviewer.trim()}>{saving ? 'Menyimpan…' : 'Simpan review'}</button>
                {conflict && <button type="button" onClick={() => void load()}>Muat versi terbaru</button>}
              </div>
            </form>
          </>}
        {message && <p className={`status ${message.startsWith('✔') ? 'ok' : 'error'}`} role="status">{message}</p>}
        {detail.reviews.length > 0 && <section aria-label="Riwayat review">
          <h3>Riwayat review</h3>
          <ul>
            {[...detail.reviews].reverse().map((entry) => (
              <li key={entry.reviewId}>
                <p><strong>{entry.reviewerName}</strong> · {time(entry.reviewedAt)} · revisi {entry.version}</p>
                {entry.note && <p className="hint">{entry.note}</p>}
                {entry.findings.length > 0 && <p className="hint">{entry.findings.map((f) => `${items.get(f.itemId) ?? f.itemId}: ${f.status === 'closed' ? 'ditutup' : 'belum selesai'}${f.note ? ` — ${f.note}` : ''}`).join('; ')}</p>}
              </li>
            ))}
          </ul>
        </section>}
      </section>
    </main>
  );
}
