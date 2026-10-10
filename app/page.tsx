'use client';

// T5: durable form/photo snapshots and foreground queue; server protocol stays T4.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ChangeEvent, FormEvent } from 'react';
import { compressPhoto, sha256Hex } from '../lib/photos.ts';
import { CHECKLISTS, emptyAnswers } from '../lib/inspection.ts';
import type { ChecklistAnswer } from '../lib/inspection.ts';
import ChecklistFields from '../components/ChecklistFields.tsx';
import { copyDraft as saveCopy, DraftConflict, draftError, listDrafts, makeAttempt, newDraft, openDrafts, readDraft, saveDraft, sendQueue } from '../lib/drafts.ts';
import type { Draft, DraftForm, DraftPhoto, DraftSummary } from '../lib/drafts.ts';
import LocationPicker from '../components/LocationPicker.tsx';
import OfflineReady from '../components/OfflineReady.tsx';

const TRIES = 3; // usulan rencana §9: tiga percobaan dengan jeda bertambah
const BACKOFF_MS = 1000;
const REQUEST_TIMEOUT_MS = 90_000; // usulan; ukur di staging

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
type Prepared = DraftPhoto & { previewUrl: string };
const MAX_PHOTOS = 5; // usulan §8, sama dengan gateway

const size = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`;

function InspectionForm({ db, initial, drafts, onSaved, onOpen }: { db: IDBDatabase; initial: Draft; drafts: DraftSummary[]; onSaved: () => Promise<void>; onOpen: (draft: Draft) => void }) {
  const [draft, setDraft] = useState(initial);
  const working = useRef(initial), revision = useRef(initial.revision), saves = useRef(Promise.resolve(initial));
  const savedForm = useRef(initial.form), savedPhotos = useRef(initial.photos), conflict = useRef(false);
  const [storage, setStorage] = useState<Status>({ kind: 'ok', text: '✔ Draft dipulihkan dari perangkat.' });
  const [photoMsg, setPhotoMsg] = useState<Status>({ kind: 'idle', text: '' });
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: initial.lastError });
  const [serverPhoto, setServerPhoto] = useState<number | null>(null);
  const [readBack, setReadBack] = useState('');
  const [previews, setPreviews] = useState<Record<string,string>>({});
  const urls = useRef<Record<string,string>>({});
  const { name, note, areaId, subArea, answers, location, locationDirty } = draft.form;
  const locked = draft.phase !== 'draft', submitted = draft.phase === 'submitted';
  const photos: Prepared[] = draft.photos.map(p => ({ ...p, previewUrl: previews[p.id] ?? '' }));
  function edit(change: Partial<Draft>) {
    const next = { ...working.current, ...change }; working.current = next; setDraft(next);
    setStorage({kind:'busy',text:'Isian berubah; menunggu penyimpanan…'});
  }
  function updateForm(change: Partial<DraftForm>) { edit({form:{...working.current.form,...change}}); }
  const setName = (name: string) => updateForm({name}), setNote = (note: string) => updateForm({note});
  const setSubArea = (subArea: string) => updateForm({subArea}), setAnswers = (answers: ChecklistAnswer[]) => updateForm({answers});
  const setPhotos = (photos: DraftPhoto[]) => edit({photos:photos.map(({id,bytes,sha256,caption})=>({id,bytes,sha256,caption}))});
  async function persist() {
    const operation = async () => {
      if (conflict.current) throw new DraftConflict();
      const snapshot = working.current;
      if (snapshot.revision > 0 && snapshot.form === savedForm.current && snapshot.photos === savedPhotos.current) return snapshot;
      const saved = await saveDraft(db, {...snapshot,revision:revision.current}, revision.current);
      revision.current = saved.revision; savedForm.current = snapshot.form; savedPhotos.current = snapshot.photos;
      working.current = {...working.current,revision:saved.revision,updatedAt:saved.updatedAt}; setDraft(working.current);
      setStorage({kind:'ok',text:`✔ Draft dan ${snapshot.photos.length} foto tersimpan di perangkat (${new Date(saved.updatedAt).toLocaleTimeString('id-ID')}).`});
      await onSaved(); return saved;
    };
    const pending = saves.current.then(operation,operation); saves.current = pending;
    try { return await pending; } catch (err) { conflict.current = err instanceof DraftConflict; setStorage({kind:'error',text:draftError(err)}); throw err; }
  }
  useEffect(() => {
    if (draft.form === savedForm.current && draft.photos === savedPhotos.current) return;
    const timer = setTimeout(() => { void persist().catch(()=>{}); }, 500);
    return () => clearTimeout(timer);
  }, [draft.form,draft.photos]);
  useEffect(() => {
    const next: Record<string,string> = {};
    for (const p of draft.photos) next[p.id] = urls.current[p.id] ?? URL.createObjectURL(new Blob([p.bytes],{type:'image/jpeg'}));
    for (const [id,url] of Object.entries(urls.current)) if (!(id in next)) URL.revokeObjectURL(url);
    urls.current = next; setPreviews(next);
  }, [draft.photos]);
  useEffect(() => () => { Object.values(urls.current).forEach(url=>URL.revokeObjectURL(url)); }, []);
  useEffect(() => {
    const warning = (e: BeforeUnloadEvent) => { if (working.current.form !== savedForm.current || working.current.photos !== savedPhotos.current) e.preventDefault(); };
    window.addEventListener('beforeunload',warning); return () => window.removeEventListener('beforeunload',warning);
  }, []);
  async function open(id?: string) {
    try { await persist(); const next = id ? await readDraft(db,id) : await saveDraft(db,newDraft(),0); await onSaved(); onOpen(next); }
    catch (err) { setStorage({kind:'error',text:draftError(err)}); }
  }
  async function loadCurrent() {
    try { onOpen(await readDraft(db,draft.id)); } catch (err) { setStorage({kind:'error',text:draftError(err)}); }
  }
  async function copyDraft() {
    if (working.current.phase !== 'draft') return;
    try { const copy = await saveCopy(db,working.current); await onSaved(); onOpen(copy); }
    catch (err) { setStorage({kind:'error',text:draftError(err)}); }
  }
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
        added.push({ id: crypto.randomUUID(), bytes, sha256, previewUrl: '', caption: '' });
      }
      setPhotos([...photos, ...added]);
      setPhotoMsg({ kind: 'ok', text: `✔ ${photos.length + added.length} foto siap. Foto asli di galeri tetap tersedia.` });
    } catch (err) {
      setPhotoMsg({ kind: 'error', text: `✖ ${errorText(err)} Pilihan sebelumnya tetap tersedia.` });
    }
  }

  function removePhoto(photo: Prepared) {
    setPhotos(photos.filter(p => p.id !== photo.id));
    setAnswers(answers.map(a => a.finding ? { ...a, finding: { ...a.finding, photoIds: a.finding.photoIds.filter(id => id !== photo.id) } } : a));
    setPhotoMsg({ kind: 'idle', text: '' }); setStatus({ kind: 'idle', text: '' });
  }

  async function send(records?: DraftSummary[], defer = false) {
    if (!navigator.locks) { setStatus({kind:'error',text:'Browser belum mendukung pengiriman aman antar-tab. Draft tetap tersimpan; gunakan Chrome terbaru.'}); return; }
    setStatus({kind:'busy',text:'Menyiapkan antrean…'});
    try {
      await persist();
      await navigator.locks.request('dailyinspection-send', {ifAvailable:true}, async lock => {
        if (!lock) throw new Error('Pengiriman berjalan di tab lain. Tunggu, lalu muat versi tersimpan.');
        const updateRecord = (record: Draft) => {
          if (record.id !== draft.id) return;
          working.current=record;revision.current=record.revision;savedForm.current=record.form;savedPhotos.current=record.photos;setDraft(record);
          if(record.phase === 'draft') onOpen(record);
        };
        if (defer) {
          const current=await readDraft(db,draft.id);
          if(current.revision !== revision.current) throw new DraftConflict();
          const attempt=await makeAttempt(current);
          updateRecord(await saveDraft(db,{...current,attempt,phase:'queued',lastError:''},current.revision));
        } else {
          await sendQueue(db,records ?? [{id:draft.id,revision:revision.current}],api,text=>setStatus({kind:'busy',text}),updateRecord);
        }
        await onSaved();
        setStorage({kind:'ok',text:'✔ Snapshot pengiriman tersimpan di perangkat.'});
        setStatus({kind:'ok',text:defer ? '✔ Kiriman disimpan dalam antrean. Tekan Kirim yang tertunda saat ada jaringan.' : '✔ Inspeksi terkirim dan difinalisasi di server. Acknowledgment tersimpan di perangkat.'});
      });
    } catch (err) {
      if (err instanceof DraftConflict) { conflict.current=true;setStorage({kind:'error',text:draftError(err)}); }
      // The durable record is authoritative after a failed/unknown request. Never create replacement UUIDs.
      try {
        const latest=await readDraft(db,draft.id);
        if (latest.phase === 'queued' && !conflict.current) {
          working.current=latest;revision.current=latest.revision;savedForm.current=latest.form;savedPhotos.current=latest.photos;setDraft(latest);
        }
        await onSaved();
      } catch { /* Leave the in-memory copy and durable queue intact if storage becomes unavailable. */ }
      setStatus({kind:'error',text:`✖ ${errorText(err)} Kiriman yang sudah masuk antrean memakai ID yang sama saat dicoba lagi.`});
    }
  }
  async function submit(e: FormEvent) { e.preventDefault(); if (!submitted) await send(); }

  const busy = status.kind === 'busy' || photoMsg.kind === 'busy';
  const phaseBadge = { draft: ['', 'ic-file-text', 'Draft'], queued: ['warn', 'ic-clock', 'Menunggu kirim'], submitted: ['ok', 'ic-check-circle', 'Terkirim'] } as const;
  return (
    <section className="draft-home">
      <section className="panel drafts-panel" aria-labelledby="drafts-title">
        <h2 id="drafts-title">Draft di perangkat</h2>
        <div className="kpis">
          <div className="kpi"><span className="tile gold"><i className="ic ic-clock" aria-hidden="true" /></span><span><strong>{drafts.filter(d=>d.phase !== 'submitted').length}</strong><small>Belum terkirim</small></span></div>
          <div className="kpi"><span className="tile"><i className="ic ic-camera" aria-hidden="true" /></span><span><strong>{drafts.reduce((n,d)=>n+d.photoCount,0)}</strong><small>Foto lokal</small></span></div>
        </div>
        <p className="hint">Draft hanya tersedia pada browser dan alamat aplikasi ini.</p>
        <div className="photo-actions"><button type="button" disabled={busy} onClick={()=>void open()}><i className="ic ic-plus" aria-hidden="true" />Mulai inspeksi baru</button>
        <button type="button" className="secondary" disabled={busy || !drafts.some(d=>d.phase==='queued')} onClick={()=>void send(drafts.filter(d=>d.phase==='queued'))}><i className="ic ic-sync" aria-hidden="true" />Kirim yang tertunda</button></div>
        <ul className="rows">{drafts.map(d=>{ const [tone,icon,text]=phaseBadge[d.phase]; return <li key={d.id}><button type="button" className="row" disabled={busy || d.id === draft.id} onClick={()=>void open(d.id)}>
          <span className="row-title">{d.label}{d.id === draft.id ? ' (sedang dibuka)' : ''}</span>
          <span className="meta"><span className={`badge ${tone}`}><i className={`ic ic-sm ${icon}`} aria-hidden="true" />{text}</span><span><i className="ic ic-sm ic-camera" aria-hidden="true" />{d.photoCount} foto lokal</span></span>
        </button></li>; })}</ul>
      </section>
    <form onSubmit={submit} onChange={() => { if (!locked) setStatus({ kind: 'idle', text: '' }); }}>
      <fieldset className="form-fields" disabled={busy || locked}>
      <div className="form-cols"><div>
      <section className="panel" aria-labelledby="who-title">
      <h2 id="who-title">Petugas dan area</h2>
      <p className="notice">Checklist usulan untuk review engineer site. Tunggu status “tersimpan di perangkat” sebelum menutup halaman. Data browser dapat terhapus oleh pengguna atau OS; ini bukan backup permanen.</p>
      <label htmlFor="name">Nama petugas</label>
      <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
      <p className="hint">Ketik nama petugas yang melakukan inspeksi.</p>
      <label htmlFor="area">Area inspeksi</label>
      <select id="area" value={areaId} required onChange={e => {
        if ((answers.some(a => a.answer !== null) || subArea.trim() || locationDirty) && !window.confirm('Ganti area dan kosongkan lokasi, sub-area serta jawaban checklist area sebelumnya?')) return;
        updateForm({areaId:e.target.value,subArea:'',answers:emptyAnswers(e.target.value),location:null,rawLocation:null,locationDirty:false});
      }}>
        <option value="">Pilih area…</option>
        {CHECKLISTS.areas.map(area => <option key={area.id} value={area.id}>{area.label}</option>)}
      </select>
      <label htmlFor="sub-area">Sub-area / detail lokasi (opsional)</label>
      <input id="sub-area" value={subArea} onChange={e => setSubArea(e.target.value)} maxLength={200} disabled={!areaId} aria-describedby="sub-area-hint" />
      <p id="sub-area-hint" className="hint">Isi nama blok, bench, sektor, atau bagian lokasi di dalam area yang dipilih.</p>
      </section>
      <ChecklistFields areaId={areaId} answers={answers} photos={photos.map((p, i) => ({ id: p.id, label: `Foto ${i + 1}${p.caption.trim() ? ` — ${p.caption.trim()}` : ''}` }))} onChange={setAnswers} />
      </div><div>
      {areaId && <LocationPicker key={areaId} db={db} raw={draft.form.rawLocation} onDraftChange={raw=>{ if (JSON.stringify(working.current.form.rawLocation)!==JSON.stringify(raw) && !locked) updateForm({rawLocation:raw}); }} areaId={areaId} value={location} disabled={busy || locked} onChange={next => {
        updateForm({location:next,locationDirty:true}); setStatus({ kind: 'idle', text: '' });
      }} />}
      <section className="panel" aria-labelledby="photo-title">
      <h2 id="photo-title">Foto <small>{photos.length} dari {MAX_PHOTOS}</small></h2>
      <div className="photo-actions">
        <label className="button secondary file-button"><i className="ic ic-camera" aria-hidden="true" />Ambil foto<input type="file" accept="image/*" capture="environment" onChange={pick} disabled={photos.length >= MAX_PHOTOS} /></label>
        <label className="button secondary file-button"><i className="ic ic-plus" aria-hidden="true" />Dari galeri<input id="photo" type="file" accept="image/*" multiple onChange={pick} disabled={photos.length >= MAX_PHOTOS} /></label>
      </div>
      <p className="hint">Maksimal {MAX_PHOTOS} foto, opsional. Foto dikecilkan otomatis dan tetap di perangkat sampai terkirim; tandai foto yang sesuai untuk setiap temuan.</p>
      {photoMsg.text && <p className={`status ${photoMsg.kind}`} role="status">{photoMsg.text}</p>}
      {photos.map((photo, i) => <section className="photo-card" key={photo.id} aria-label={`Foto ${i + 1}`}>
        <h3>Foto {i + 1} <span className="hint">{size(photo.bytes.byteLength)}</span></h3>
        <img src={photo.previewUrl || undefined} alt={`Pratinjau foto ${i + 1}`} className="photo-thumb" />
        <div>
          <label htmlFor={`caption-${photo.id}`}>Keterangan foto {i + 1} (opsional)</label>
          <input id={`caption-${photo.id}`} value={photo.caption} maxLength={500} onChange={e => setPhotos(photos.map(p => p.id === photo.id ? { ...p, caption: e.target.value } : p))} />
          <button type="button" className="secondary" onClick={() => removePhoto(photo)}><i className="ic ic-sm ic-x-circle" aria-hidden="true" />Hapus foto {i + 1}</button>
        </div>
      </section>)}
      </section>
      <section className="panel" aria-labelledby="note-title">
      <h2 id="note-title">Catatan</h2>
      <label htmlFor="note">Catatan kondisi</label>
      <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Cuaca, kondisi permukaan, aktivitas di sekitar" />
      </section>
      </div></div>
      </fieldset>
      {locked && <p className="hint">Isian dikunci dalam antrean agar kiriman ulang tetap sama. Foto dan UUID dipulihkan saat aplikasi dibuka kembali. Pengiriman berjalan selama aplikasi aktif.</p>}
      {storage.kind === 'error' && <div className="photo-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>void loadCurrent()}>Muat versi tersimpan</button>{!locked && <button type="button" disabled={busy} onClick={()=>void copyDraft()}>Simpan salinan baru</button>}</div>}
      {status.text && (
        <p className={`status ${status.kind}`} role="status">
          {status.text}
        </p>
      )}
      {submitted && draft.attempt && draft.attempt.payload.photoIds.length > 0 && <section className="panel" aria-label="Foto dari server" style={{ marginTop: 16 }}>
        <h2>Foto tersimpan</h2>
        <div className="photo-actions">{draft.attempt.payload.photoIds.map((id,i)=><button type="button" className="secondary" key={id} onClick={()=>{setServerPhoto(i);setReadBack('');}}>Baca foto {i+1}</button>)}</div>
        {serverPhoto !== null && <img key={serverPhoto} src={`/api/inspections/${draft.id}/photos/${draft.attempt.payload.photoIds[serverPhoto]}`} alt={`Foto ${serverPhoto+1} yang dibaca kembali dari server`} style={{ marginTop: 12, maxWidth: '100%' }} onLoad={()=>setReadBack('✔ Foto berhasil dibaca kembali dari server.')} onError={()=>setReadBack('✖ Foto tersimpan tetapi gagal dibaca kembali.')} />}
        {readBack && <p role="status">{readBack}</p>}
      </section>}
      <p className="hint">Template usulan {CHECKLISTS.templateVersion}</p>
      <div className="actionbar">
        <p className={`status draft-storage ${storage.kind}`} role="status">{storage.text}</p>
        <button type="button" className="secondary" disabled={busy || submitted} onClick={()=>void persist().catch(()=>{})}>Simpan draft sekarang</button>
        <button type="button" className="secondary" disabled={busy || locked} onClick={()=>void send(undefined,true)}>Simpan untuk dikirim nanti</button>
        <button type="submit" disabled={busy || submitted}><i className="ic ic-sync" aria-hidden="true" />Kirim</button>
      </div>
    </form>
    </section>
  );
}

export default function Home() {
  const [db,setDb]=useState<IDBDatabase|null>(null),[active,setActive]=useState<Draft|null>(null),[drafts,setDrafts]=useState<DraftSummary[]>([]),[error,setError]=useState('');
  const [opening,setOpening]=useState(0),[generation,setGeneration]=useState(0);
  useEffect(()=>{
    let closed=false,connection:IDBDatabase|null=null;
    void (async()=>{
      try {
        connection=await openDrafts();const existing=await listDrafts(connection);
        const id=existing.find(d=>d.phase!=='submitted')?.id ?? existing[0]?.id;
        const initial=id ? await readDraft(connection,id) : await saveDraft(connection,newDraft(),0);
        if (closed) {connection.close();return;}
        setDb(connection);setActive(initial);setDrafts(await listDrafts(connection));setError('');
      } catch(err) {if(!closed)setError(draftError(err));}
    })();
    return ()=>{closed=true;connection?.close();};
  },[opening]);
  return <main>
    <div className="title-row">
      <h1>Inspeksi Geoteknik Harian</h1>
      <Link className="button secondary" href="/riwayat"><i className="ic ic-file-text" aria-hidden="true" />Riwayat inspeksi<i className="ic ic-sm ic-chevron-right" aria-hidden="true" /></Link>
      <p className="hint">Catat observasi visual. Aplikasi tidak menilai kestabilan lereng.</p>
    </div>
    <div className="home">
    {db && <OfflineReady db={db} />}
    {error ? <><p className="status error" role="alert">{error}</p><button onClick={()=>setOpening(n=>n+1)}>Coba penyimpanan lagi</button></> : !db || !active ? <p className="status" role="status">Memulihkan draft perangkat…</p> : <InspectionForm key={`${active.id}:${generation}`} db={db} initial={active} drafts={drafts} onSaved={async()=>setDrafts(await listDrafts(db))} onOpen={record=>{setGeneration(n=>n+1);setActive(record);}} />}
    </div>
  </main>;
}
