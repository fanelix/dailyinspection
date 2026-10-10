import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openDrafts, readDrafts, saveDraft, makeAttempt, sendDraft } from '../lib/drafts.ts';
import { emptyAnswers, CHECKLISTS } from '../lib/inspection.ts';
import { sha256Hex } from '../lib/photos.ts';

const fresh = async () => openDrafts(new IDBFactory());
const sample = () => ({version:1,id:crypto.randomUUID(),revision:0,templateVersion:CHECKLISTS.templateVersion,updatedAt:'',phase:'draft',lastError:'',attempt:null,form:{name:'Petugas sintetis',areaId:'pit',subArea:'Bench uji',note:'',answers:emptyAnswers('pit').map(a=>({...a,answer:'not_inspected'})),location:{version:1,crs:'EPSG:4326',observerGps:null,object:{latitude:-2,longitude:117,method:'manual_coordinates',accuracyM:null,capturedAt:'2026-10-10T00:00:00.000Z',savedLocation:null}},rawLocation:null,locationDirty:true},photos:[]});
function server(attempt,{lost=false}={}) {
  const hashes = {checklistSha256:attempt.checklistSha256,locationSha256:attempt.locationSha256,photoManifestSha256:attempt.photoManifestSha256};
  return async(path,init)=> {
    if (path.endsWith('/finalize')) {if(lost)throw Error('respons hilang');return {...hashes,inspectionId:attempt.payload.inspectionId,reviewRequired:attempt.payload.reviewRequired,status:'submitted',version:2,photos:attempt.photos.map(p=>({...p,status:'stored'}))};}
    if (init.method==='PUT') {const p=attempt.photos.find(p=>path.endsWith(p.photoId));return {inspectionId:attempt.payload.inspectionId,photoId:p.photoId,status:'stored',sha256:p.sha256,size:p.size};}
    return {...hashes,...attempt.payload,status:'uploading',version:1,photos:attempt.photos.map(p=>({photoId:p.photoId,status:'reserved'}))};
  };
}
test('form and exact photo bytes survive closing and reopening the database',async()=>{
  const factory=new IDBFactory(),db=await openDrafts(factory),d=sample();
  const bytes=Uint8Array.from([255,216,255,0,1,255,217]).buffer;
  d.photos=[{id:crypto.randomUUID(),bytes,sha256:await sha256Hex(bytes),caption:'Foto uji'}];
  const saved=await saveDraft(db,d,0); db.close();
  const reopened=await openDrafts(factory),[restored]=await readDrafts(reopened);
  assert.deepEqual(restored,saved);assert.deepEqual(new Uint8Array(restored.photos[0].bytes),new Uint8Array(bytes)); reopened.close();
});
test('compare and set rejects stale tab without overwriting the newer draft',async()=>{
  const db=await fresh(),d=await saveDraft(db,sample(),0);
  const outcomes=await Promise.allSettled([saveDraft(db,{...d,form:{...d.form,note:'Tab A'}},d.revision),saveDraft(db,{...d,form:{...d.form,note:'Tab B'}},d.revision)]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(outcomes.find(r=>r.status==='rejected').reason.code,'DRAFT_CONFLICT');
  assert.equal((await readDrafts(db))[0].revision,2);db.close();
});
test('a failed transaction never acknowledges a save or overwrites the previous record',async()=>{
  const db=await fresh(),d=await saveDraft(db,sample(),0),original=db.transaction.bind(db);
  db.transaction=(...args)=>{const tx=original(...args);queueMicrotask(()=>tx.abort());return tx;};
  await assert.rejects(saveDraft(db,{...d,form:{...d.form,note:'Belum aman'}},d.revision));
  db.transaction=original;assert.equal((await readDrafts(db))[0].form.note,'');db.close();
});
test('raw UTM inputs and unfinished measurements retain their exact partial state',async()=>{
  const db=await fresh(),d=sample();d.form.location=null;d.form.rawLocation={easting:'50000',northing:'',zone:'50',hemisphere:'S',datum:'ID74',coordinateMode:'utm',latitude:'',longitude:'',observer:null,point:null,selected:''};
  d.form.answers[0]={itemId:'cracks',answer:'finding',finding:{type:'retakan',description:'belum selesai',photoIds:[],noPhotoReason:'',measurement:{value:NaN,unit:'mm',parameter:'lebar',method:'manual',source:'',measuredAt:'',reference:''}}};
  const stored=await saveDraft(db,d,0),[restored]=await readDrafts(db);assert.deepEqual(restored,stored);assert.ok(Number.isNaN(restored.form.answers[0].finding.measurement.value));db.close();
});
test('send commits immutable UUIDs before the first request and keeps bytes after a lost final response',async()=>{
  const db=await fresh(),d=sample(),bytes=Uint8Array.from([255,216,255,217]).buffer;d.photos=[{id:crypto.randomUUID(),bytes,sha256:await sha256Hex(bytes),caption:'foto'}];
  const saved=await saveDraft(db,d,0),attempt=await makeAttempt(saved);
  let calls=0;const api=server(attempt,{lost:true});
  await assert.rejects(sendDraft(db,{...saved,attempt},async(...args)=>{const [durable]=await readDrafts(db);assert.equal(durable.phase,'queued');assert.deepEqual(durable.attempt,attempt);calls++;return api(...args);}),/respons hilang/);
  assert.equal(calls,3);const [queued]=await readDrafts(db);assert.equal(queued.attempt.payload.inspectionId,attempt.payload.inspectionId);assert.equal(queued.photos[0].bytes.byteLength,4);
  const completed=await sendDraft(db,queued,server(attempt));assert.equal(completed.phase,'submitted');assert.equal(completed.attempt.payload.inspectionId,attempt.payload.inspectionId);assert.equal(completed.photos.length,0);assert.equal(completed.attempt.photos.length,0);db.close();
});
test('failed durable save prevents every network request',async()=>{
  const db=await fresh(),d=await saveDraft(db,sample(),0);db.close();let calls=0;
  await assert.rejects(sendDraft(db,d,async()=>{calls++;return null;}));assert.equal(calls,0);
});
test('changed local photo bytes cannot enter a queued attempt',async()=>{
  const d=sample();d.photos=[{id:crypto.randomUUID(),bytes:new ArrayBuffer(4),sha256:'0'.repeat(64),caption:''}];
  await assert.rejects(makeAttempt(d),/foto/i);
});

test('master cache keeps verified snapshots and summary listing does not retain photo bytes',async()=>{
  const {masterData,listDrafts,readDraft}=await import('../lib/drafts.ts');const db=await fresh(),d=await saveDraft(db,sample(),0);
  const cache={areaId:'pit',locations:[],updatedAt:'2026-10-10T00:00:00.000Z'};await masterData(db,'pit',cache);assert.deepEqual(await masterData(db,'pit'),cache);
  const [summary]=await listDrafts(db);assert.equal(summary.id,d.id);assert.equal(summary.photos,undefined);assert.deepEqual(await readDraft(db,d.id),d);db.close();
});

test('UI receives the durable queued snapshot before any request even when later storage reads fail',async()=>{
 const db=await fresh(),d=await saveDraft(db,sample(),0);let frozen=null;
 await assert.rejects(sendDraft(db,d,async()=>{assert.equal(frozen.phase,'queued');throw Error('network lost');},()=>{},queued=>{frozen=queued;}),/network lost/);
 assert.equal(frozen.attempt.payload.inspectionId,d.id);db.close();
});

test('copying a stale draft remaps photo links and refuses a source already queued in another tab',async()=>{
 const {copyDraft}=await import('../lib/drafts.ts');const db=await fresh(),d=sample(),id=crypto.randomUUID(),bytes=new ArrayBuffer(4);
 d.photos=[{id,bytes,sha256:await sha256Hex(bytes),caption:'foto'}];d.form.answers[0]={itemId:'cracks',answer:'finding',finding:{type:'uji',description:'sintetis',photoIds:[id],noPhotoReason:null,measurement:null}};
 const saved=await saveDraft(db,d,0),copy=await copyDraft(db,saved);assert.notEqual(copy.id,saved.id);assert.notEqual(copy.photos[0].id,id);assert.equal(copy.form.answers[0].finding.photoIds[0],copy.photos[0].id);
 await saveDraft(db,{...saved,phase:'queued',attempt:await makeAttempt(saved)},saved.revision);await assert.rejects(copyDraft(db,saved),/antrean/);db.close();
});

test('a stale form cannot send after another tab saves changes',async()=>{
 const db=await fresh(),saved=await saveDraft(db,sample(),0);await saveDraft(db,{...saved,form:{...saved.form,note:'Versi baru'}},saved.revision);
 let calls=0;await assert.rejects(sendDraft(db,saved,async()=>{calls++;return null;}),{code:'DRAFT_CONFLICT'});assert.equal(calls,0);db.close();
});
test('unsupported draft versions reject listing without deleting stored bytes',async()=>{
 const {listDrafts}=await import('../lib/drafts.ts');const db=await fresh(),saved=await saveDraft(db,sample(),0);
 await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({...saved,version:99});tx.oncomplete=resolve;tx.onabort=reject;});
 await assert.rejects(listDrafts(db),/tidak didukung/);db.close();
});

test('LOCATION_CHANGED on queued B reopens only B and preserves unknown queued A',async()=>{
 const {sendQueue}=await import('../lib/drafts.ts');const db=await fresh();
 const a=sample(),b=sample();a.attempt=await makeAttempt(a);b.attempt=await makeAttempt(b);a.phase=b.phase='queued';
 const qa=await saveDraft(db,a,0),qb=await saveDraft(db,b,0);let visible=qa;
 await assert.rejects(sendQueue(db,[{id:qb.id,revision:qb.revision}],async()=>{throw Object.assign(Error('master berubah'),{code:'LOCATION_CHANGED'});},()=>{},record=>{if(record.id===qa.id)visible=record;}),/master berubah/);
 const rows=await readDrafts(db),ra=rows.find(r=>r.id===qa.id),rb=rows.find(r=>r.id===qb.id);
 assert.deepEqual(ra,qa);assert.deepEqual(visible,qa);assert.equal(rb.phase,'draft');assert.equal(rb.attempt,null);assert.equal(rb.form.location,null);db.close();
});
