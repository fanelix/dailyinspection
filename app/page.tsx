'use client';

// T4: many photos, immutable retries, and server-verified finalization. Offline drafts remain T5.
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { compressPhoto, sha256Hex } from '../lib/photos.ts';
import { CHECKLISTS, emptyAnswers, parseChecklist } from '../lib/inspection.ts';
import type { ChecklistAnswer } from '../lib/inspection.ts';
import ChecklistFields from '../components/ChecklistFields.tsx';
import { submitInspection } from '../lib/submission.ts';
import type { SubmissionAttempt } from '../lib/submission.ts';
import LocationPicker from '../components/LocationPicker.tsx';
import { parseLocation } from '../lib/location.ts';
import type { InspectionLocation } from '../lib/location.ts';

const TRIES = 3; // usulan rencana §9: tiga percobaan dengan jeda bertambah
const BACKOFF_MS = 1000;
const REQUEST_TIMEOUT_MS = 90_000; // usulan; ukur di staging
const JSON_HEADERS = { 'content-type': 'application/json' };

class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Terjadi kesalahan');

// Mengulang hanya bila hasil belum diketahui (jaringan/timeout) atau server menandai retryable.
// Permintaan invalid (4xx) tidak diulang. ID tidak pernah dibuat ulang saat mengulang.
async function api(path: string, init: RequestInit) {
  for (let attempt = 1; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(path, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      // jaringan putus atau timeout: hasil belum diketahui
    }
    const body = res ? await res.json().catch(() => null) : null;
    if (res?.ok) return body;
    const retryable = res === null || body?.retryable === true;
    if (!retryable || attempt >= TRIES) {
      throw new ApiError(res?.status ?? 0, body?.code ?? 'NETWORK', body?.message ?? 'Tidak ada respons dari server');
    }
    await sleep(BACKOFF_MS * 2 ** (attempt - 1));
  }
}

type Status = { kind: 'idle' | 'busy' | 'ok' | 'error'; text: string };

// Salinan kerja foto yang sudah dikompres; checksum dan ID dihitung dari byte ini, bukan dari file asli.
type Prepared = { id: string; bytes: ArrayBuffer; sha256: string; previewUrl: string; caption: string };
const MAX_PHOTOS = 5; // usulan §8, sama dengan gateway

