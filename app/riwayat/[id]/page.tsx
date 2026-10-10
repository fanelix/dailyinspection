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
const ANSWER_LOOK: Record<string, [string, string]> = { no_finding: ['var(--ok-ink)', 'ic-check-circle'], finding: ['var(--warn-ink)', 'ic-alert-triangle'], not_inspected: ['var(--ink-muted)', 'ic-minus'], not_applicable: ['var(--ink-muted)', 'ic-circle'] };
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
  const [shown, setShown] = useState<Record<string, boolean>>({}); // foto dibaca hanya saat diminta (hemat data)
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

  if (loading && !detail) return <main><p className="status" role="status">Memuat detail inspeksi…</p></main>;
  if (error && !detail) return <main><p className="status error" role="alert">✖ {error}</p><div className="photo-actions"><Link className="button secondary" href="/riwayat">Ke Riwayat</Link><button type="button" onClick={() => void load()}>Coba lagi</button></div></main>;
  if (!detail) return null;
  const items = new Map((detail.checklist?.templateSnapshot?.items ?? []).map((item) => [item.id, item.label]));
  const object = detail.location?.object;
  const point = object && Number.isFinite(object.latitude) && Number.isFinite(object.longitude)
    ? { latitude: object.latitude, longitude: object.longitude, method: 'saved_location' as const, accuracyM: null, capturedAt: detail.observedAt ?? '', savedLocation: null }
    : null;
  const storedPhotos = detail.photos.filter((p) => p.status === 'stored');

  const latest = (itemId: string) => {
    for (let i = detail.reviews.length - 1; i >= 0; i--) { const f = detail.reviews[i].findings.find((x) => x.itemId === itemId); if (f) return f.status; }
    return 'open';
  };
  const findingCount = (detail.checklist?.answers ?? []).filter((a) => a.answer === 'finding');
  const openCount = findingCount.filter((a) => latest(a.itemId) === 'open').length;

  return (
    <main>
      <Link className="button ghost" href="/riwayat"><i className="ic ic-sm ic-arrow-left" aria-hidden="true" />Riwayat inspeksi</Link>
      <section className="title-row" aria-label="Ringkasan inspeksi">
        <h1>{areaLabel(detail.areaId)}{detail.subArea ? ` — ${detail.subArea}` : ''}</h1>
        <p className="meta" style={{ flexBasis: '100%', marginTop: 0 }}>
          {detail.status === 'submitted'
            ? <span className="badge ok"><i className="ic ic-sm ic-check-circle" aria-hidden="true" />Terkirim</span>
            : <span className="badge warn"><i className="ic ic-sm ic-clock" aria-hidden="true" />Belum selesai</span>}
          <span><i className="ic ic-sm ic-calendar" aria-hidden="true" />Observasi {time(detail.observedAt)}</span>
          <span><i className="ic ic-sm ic-user" aria-hidden="true" />{detail.inspectorName || '—'}</span>
          <span>Revisi {detail.version}</span>
          <span>Template <span className="mono">{detail.templateVersion || '—'}</span></span>
        </p>
        <p className="hint">Diterima {time(detail.receivedAt)} · {storedPhotos.length} foto tersimpan{detail.checklist?.reviewRequired ? ' · perlu review' : ''}</p>
        {detail.note && <p style={{ flexBasis: '100%', margin: 0 }}>Catatan kondisi: {detail.note}</p>}
      </section>
      <div className="kpis">
        <div className="kpi"><span className={`tile ${openCount ? 'gold' : ''}`}><i className={`ic ${openCount ? 'ic-alert-triangle' : 'ic-check-circle'}`} aria-hidden="true" /></span><span><strong>{openCount} / {findingCount.length}</strong><small>Temuan belum selesai</small></span></div>
        <div className="kpi"><span className="tile"><i className="ic ic-comment" aria-hidden="true" /></span><span><strong>{detail.reviews.length}</strong><small>Review</small></span></div>
      </div>
      <div className="form-cols"><div>
      {detail.checklist && <section className="panel" aria-labelledby="checklist-title">
        <h2 id="checklist-title">Checklist dan temuan</h2>
        {(detail.checklist.answers ?? []).map((answer, index) => {
          const label = items.get(answer.itemId) ?? answer.itemId;
          const linked = (answer.finding ? answer.finding.photoIds.map((photoId) => detail.photoManifest.findIndex((m) => m.photoId === photoId) + 1) : []).filter((n) => n > 0);
          const [tone, icon] = ANSWER_LOOK[answer.answer ?? ''] ?? ['var(--ink-muted)', 'ic-circle'];
          return <article key={answer.itemId} className="checklist-item">
            <h3><span className="num">{index + 1}</span>{label}</h3>
            <div className="answer-detail">
              <p className="meta" style={{ color: tone, fontSize: 16, fontWeight: 500 }}><span><i className={`ic ic-sm ${icon}`} aria-hidden="true" />{ANSWER_LABEL[answer.answer ?? ''] ?? 'Tidak dijawab'}</span>
                {answer.finding && (latest(answer.itemId) === 'closed'
                  ? <span className="badge ok"><i className="ic ic-sm ic-check-circle" aria-hidden="true" />Ditutup</span>
                  : <span className="badge warn"><i className="ic ic-sm ic-clock" aria-hidden="true" />Belum selesai</span>)}</p>
              {answer.finding && <>
                <p style={{ margin: '8px 0 0' }}><strong>{answer.finding.type}</strong> — {answer.finding.description}</p>
                {linked.length > 0 && <p className="hint">Foto terkait: {linked.map((n) => `Foto ${n}`).join(', ')}</p>}
                {answer.finding.noPhotoReason && <p className="hint">Perlu review · tanpa foto: {answer.finding.noPhotoReason}</p>}
                {answer.finding.measurement && <p className="hint">Pengukuran <span className="mono">{answer.finding.measurement.value} {answer.finding.measurement.unit}</span> ({answer.finding.measurement.method})</p>}
              </>}
            </div>
          </article>;
        })}
      </section>}
      <section className="panel" aria-labelledby="review-title">
        <h2 id="review-title">Review dan tindak lanjut</h2>
        {detail.status !== 'submitted'
          ? <p className="hint">Review tersedia setelah inspeksi berstatus Terkirim.</p>
          : <>
            <p className="hint">Terakhir dimuat revisi {detail.version}. Reviewer memakai nama manual; review bukan identitas login dan tidak menetapkan ambang geoteknik.</p>
            <form onSubmit={(e) => void saveReview(e)}>
              <label htmlFor="reviewer-name">Nama reviewer</label>
              <input id="reviewer-name" value={reviewer} maxLength={100} required onChange={(e) => setReviewer(e.target.value)} />
              <label htmlFor="review-note">Catatan review (opsional)</label>
              <textarea id="review-note" value={reviewNote} maxLength={2000} onChange={(e) => setReviewNote(e.target.value)} />
              {findingCount.map((answer) => {
                const state = findings[answer.itemId] ?? { status: 'open' as const, note: '' };
                const set = (status: 'open' | 'closed') => setFindings({ ...findings, [answer.itemId]: { ...state, status } });
                return <fieldset key={answer.itemId} className="finding" style={{ border: 0 }}>
                  <legend className="sr-only">{items.get(answer.itemId) ?? answer.itemId}</legend>
                  <h3 aria-hidden="true">{items.get(answer.itemId) ?? answer.itemId}</h3>
                  <fieldset className="seg two">
                    <legend>Status temuan</legend>
                    <label className="warn"><input type="radio" name={`review-status-${answer.itemId}`} checked={state.status === 'open'} onChange={() => set('open')} /><i className="ic ic-sm ic-alert-triangle" aria-hidden="true" />Terbuka</label>
                    <label className="ok"><input type="radio" name={`review-status-${answer.itemId}`} checked={state.status === 'closed'} onChange={() => set('closed')} /><i className="ic ic-sm ic-check-circle" aria-hidden="true" />Ditutup</label>
                  </fieldset>
                  <label htmlFor={`review-finding-note-${answer.itemId}`}>Catatan temuan (opsional)</label>
                  <input id={`review-finding-note-${answer.itemId}`} value={state.note} maxLength={500} onChange={(e) => setFindings({ ...findings, [answer.itemId]: { ...state, note: e.target.value } })} />
                </fieldset>;
              })}
              <div className="photo-actions">
                <button type="submit" disabled={saving || !reviewer.trim()}>{saving ? 'Menyimpan…' : 'Simpan review'}</button>
                {conflict && <button type="button" className="secondary" onClick={() => void load()}><i className="ic ic-sync" aria-hidden="true" />Muat versi terbaru</button>}
              </div>
            </form>
          </>}
        {message && <p className={`status ${message.startsWith('✔') ? 'ok' : conflict ? 'warn' : 'error'}`} role="status">{message}</p>}
      </section>
      </div><div>
      {object && <section className="panel" aria-labelledby="location-title">
        <h2 id="location-title">Lokasi objek</h2>
        <LocationMap observer={null} point={point} disabled onPin={() => {}} readOnly />
        <dl>
          <div><dt><i className="ic ic-sm ic-map-pin" aria-hidden="true" />Posisi objek</dt><dd className="mono">WGS84 {object.latitude}, {object.longitude}</dd></div>
          {object.utm && <div><dt>UTM</dt><dd className="mono">{object.utm.datum} zona {object.utm.zone}{object.utm.hemisphere} ({object.utm.crs}) E {object.utm.easting.toFixed(3)} N {object.utm.northing.toFixed(3)}</dd></div>}
        </dl>
      </section>}
      <section className="panel" aria-labelledby="photo-title">
        <h2 id="photo-title">Foto <small>{storedPhotos.length} tersimpan</small></h2>
        {storedPhotos.length === 0 ? <p className="hint">Inspeksi ini tidak punya foto tersimpan.</p> : <div className="gallery">
          {storedPhotos.map((photo) => {
            const index = detail.photoManifest.findIndex((m) => m.photoId === photo.photoId) + 1;
            const name = `Foto ${index > 0 ? index : '—'}`;
            return <figure key={photo.photoId}>
              {shown[photo.photoId]
                ? <img src={`/api/inspections/${detail.inspectionId}/photos/${photo.photoId}`} alt={`${name} inspeksi`} />
                : <div className="placeholder"><i className="ic ic-camera" aria-hidden="true" /></div>}
              <figcaption>{name}{photo.caption ? ` — ${photo.caption}` : ''}{photo.size ? ` · ${Math.max(1, Math.round(photo.size / 1024))} KB` : ''}</figcaption>
              {!shown[photo.photoId] && <button type="button" className="secondary" aria-label={`Baca ${name}`} onClick={() => setShown({ ...shown, [photo.photoId]: true })}>Baca foto</button>}
            </figure>;
          })}
        </div>}
      </section>
      <section className="panel" aria-labelledby="history-title">
        <h2 id="history-title">Riwayat review</h2>
        {detail.reviews.length === 0 ? <p className="hint">Belum ada review untuk inspeksi ini.</p> : <ul className="rows">
          {[...detail.reviews].reverse().map((entry) => (
            <li key={entry.reviewId} className="row">
              <strong>{entry.reviewerName}</strong>
              <p className="mono" style={{ margin: '4px 0 0', color: 'var(--ink-muted)' }}>{time(entry.reviewedAt)} · revisi {entry.version}</p>
              {entry.note && <p style={{ margin: '8px 0 0' }}>{entry.note}</p>}
              {entry.findings.length > 0 && <p className="hint">{entry.findings.map((f) => `${items.get(f.itemId) ?? f.itemId}: ${f.status === 'closed' ? 'ditutup' : 'belum selesai'}${f.note ? ` — ${f.note}` : ''}`).join('; ')}</p>}
            </li>
          ))}
        </ul>}
      </section>
      </div></div>
    </main>
  );
}
