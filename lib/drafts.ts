import { CHECKLISTS, parseChecklist } from './inspection.ts';
import type { ChecklistAnswer } from './inspection.ts';
import { parseLocation } from './location.ts';
import type { GpsPoint, InspectionLocation, ObjectPoint, SavedLocation } from './location.ts';
import { sha256Hex } from './photos.ts';
import { submitInspection } from './submission.ts';
import type { SubmissionAttempt } from './submission.ts';

export type RawLocation = { observer: GpsPoint | null; point: ObjectPoint | null; latitude: string; longitude: string; coordinateMode: string; datum: string; zone: string; hemisphere: string; easting: string; northing: string; selected: string };
export type DraftPhoto = { id: string; bytes: ArrayBuffer; sha256: string; caption: string };
export type DraftForm = { name: string; note: string; areaId: string; subArea: string; answers: ChecklistAnswer[]; location: InspectionLocation | null; rawLocation: RawLocation | null; locationDirty: boolean };
export type Draft = {
  version: 1; id: string; revision: number; templateVersion: string; updatedAt: string;
  phase: 'draft' | 'queued' | 'submitted'; form: DraftForm; photos: DraftPhoto[];
  attempt: SubmissionAttempt | null; lastError: string;
  ack?: Awaited<ReturnType<typeof submitInspection>>;
};
export class DraftConflict extends Error {
  code = 'DRAFT_CONFLICT';
  constructor() { super('Draft berubah di tab lain. Isian di tab ini belum menimpa versi tersimpan. Muat versi tersimpan atau simpan salinan baru.'); }
}
export const draftError = (err: unknown) => err instanceof DraftConflict ? err.message :
  `Draft belum tersimpan. Penyimpanan perangkat mungkin penuh, ditolak, atau tidak tersedia. Jangan tutup halaman. ${err instanceof Error ? err.message : ''}`;