const size = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`;

function InspectionForm({ onNew }: { onNew: () => void }) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [areaId, setAreaId] = useState('');
  const [subArea, setSubArea] = useState('');
  const [answers, setAnswers] = useState<ChecklistAnswer[]>([]);
  const [location, setLocation] = useState<InspectionLocation | null>(null);
  const [locationDirty, setLocationDirty] = useState(false);
  const [photos, setPhotos] = useState<Prepared[]>([]);
  const [photoMsg, setPhotoMsg] = useState<Status>({ kind: 'idle', text: '' });
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: '' });
  const [locked, setLocked] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverPhoto, setServerPhoto] = useState<number | null>(null);
  const [readBack, setReadBack] = useState('');
  const attempt = useRef<(SubmissionAttempt & { key: string }) | null>(null);
  const previews = useRef<Prepared[]>([]);
  useEffect(() => { previews.current = photos; }, [photos]);
  useEffect(() => () => { previews.current.forEach(p => URL.revokeObjectURL(p.previewUrl)); }, []);

  // Decode sequentially. A bad batch leaves previously selected photos and finding links intact.
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    if (photos.length + files.length > MAX_PHOTOS) return setPhotoMsg({ kind: 'error', text: `Maksimal ${MAX_PHOTOS} foto. Pilihan sebelumnya tetap tersedia.` });
    const added: Prepared[] = [];
    setPhotoMsg({ kind: 'busy', text: 'Menyiapkan foto…' });
    try {
      for (const file of files) {
        const out = await compressPhoto(file), bytes = await out.blob.arrayBuffer();
        const sha256 = await sha256Hex(bytes);
        added.push({ id: crypto.randomUUID(), bytes, sha256, previewUrl: URL.createObjectURL(out.blob), caption: '' });
      }
      setPhotos([...photos, ...added]);
      setPhotoMsg({ kind: 'ok', text: `✔ ${photos.length + added.length} foto siap. Foto asli di galeri tetap tersedia.` });
    } catch (err) {
      added.forEach(p => URL.revokeObjectURL(p.previewUrl));
      setPhotoMsg({ kind: 'error', text: `✖ ${errorText(err)} Pilihan sebelumnya tetap tersedia.` });
    }
  }

  function removePhoto(photo: Prepared) {
    URL.revokeObjectURL(photo.previewUrl);
    setPhotos(photos.filter(p => p.id !== photo.id));
    setAnswers(answers.map(a => a.finding ? { ...a, finding: { ...a.finding, photoIds: a.finding.photoIds.filter(id => id !== photo.id) } } : a));
    setPhotoMsg({ kind: 'idle', text: '' }); setStatus({ kind: 'idle', text: '' });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitted) return;
    if (!name.trim()) return setStatus({ kind: 'error', text: '✖ Isi nama petugas.' });
    setStatus({ kind: 'busy', text: 'Menyiapkan…' });
    try {
      if (!location) throw new Error('Pilih dan konfirmasi lokasi objek sebelum mengirim.');
      const confirmedLocation = parseLocation(location, areaId);
      const key = JSON.stringify([name.trim(), note, areaId, subArea.trim(), answers, photos.map(p => [p.id, p.sha256, p.caption.trim()]), confirmedLocation]);
      if (attempt.current?.key !== key) {
        const photoIds = photos.map(() => crypto.randomUUID());
        const checklist = parseChecklist({ schemaVersion: CHECKLISTS.schemaVersion, templateVersion: CHECKLISTS.templateVersion, areaId, subArea, photoIds,
          answers: answers.map(a => a.finding ? { ...a, finding: { ...a.finding,
            photoIds: a.finding.photoIds.map(id => photoIds[photos.findIndex(p => p.id === id)]) } } : a) });
        const preparedPhotos = photos.map((p, i) => ({ photoId: photoIds[i], sha256: p.sha256, size: p.bytes.byteLength, caption: p.caption.trim(), bytes: p.bytes }));
        const photoManifest = preparedPhotos.map(({ bytes: _bytes, ...metadata }) => metadata);
        const hashJson = (v: unknown) => sha256Hex(new TextEncoder().encode(JSON.stringify(v)).buffer);
        attempt.current = { key, photos: preparedPhotos,
          payload: { submissionVersion: 1, inspectionId: crypto.randomUUID(), inspectorName: name.trim(), note, observedAt: new Date().toISOString(), photoIds, photoManifest, ...checklist, location: confirmedLocation },
          checklistSha256: await hashJson(checklist), locationSha256: await hashJson(confirmedLocation), photoManifestSha256: await hashJson(photoManifest),
        };
      }
      // Freeze before the first request: even an unknown prepare result must retry the same IDs/content.
      setLocked(true);
      const done = await submitInspection(attempt.current, api, text => setStatus({ kind: 'busy', text }));
      setSubmitted(true);
      setStatus({ kind: 'ok', text: `✔ Inspeksi terkirim dan difinalisasi di server. ${photos.length} foto tersimpan.${done.reviewRequired ? ' Perlu review: ada temuan tanpa foto.' : ''}` });
      if (photos.length) setServerPhoto(0);
    } catch (err) {
      // This code proves no inspection was written. An outdated gateway may follow an earlier
      // successful/unknown request or rollback, so it must keep the same attempt on retry.
      if (err instanceof ApiError && err.code === 'LOCATION_CHANGED') {
        setLocked(false); attempt.current = null;
      }
      const unknown = err instanceof ApiError && (err.status === 0 || err.status === 504);
      setStatus({ kind: 'error', text: unknown
        ? '✖ Hasil pengiriman belum diketahui. Tekan Kirim lagi dengan isian yang sama untuk melanjutkan tanpa duplikasi.'
        : `✖ ${errorText(err)}${attempt.current ? ' Isian dan foto tetap tersedia di halaman ini untuk dicoba lagi.' : ''}` });
    }
  }

  const busy = status.kind === 'busy' || photoMsg.kind === 'busy';
  return (
    <form onSubmit={submit} onChange={() => { if (!locked) setStatus({ kind: 'idle', text: '' }); }}>
      <p className="notice">Checklist usulan untuk review engineer site. Isian belum tersimpan bila halaman ditutup sebelum berhasil dikirim.</p>
      <fieldset className="form-fields" disabled={busy || locked}>
      <label htmlFor="name">Nama petugas</label>
      <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
      <p className="hint">Ketik nama petugas yang melakukan inspeksi.</p>
      <label htmlFor="area">Area inspeksi</label>
      <select id="area" value={areaId} required onChange={e => {
        if ((answers.some(a => a.answer !== null) || subArea.trim() || locationDirty) && !window.confirm('Ganti area dan kosongkan lokasi, sub-area serta jawaban checklist area sebelumnya?')) return;
        setAreaId(e.target.value); setSubArea(''); setAnswers(emptyAnswers(e.target.value)); setLocation(null); setLocationDirty(false);
      }}>
        <option value="">Pilih area…</option>
        {CHECKLISTS.areas.map(area => <option key={area.id} value={area.id}>{area.label}</option>)}
      </select>
      <label htmlFor="sub-area">Sub-area / detail lokasi (opsional)</label>
      <input id="sub-area" value={subArea} onChange={e => setSubArea(e.target.value)} maxLength={200} disabled={!areaId} aria-describedby="sub-area-hint" />
      <p id="sub-area-hint" className="hint">Isi nama blok, bench, sektor, atau bagian lokasi di dalam area yang dipilih.</p>
      {areaId && <LocationPicker key={areaId} areaId={areaId} value={location} disabled={busy || locked} onChange={next => {
        setLocation(next); setLocationDirty(true); setStatus({ kind: 'idle', text: '' });
      }} />}
      <label htmlFor="note">Catatan kondisi</label>
      <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      <label htmlFor="photo">Tambah foto inspeksi (maksimal 5; opsional)</label>
      <input id="photo" type="file" accept="image/*" multiple onChange={pick} disabled={photos.length >= MAX_PHOTOS} />
      <p className="hint">Pilih dari kamera atau galeri. Foto dikecilkan otomatis; tandai foto yang sesuai untuk setiap temuan.</p>
      {photoMsg.text && <p className={`status ${photoMsg.kind}`} role="status">{photoMsg.text}</p>}
      <div className="photo-list">
        {photos.map((photo, i) => <section className="photo-card" key={photo.id} aria-label={`Foto ${i + 1}`}>
          <h3>Foto {i + 1} <span className="hint">{size(photo.bytes.byteLength)}</span></h3>
          <img src={photo.previewUrl} alt={`Pratinjau foto ${i + 1}`} className="photo-thumb" />
          <label htmlFor={`caption-${photo.id}`}>Keterangan foto {i + 1} (opsional)</label>
          <input id={`caption-${photo.id}`} value={photo.caption} maxLength={500} onChange={e => setPhotos(photos.map(p => p.id === photo.id ? { ...p, caption: e.target.value } : p))} />
          <button type="button" onClick={() => removePhoto(photo)}>Hapus foto {i + 1}</button>
        </section>)}
      </div>
      <ChecklistFields areaId={areaId} answers={answers} photos={photos.map((p, i) => ({ id: p.id, label: `Foto ${i + 1}${p.caption.trim() ? ` — ${p.caption.trim()}` : ''}` }))} onChange={setAnswers} />
      {areaId && <p className="hint">{CHECKLISTS.notice} Pelaporan mendesak tetap melalui saluran komunikasi site.</p>}
      </fieldset>
      {locked && <p className="hint">Isian dikunci untuk menjaga kiriman ulang tetap sama. Jangan tutup halaman saat pengiriman belum dikonfirmasi.</p>}
      <button type="submit" disabled={busy || submitted}>Kirim</button>
      {status.text && (
        <p className={`status ${status.kind}`} role="status">
          {status.text}
        </p>
      )}
      {submitted && photos.length > 0 && <section aria-label="Foto dari server">
        <h2>Foto tersimpan</h2>
        <div className="photo-actions">{photos.map((p, i) => <button type="button" key={p.id} onClick={() => { setServerPhoto(i); setReadBack(''); }}>Baca foto {i + 1}</button>)}</div>
        {serverPhoto !== null && attempt.current && <img
          key={serverPhoto} src={`/api/inspections/${attempt.current.payload.inspectionId}/photos/${attempt.current.photos[serverPhoto].photoId}`}
          alt={`Foto ${serverPhoto + 1} yang dibaca kembali dari server`}
          onLoad={() => setReadBack('✔ Foto berhasil dibaca kembali dari server.')}
          onError={() => setReadBack('✖ Foto tersimpan tetapi gagal dibaca kembali.')}
        />}
        {readBack && <p role="status">{readBack}</p>}
      </section>}
      {locked && <button type="button" disabled={busy} onClick={() => {
        if (!submitted && !window.confirm('Mulai inspeksi baru? Kiriman sebelumnya belum dikonfirmasi selesai dan isian di halaman ini akan dikosongkan.')) return;
        onNew();
      }}>Mulai inspeksi baru</button>}
      <p className="hint">Template usulan {CHECKLISTS.templateVersion}</p>
    </form>
  );
}

export default function Home() {
  const [formKey, setFormKey] = useState(0);
  return (
    <main>
      <h1>Inspeksi Geoteknik Harian</h1>
      <InspectionForm key={formKey} onNew={() => setFormKey(k => k + 1)} />
    </main>
  );
}
