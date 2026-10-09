'use client';

// T2: checklist berversi; memakai jalur foto T1 (maksimal satu foto pada form ini).
// Tanpa aktivasi perangkat (keputusan pengguna 2026-10-09). Kompresi foto ditarik maju dari T4.
// Belum ada draft offline (T5), finalisasi (T4), lokasi/peta (T3).
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { compressPhoto, sha256Hex } from '../lib/photos.ts';
import { CHECKLISTS, emptyAnswers, parseChecklist } from '../lib/inspection.ts';
import type { ChecklistAnswer } from '../lib/inspection.ts';
import ChecklistFields, { SELECTED_PHOTO } from '../components/ChecklistFields.tsx';

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
type Prepared = { bytes: ArrayBuffer; sha256: string; previewUrl: string };

const size = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`;

function InspectionForm() {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [areaId, setAreaId] = useState('');
  const [subArea, setSubArea] = useState('');
  const [answers, setAnswers] = useState<ChecklistAnswer[]>([]);
  const [photo, setPhoto] = useState<Prepared | null>(null);
  const [photoMsg, setPhotoMsg] = useState<Status>({ kind: 'idle', text: '' });
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: '' });
  const [photoUrl, setPhotoUrl] = useState('');
  const [readBack, setReadBack] = useState('');
  // ID dipertahankan selama isi formulir sama, sehingga menekan Kirim lagi = mengulang, bukan inspeksi baru.
  const attempt = useRef<{ key: string; inspectionId: string; photoId: string; observedAt: string } | null>(null);
  const pickToken = useRef(0);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
  }, [photo]);

  // Kompres saat dipilih (bukan saat Kirim): galat dan ukuran hasil langsung terlihat, dan hanya foto yang direset
  // bila gagal; nama dan catatan tetap utuh. Foto asli di galeri tidak disentuh.
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const token = ++pickToken.current;
    setPhoto(null);
    setAnswers(current => current.map(a => a.finding ? { ...a, finding: { ...a.finding, photoIds: [] } } : a));
    setPhotoUrl('');
    setReadBack('');
    if (!file) return setPhotoMsg({ kind: 'idle', text: '' });
    setPhotoMsg({ kind: 'busy', text: 'Menyiapkan foto…' });
    try {
      const out = await compressPhoto(file);
      const bytes = await out.blob.arrayBuffer();
      const sha256 = await sha256Hex(bytes);
      if (token !== pickToken.current) return; // pilihan yang lebih baru sudah menggantikan
      setPhoto({ bytes, sha256, previewUrl: URL.createObjectURL(out.blob) });
      setPhotoMsg({ kind: 'ok', text: `✔ Foto siap: ${out.width} × ${out.height} px, ${size(bytes.byteLength)} (asli ${size(file.size)}).` });
    } catch (err) {
      if (token === pickToken.current) setPhotoMsg({ kind: 'error', text: `✖ ${errorText(err)}` });
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPhotoUrl('');
    setReadBack('');
    if (!name.trim()) return setStatus({ kind: 'error', text: '✖ Isi nama petugas.' });
    setStatus({ kind: 'busy', text: 'Menyiapkan…' });
    try {
      const key = JSON.stringify([name.trim(), note, areaId, subArea.trim(), answers, photo?.sha256 ?? null]);
      if (attempt.current?.key !== key) {
        attempt.current = { key, inspectionId: crypto.randomUUID(), photoId: crypto.randomUUID(), observedAt: new Date().toISOString() };
      }
      const { inspectionId, photoId, observedAt } = attempt.current;
      const checklist = parseChecklist({ schemaVersion: CHECKLISTS.schemaVersion, templateVersion: CHECKLISTS.templateVersion, areaId, subArea,
        photoIds: photo ? [photoId] : [], answers: answers.map(a => a.finding ? { ...a, finding: { ...a.finding,
          photoIds: a.finding.photoIds.map(id => id === SELECTED_PHOTO ? photoId : id) } } : a) });
      const checklistSha256 = await sha256Hex(new TextEncoder().encode(JSON.stringify(checklist)).buffer);

      setStatus({ kind: 'busy', text: 'Menyimpan data inspeksi…' });
      const prepared = await api('/api/inspections', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ inspectionId, inspectorName: name, note, observedAt, photoIds: photo ? [photoId] : [], ...checklist }),
      });
      if (prepared?.schemaVersion !== CHECKLISTS.schemaVersion || prepared.templateVersion !== CHECKLISTS.templateVersion || prepared.checklistSha256 !== checklistSha256) {
        throw new Error('Server belum mengonfirmasi checklist yang sama. Data belum terverifikasi tersimpan; hubungi pengelola aplikasi.');
      }
      if (!photo) {
        setStatus({ kind: 'ok', text: `✔ Data dan checklist tersimpan di server tanpa foto.${checklist.reviewRequired ? ' Perlu review: ada temuan tanpa foto.' : ''} Inspeksi belum difinalisasi.` });
        return;
      }

      setStatus({ kind: 'busy', text: 'Mengunggah foto…' });
      const { bytes, sha256 } = photo;
      const url = `/api/inspections/${inspectionId}/photos/${photoId}`;
      const stored = await api(url, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-photo-sha256': sha256 }, body: bytes });
      // "Tersimpan" hanya bila server menyatakan stored DAN checksum yang dikembalikan sama dengan milik kita.
      if (stored?.status !== 'stored' || stored.sha256 !== sha256) throw new Error('Server tidak mengonfirmasi foto dengan checksum yang sama.');
      setPhotoUrl(url);
      setStatus({
        kind: 'ok',
        text: (stored.replayed
          ? '✔ Data dan foto sudah tersimpan di server (percobaan sebelumnya berhasil; tidak ada duplikat). Inspeksi belum difinalisasi.'
          : '✔ Data, checklist, dan foto tersimpan di server. Inspeksi belum difinalisasi.') + (checklist.reviewRequired ? ' Perlu review: ada temuan tanpa foto.' : ''),
      });
    } catch (err) {
      const unknown = err instanceof ApiError && (err.status === 0 || err.status === 504);
      setStatus({
        kind: 'error',
        text: unknown
          ? '✖ Hasil penyimpanan belum diketahui. Tekan Kirim lagi dengan isian yang sama untuk melanjutkan tanpa duplikasi.'
          : `✖ ${errorText(err)}`,
      });
    }
  }

  const busy = status.kind === 'busy' || photoMsg.kind === 'busy';
  return (
    <form onSubmit={submit} onChange={() => { setStatus({ kind: 'idle', text: '' }); setPhotoUrl(''); setReadBack(''); }}>
      <p className="notice">Checklist usulan untuk review engineer site. Isian belum tersimpan bila halaman ditutup sebelum berhasil dikirim.</p>
      <fieldset className="form-fields" disabled={busy}>
      <label htmlFor="name">Nama petugas</label>
      <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
      <p className="hint">Ketik nama petugas yang melakukan inspeksi.</p>
      <label htmlFor="area">Area inspeksi</label>
      <select id="area" value={areaId} required onChange={e => {
        if ((answers.some(a => a.answer !== null) || subArea.trim()) && !window.confirm('Ganti area dan kosongkan sub-area serta jawaban checklist area sebelumnya?')) return;
        setAreaId(e.target.value); setSubArea(''); setAnswers(emptyAnswers(e.target.value));
      }}>
        <option value="">Pilih area…</option>
        {CHECKLISTS.areas.map(area => <option key={area.id} value={area.id}>{area.label}</option>)}
      </select>
      <label htmlFor="sub-area">Sub-area / detail lokasi (opsional)</label>
      <input id="sub-area" value={subArea} onChange={e => setSubArea(e.target.value)} maxLength={200} disabled={!areaId} aria-describedby="sub-area-hint" />
      <p id="sub-area-hint" className="hint">Isi nama blok, bench, sektor, atau bagian lokasi di dalam area yang dipilih.</p>
      <label htmlFor="note">Catatan kondisi</label>
      <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      <label htmlFor="photo">Foto inspeksi (opsional; dikecilkan otomatis)</label>
      <input id="photo" type="file" accept="image/*" onChange={pick} />
      <p className="hint">Pilih dari kamera atau galeri, lalu tandai temuan yang ditunjukkan foto ini. Temuan lain memerlukan alasan tanpa foto.</p>
      {photoMsg.text && (
        <p className={`status ${photoMsg.kind}`} role="status">
          {photoMsg.text}
        </p>
      )}
      {photo && !photoUrl && <img src={photo.previewUrl} alt="Pratinjau foto yang akan dikirim" />}
      <ChecklistFields areaId={areaId} answers={answers} hasPhoto={photo !== null} onChange={setAnswers} />
      {areaId && <p className="hint">{CHECKLISTS.notice} Pelaporan mendesak tetap melalui saluran komunikasi site.</p>}
      <button type="submit" disabled={busy}>
        Kirim
      </button>
      </fieldset>
      {status.text && (
        <p className={`status ${status.kind}`} role="status">
          {status.text}
        </p>
      )}
      {photoUrl && (
        <>
          <img
            src={photoUrl}
            alt="Foto yang dibaca kembali dari server"
            onLoad={() => setReadBack('✔ Foto berhasil dibaca kembali dari server.')}
            onError={() => setReadBack('✖ Foto tersimpan tetapi gagal dibaca kembali.')}
          />
          {readBack && <p role="status">{readBack}</p>}
        </>
      )}
      <p className="hint">Template usulan {CHECKLISTS.templateVersion}</p>
    </form>
  );
}

export default function Home() {
  return (
    <main>
      <h1>Inspeksi Geoteknik Harian</h1>
      <InspectionForm />
    </main>
  );
}