export function newDraft(): Draft {
  return { version: 1, id: crypto.randomUUID(), revision: 0, templateVersion: CHECKLISTS.templateVersion, updatedAt: '', phase: 'draft', lastError: '', attempt: null,
    form: { name: '', note: '', areaId: '', subArea: '', answers: [], location: null, rawLocation: null, locationDirty: false }, photos: [] };
}
export function openDrafts(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open('dailyinspection-drafts', 1);
    request.onupgradeneeded = () => { const db = request.result; db.createObjectStore('drafts', { keyPath: 'id' }); db.createObjectStore('masters', { keyPath: 'areaId' }); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Tutup tab aplikasi versi lama lalu coba lagi.'));
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); resolve(db); };
  });
}
function checkDraft(value: unknown): Draft {
  const d = value as Draft;
  if (!d || d.version !== 1 || !/^[0-9a-f-]{36}$/.test(d.id) || !Number.isSafeInteger(d.revision) || d.revision < 0 ||
    d.templateVersion !== CHECKLISTS.templateVersion || !['draft','queued','submitted'].includes(d.phase) || !d.form ||
    !['name','note','areaId','subArea'].every(k => typeof d.form[k as keyof DraftForm] === 'string') || !Array.isArray(d.form.answers) ||
    !Array.isArray(d.photos) || d.photos.length > 5 || d.photos.some(p => !p || typeof p.id !== 'string' || !(p.bytes instanceof ArrayBuffer) || p.bytes.byteLength > 2 * 1024 * 1024 || typeof p.caption !== 'string' || !/^[0-9a-f]{64}$/.test(p.sha256)) ||
    (d.phase !== 'draft' && (!d.attempt || d.attempt.payload.inspectionId !== d.id))) {
    throw new Error('Versi atau isi draft tidak didukung. Data lokal dipertahankan; jangan membersihkan data browser.');
  }
  return d;
}
export function readDrafts(db: IDBDatabase): Promise<Draft[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readonly'), request = tx.objectStore('drafts').getAll();
    tx.oncomplete = () => { try { resolve(request.result.map(checkDraft).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))); } catch (err) { reject(err); } };
    tx.onabort = () => reject(tx.error ?? new Error('Pembacaan draft dibatalkan.'));
  });
}
export type DraftSummary = Pick<Draft, 'id' | 'revision' | 'phase' | 'updatedAt'> & { label: string; photoCount: number };
// Cursor releases each binary snapshot after extracting its summary; the list does not retain all photos.
export function listDrafts(db: IDBDatabase): Promise<DraftSummary[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readonly'), request = tx.objectStore('drafts').openCursor(), summaries: DraftSummary[] = [];
    let validationError: unknown;
    request.onsuccess = () => { try { const cursor = request.result; if (!cursor) return; const d = checkDraft(cursor.value);
      summaries.push({ id: d.id, revision: d.revision, phase: d.phase, updatedAt: d.updatedAt, label: `${d.form.name || 'Belum ada nama'} — ${CHECKLISTS.areas.find(a => a.id === d.form.areaId)?.label || 'Belum ada area'}`, photoCount: d.photos.length }); cursor.continue();
    } catch (err) { validationError=err;tx.abort(); } };
    tx.oncomplete = () => resolve(summaries.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)));
    tx.onabort = () => reject(validationError ?? tx.error ?? new Error('Daftar draft tidak dapat dibaca.'));
  });
}
export function readDraft(db: IDBDatabase, id: string): Promise<Draft> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readonly'), request = tx.objectStore('drafts').get(id);
    tx.oncomplete = () => { try { resolve(checkDraft(request.result)); } catch (err) { reject(err); } };
    tx.onabort = () => reject(tx.error ?? new Error('Draft tidak dapat dibaca.'));
  });
}
export function copyDraft(db: IDBDatabase, source: Draft): Promise<Draft> {
  const ids = new Map(source.photos.map(p => [p.id,crypto.randomUUID()]));
  const copy: Draft = { ...source, id: crypto.randomUUID(), revision: 1, updatedAt: new Date().toISOString(), phase: 'draft', attempt: null, lastError: '',
    photos: source.photos.map(p => ({...p,id:ids.get(p.id)!})),
    form: {...source.form,answers:source.form.answers.map(a=>a.finding ? {...a,finding:{...a.finding,photoIds:a.finding.photoIds.map(id=>ids.get(id) ?? id)}} : a)} };
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),get=store.get(source.id);
    let queued=false;
    get.onsuccess=()=>{if(get.result?.phase !== 'draft'){queued=true;tx.abort();return;}store.add(copy);};
    tx.oncomplete=()=>resolve(copy);
    tx.onabort=()=>reject(queued ? new Error('Draft sudah masuk antrean atau terkirim di tab lain. Muat versi tersimpan sebelum melanjutkan.') : tx.error ?? new Error('Salinan belum tersimpan.'));
  });
}
// Read + revision check + write share one transaction. Resolve only on complete, never on request success.
export function saveDraft(db: IDBDatabase, draft: Draft, expectedRevision: number): Promise<Draft> {
  checkDraft(draft);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite'), store = tx.objectStore('drafts');
    let saved: Draft, conflict = false;
    const get = store.get(draft.id);
    get.onsuccess = () => {
      if ((get.result?.revision ?? 0) !== expectedRevision) { conflict = true; tx.abort(); return; }
      saved = { ...draft, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
      store.put(saved);
    };
    tx.oncomplete = () => resolve(saved);
    tx.onabort = () => reject(conflict ? new DraftConflict() : tx.error ?? new Error('Transaksi penyimpanan dibatalkan.'));
  });
}
export async function makeAttempt(draft: Draft): Promise<SubmissionAttempt> {
  if (draft.attempt) return draft.attempt;
  if (!draft.form.name.trim()) throw new Error('Isi nama petugas.');
  if (!draft.form.location) throw new Error('Pilih dan konfirmasi lokasi objek sebelum mengirim.');
  const location = parseLocation(draft.form.location, draft.form.areaId), photoIds = draft.photos.map(p => p.id);
  for (const p of draft.photos) if (await sha256Hex(p.bytes) !== p.sha256) throw new Error('Isi foto lokal berubah; kiriman ditahan.');
  const checklist = parseChecklist({ ...draft.form, schemaVersion: CHECKLISTS.schemaVersion, templateVersion: draft.templateVersion, photoIds });
  const photos = draft.photos.map(p => ({ photoId: p.id, sha256: p.sha256, size: p.bytes.byteLength, caption: p.caption.trim(), bytes: p.bytes }));
  const photoManifest = photos.map(({ bytes: _bytes, ...metadata }) => metadata);
  const hash = (v: unknown) => sha256Hex(new TextEncoder().encode(JSON.stringify(v)).buffer);
  return { payload: { submissionVersion: 1, inspectionId: draft.id, inspectorName: draft.form.name.trim(), note: draft.form.note, observedAt: new Date().toISOString(), photoIds, photoManifest, ...checklist, location },
    photos, checklistSha256: await hash(checklist), locationSha256: await hash(location), photoManifestSha256: await hash(photoManifest) };
}
// Caller holds the native Web Lock. A failed first commit makes zero requests.
export async function sendDraft(db: IDBDatabase, draft: Draft, api: Parameters<typeof submitInspection>[1], progress?: (text: string) => void, onQueued: (draft: Draft) => void = () => {}): Promise<Draft> {
  if (draft.phase === 'submitted') return draft;
  const attempt = await makeAttempt(draft);
  const queued = await saveDraft(db, { ...draft, attempt, phase: 'queued', lastError: '' }, draft.revision);
  onQueued(queued);
  const ack = await submitInspection(attempt, api, progress);
  // The final acknowledgment and clearing binary data commit atomically. Failure retains the queued attempt.
  return saveDraft(db, { ...queued, phase: 'submitted', ack, photos: [], attempt: { ...attempt, photos: [] } }, queued.revision);
}
export type CachedMasters = { areaId: string; locations: SavedLocation[]; updatedAt: string };
export function masterData(db: IDBDatabase, areaId: string, next?: CachedMasters): Promise<CachedMasters | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('masters', next ? 'readwrite' : 'readonly'), store = tx.objectStore('masters');
    const req = next ? store.put(next) : store.get(areaId);
    tx.oncomplete = () => resolve(next ?? req.result ?? null);
    tx.onabort = () => reject(tx.error ?? new Error('Daftar lokasi belum tersimpan.'));
  });
}

// The error belongs to the record being sent, never to whichever form happens to be open.
export async function sendQueue(db: IDBDatabase, entries: {id:string;revision:number}[], api: Parameters<typeof submitInspection>[1], progress: (text:string)=>void, onRecord: (draft:Draft)=>void) {
  for (const entry of entries) {
    let current=await readDraft(db,entry.id);
    if(current.revision !== entry.revision) throw new DraftConflict();
    try {
      current=await sendDraft(db,current,api,progress,queued=>{current=queued;onRecord(queued);});
      onRecord(current);
    } catch(err) {
      if(err instanceof Error && 'code' in err && err.code === 'LOCATION_CHANGED') {
        // This server code is emitted only before any inspection write. All other errors stay immutable.
        const reopened=await saveDraft(db,{...current,phase:'draft',attempt:null,form:{...current.form,location:null},lastError:err.message},current.revision);
        onRecord(reopened);
      }
      throw err;
    }
  }
}
