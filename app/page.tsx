'use client';

// T1: satu form minimal (satu foto) untuk membuktikan jalur aktivasi -> simpan -> unggah -> baca kembali.
// Kompresi foto ditarik maju dari T4. Belum ada draft offline (T5), finalisasi (T4), lokasi/peta (T3).
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { compressPhoto, sha256Hex } from '../lib/photos.ts';

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
async function api(path: string, init: RequestInit, tries = TRIES) {
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
    if (!retryable || attempt >= tries) {
      throw new ApiError(res?.status ?? 0, body?.code ?? 'NETWORK', body?.message ?? 'Tidak ada respons dari server');
    }
    await sleep(BACKOFF_MS * 2 ** (attempt - 1));
  }
}

type Status = { kind: 'idle' | 'busy' | 'ok' | 'error'; text: string };

function Activate({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: '' });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus({ kind: 'busy', text: 'Mengaktifkan…' });
    try {
      // tries=1: kode aktivasi sekali pakai, mengulang setelah respons hilang justru akan ditolak
      await api('/api/activate', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ code }) }, 1);
      onDone();
    } catch (err) {
      setStatus({ kind: 'error', text: `✖ ${errorText(err)}` });
    }
  }

  return (
    <form onSubmit={submit}>
      <p>Perangkat ini belum diaktivasi. Masukkan kode aktivasi dari admin.</p>
      <label htmlFor="code">Kode aktivasi</label>
      <input id="code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="characters" required />
      <button type="submit" disabled={status.kind === 'busy'}>
        Aktifkan perangkat
      </button>
      {status.text && (
        <p className={`status ${status.kind}`} role="status">
          {status.text}
        </p>
      )}
    </form>
  );
}

// Salinan kerja foto yang sudah dikompres; checksum dan ID dihitung dari byte ini, bukan dari file asli.
type Prepared = { bytes: ArrayBuffer; sha256: string; previewUrl: string };

const size = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`;

function InspectionForm({ onExpired }: { onExpired: () => void }) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
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
    if (!photo) return setStatus({ kind: 'error', text: '✖ Pilih satu foto dan tunggu sampai siap.' });
    const { bytes, sha256 } = photo;
    setStatus({ kind: 'busy', text: 'Menyiapkan…' });
    try {
      const key = [name.trim(), note, sha256].join('\n');
      if (attempt.current?.key !== key) {
        attempt.current = { key, inspectionId: crypto.randomUUID(), photoId: crypto.randomUUID(), observedAt: new Date().toISOString() };
      }
      const { inspectionId, photoId, observedAt } = attempt.current;

      setStatus({ kind: 'busy', text: 'Menyimpan data inspeksi…' });
      await api('/api/inspections', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ inspectionId, inspectorName: name, note, observedAt, photoIds: [photoId] }),
      });

      setStatus({ kind: 'busy', text: 'Mengunggah foto…' });
      const url = `/api/inspections/${inspectionId}/photos/${photoId}`;
      const stored = await api(url, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-photo-sha256': sha256 }, body: bytes });
      // "Tersimpan" hanya bila server menyatakan stored DAN checksum yang dikembalikan sama dengan milik kita.
      if (stored?.status !== 'stored' || stored.sha256 !== sha256) throw new Error('Server tidak mengonfirmasi foto dengan checksum yang sama.');
      setPhotoUrl(url);
      setStatus({
        kind: 'ok',
        text: stored.replayed
          ? '✔ Data dan foto sudah tersimpan di server (percobaan sebelumnya berhasil; tidak ada duplikat). Inspeksi belum difinalisasi.'
          : '✔ Data dan foto tersimpan di server. Inspeksi belum difinalisasi.',
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onExpired();
      const unknown = err instanceof ApiError && (err.status === 0 || err.status === 504);
      setStatus({
        kind: 'error',
        text: unknown
          ? '✖ Belum diketahui apakah foto tersimpan. Tekan Kirim lagi: ID yang sama dipakai, hasilnya tidak akan terduplikasi.'
          : `✖ ${errorText(err)}`,
      });
    }
  }

  const busy = status.kind === 'busy' || photoMsg.kind === 'busy';
  return (
    <form onSubmit={submit}>
      <label htmlFor="name">Nama petugas</label>
      <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
      <label htmlFor="note">Catatan kondisi</label>
      <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      <label htmlFor="photo">Foto (kamera atau galeri; dikecilkan otomatis)</label>
      <input id="photo" type="file" accept="image/*" onChange={pick} required />
      {photoMsg.text && (
        <p className={`status ${photoMsg.kind}`} role="status">
          {photoMsg.text}
        </p>
      )}
      {photo && !photoUrl && <img src={photo.previewUrl} alt="Pratinjau foto yang akan dikirim" />}
      <button type="submit" disabled={busy}>
        Kirim
      </button>
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
    </form>
  );
}

export default function Home() {
  const [session, setSession] = useState<'checking' | 'none' | 'active' | 'unknown'>('checking');

  useEffect(() => {
    fetch('/api/session')
      .then((r) => setSession(r.ok ? 'active' : r.status === 401 ? 'none' : 'unknown'))
      .catch(() => setSession('unknown'));
  }, []);

  return (
    <main>
      <h1>Inspeksi Geoteknik Harian</h1>
      {session === 'checking' && <p>Memeriksa perangkat…</p>}
      {session === 'unknown' && <p className="status error">✖ Tidak bisa memeriksa sesi perangkat. Periksa koneksi lalu muat ulang.</p>}
      {session === 'none' && <Activate onDone={() => setSession('active')} />}
      {session === 'active' && <InspectionForm onExpired={() => setSession('none')} />}
    </main>
  );
}
