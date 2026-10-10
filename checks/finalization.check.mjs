import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createFakeAppsScript, startFakeGateway } from './fake-apps-script.mjs';
import { emptyAnswers } from '../lib/inspection.ts';
import { POST } from '../app/api/inspections/route.ts';
const plain=v=>JSON.parse(JSON.stringify(v));
const hash=v=>createHash('sha256').update(v).digest('hex');
const setup=()=>createFakeAppsScript({secret:'g'.repeat(48)});
const at='2026-10-10T02:00:00.000Z';
function body(n=2){
  const bytes=Array.from({length:n},(_,i)=>Buffer.from([255,216,255,224,i,255,217]));
  const photoManifest=bytes.map((b,i)=>({photoId:randomUUID(),sha256:hash(b),size:b.length,caption:i===0?'=keterangan sintetis':''}));
  return {bytes,payload:{submissionVersion:1,inspectionId:randomUUID(),inspectorName:'Uji T4 sintetis',note:'',observedAt:at,photoIds:photoManifest.map(p=>p.photoId),photoManifest,schemaVersion:2,templateVersion:'2026-10-09.draft1',areaId:'pit',answers:emptyAnswers('pit').map(a=>({...a,answer:'not_inspected'})),location:{version:1,crs:'EPSG:4326',observerGps:null,object:{latitude:1,longitude:2,method:'manual_coordinates',accuracyM:null,capturedAt:at,savedLocation:null}}}};
}
const rec=(s,row=1)=>Object.fromEntries(s.rows[0].map((c,i)=>[c,s.rows[row][i]??'']));
const prepare=(fake,p)=>fake.run('prepareCompleteInspection')(p);
const upload=(fake,p,b,i)=>fake.run('uploadPhoto')({inspectionId:p.inspectionId,photoId:p.photoIds[i],sha256:p.photoManifest[i].sha256,mime:'image/jpeg',bytesBase64:b[i].toString('base64')});
const finalizePayload=(p,ack)=>({inspectionId:p.inspectionId,expectedVersion:1,checklistSha256:ack.checklistSha256,locationSha256:ack.locationSha256,photoManifestSha256:ack.photoManifestSha256});
const finalize=(fake,p,ack)=>fake.run('finalizeInspection')(finalizePayload(p,ack));

test('T4: second-photo failure stays uploading; retry keeps reservations and submits once',()=>{
  const fake=setup(),{payload:p,bytes}=body(),ack=prepare(fake,p);
  upload(fake,p,bytes,0);
  fake.state.hooks.onSetValues=({sheet,row})=>{if(sheet==='Photos'&&row===3)throw Error('Sheets unavailable after Drive');};
  assert.throws(()=>upload(fake,p,bytes,1));
  assert.throws(()=>finalize(fake,p,ack),e=>e.code==='CONFLICT');
  assert.equal(rec(fake.state.sheets.get('Inspections')).status,'uploading');
  const reservations=fake.state.sheets.get('Photos').rows.map(r=>r.slice());
  fake.state.hooks.onSetValues=null;
  const retry=prepare(fake,p);assert.equal(retry.photos[0].status,'stored');assert.equal(retry.photos[1].status,'reserved');
  assert.deepEqual(fake.state.sheets.get('Photos').rows,reservations);
  assert.equal(upload(fake,p,bytes,0).replayed,true);assert.equal(upload(fake,p,bytes,1).replayed,true);
  const done=finalize(fake,p,ack);assert.equal(done.status,'submitted');assert.equal(done.version,2);
  const rows=structuredClone([...fake.state.sheets].map(([k,s])=>[k,s.rows]));
  assert.deepEqual(plain(finalize(fake,p,ack)),plain(done),'lost finalization response is idempotent');
  assert.equal(prepare(fake,p).status,'submitted');assert.equal(upload(fake,p,bytes,1).replayed,true);
  assert.deepEqual([...fake.state.sheets].map(([k,s])=>[k,s.rows]),rows);
  assert.equal(fake.state.files.size,2);assert.equal(rec(fake.state.sheets.get('Photos')).caption,'=keterangan sintetis');
});

test('T4: immutable manifest rejects changed checksum, caption, photo list, and uploaded bytes',()=>{
  const fake=setup(),{payload:p,bytes}=body();prepare(fake,p);
  const before=structuredClone([...fake.state.sheets].map(([k,s])=>[k,s.rows]));
  for(const mutate of [q=>q.photoManifest[0].caption='changed',q=>q.photoManifest[0].sha256='a'.repeat(64),q=>{q.photoIds.pop();q.photoManifest.pop();}]){
    const q=structuredClone(p);mutate(q);assert.throws(()=>prepare(fake,q),e=>e.code==='CONFLICT');
  }
  const bad=Buffer.from([255,216,255,224,99,255,217]);
  assert.throws(()=>fake.run('uploadPhoto')({inspectionId:p.inspectionId,photoId:p.photoIds[0],mime:'image/jpeg',sha256:hash(bad),bytesBase64:bad.toString('base64')}),e=>e.code==='CONFLICT');
  assert.equal(fake.state.files.size,0);assert.deepEqual([...fake.state.sheets].map(([k,s])=>[k,s.rows]),before);
});

test('T4: finalization checks versions, location/checklist/manifest hashes and stored photo metadata',()=>{
  const fake=setup(),{payload:p,bytes}=body(1),ack=prepare(fake,p);upload(fake,p,bytes,0);
  for(const field of ['checklistSha256','locationSha256','photoManifestSha256']){
    const q=finalizePayload(p,ack);q[field]='a'.repeat(64);assert.throws(()=>fake.run('finalizeInspection')(q),e=>e.code==='CONFLICT');
  }
  const q=finalizePayload(p,ack);q.expectedVersion=99;assert.throws(()=>fake.run('finalizeInspection')(q),e=>e.code==='CONFLICT');
  const photos=fake.state.sheets.get('Photos'),idx=photos.rows[0].indexOf('size');photos.rows[1][idx]='8';
  assert.throws(()=>finalize(fake,p,ack),e=>e.code==='CONFLICT');assert.equal(rec(fake.state.sheets.get('Inspections')).status,'uploading');
});

test('T4: valid no-photo reasons submit with review; incomplete manifests/location/finding links fail before writes',()=>{
  const fake=setup(),{payload:p}=body(0);p.answers[0]={...p.answers[0],answer:'finding',finding:{type:'Uji',description:'Temuan sintetis',photoIds:[],noPhotoReason:'Tidak tersedia pada uji',measurement:null}};
  const ack=prepare(fake,p);assert.equal(finalize(fake,p,ack).reviewRequired,true);
  for(const mutate of [q=>delete q.location,q=>q.submissionVersion=2,q=>q.photoManifest.push({}),q=>q.answers[0].finding.photoIds=[randomUUID()],q=>q.answers[0].finding.noPhotoReason='']){
    const other=setup(),q=structuredClone(p);mutate(q);q.inspectionId=randomUUID();assert.throws(()=>prepare(other,q),e=>e.code==='VALIDATION_ERROR');assert.equal(other.state.sheets.size,0);
  }
});

test('T4: interrupted reservations recover; unexpected extra photo prevents finalization',()=>{
  const fake=setup(),{payload:p,bytes}=body();let once=true;
  fake.state.hooks.onSetValues=({sheet,row})=>{if(once&&sheet==='Photos'&&row===3){once=false;throw Error('reservation interrupted');}};
  assert.throws(()=>prepare(fake,p));fake.state.hooks.onSetValues=null;
  const ack=prepare(fake,p);p.photoIds.forEach((_,i)=>upload(fake,p,bytes,i));
  const photos=fake.state.sheets.get('Photos');photos.rows.push([...photos.rows[1]]);photos.rows.at(-1)[0]=randomUUID();
  assert.throws(()=>finalize(fake,p,ack),e=>e.code==='CONFLICT');
});

test('T4: Next rejects a T3 gateway before any write',async()=>{
  const fake=setup(),server=await startFakeGateway(fake),previous={url:process.env.GATEWAY_URL,secret:process.env.GATEWAY_HMAC_SECRET};
  process.env.GATEWAY_URL=server.url;process.env.GATEWAY_HMAC_SECRET='g'.repeat(48);
  try{
    fake.run('const t4Lookup=lookupAction_; lookupAction_=function(name){return name==="prepareCompleteInspection"?null:t4Lookup(name);}');
    const {payload:p}=body();const result=await POST(new Request('http://local/api/inspections',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(p)}));
    assert.equal(result.status,502);assert.equal((await result.json()).code,'GATEWAY_OUTDATED');assert.equal(fake.state.sheets.size,0);
  }finally{await server.close();for(const [k,v] of [['GATEWAY_URL',previous.url],['GATEWAY_HMAC_SECRET',previous.secret]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test('T4: browser submission verifies every acknowledgment and never finalizes after photo two fails',async()=>{
  const { submitInspection }=await import('../lib/submission.ts');
  const fake=setup(),{payload:p,bytes}=body(),checklist=fake.run('parseChecklist')(p);
  const attempt={payload:{...p,...plain(checklist)},photos:p.photoManifest.map((m,i)=>({...m,bytes:new Uint8Array(bytes[i]).buffer})),checklistSha256:hash(JSON.stringify(checklist)),locationSha256:hash(JSON.stringify(p.location)),photoManifestSha256:hash(JSON.stringify(p.photoManifest))};
  const calls=[];let failSecond=true;
  const api=async(path,init)=>{
    calls.push(path);
    if(path==='/api/inspections')return plain(prepare(fake,JSON.parse(init.body)));
    if(path.endsWith('/finalize'))return plain(fake.run('finalizeInspection')({...JSON.parse(init.body),inspectionId:p.inspectionId}));
    const i=p.photoIds.findIndex(id=>path.endsWith('/'+id));if(i===1&&failSecond)throw Error('second photo unavailable');
    return plain(upload(fake,p,bytes,i));
  };
  await assert.rejects(submitInspection(attempt,api),/second photo unavailable/);
  assert.ok(calls.every(p=>!p.endsWith('/finalize')));assert.equal(rec(fake.state.sheets.get('Inspections')).status,'uploading');
  failSecond=false;const done=await submitInspection(attempt,api);assert.equal(done.status,'submitted');assert.equal(fake.state.files.size,2);
  for(const badApi of [
    async(path,init)=>path==='/api/inspections'?{...await api(path,init),photoManifestSha256:'wrong'}:api(path,init),
    async(path,init)=>path.includes('/photos/')?{...await api(path,init),sha256:'wrong'}:api(path,init),
    async(path,init)=>path.endsWith('/finalize')?{...await api(path,init),status:'uploading'}:api(path,init),
  ])await assert.rejects(submitInspection(attempt,badApi),/mengonfirmasi/);
});

test('T4: mapped staging headers grow only at the right; old rows survive finalization',()=>{
  const fake=setup(),ss=fake.run('SpreadsheetApp.openById(props_().getProperty("SPREADSHEET_ID"))');
  const headers={Inspections:['inspection_id','revision','operation_id','operational_date','shift','area_id','reporter_name','unit_company','identity_verification','template_id','template_version','workflow_status','submission_verification','owner_public_session_id','actor_id','created_at','updated_at','device_id','observed_at','note','schema_version','checklist_json','sub_area','location_json'],Photos:['photo_id','inspection_id','revision','item_id','finding_id','photo_point_id','drive_file_id','thumbnail_file_id','checksum','status','size','mime','reserved_at','stored_at']};
  for(const [name,header] of Object.entries(headers)){
    const sheet=ss.insertSheet(name);sheet.rows.push(header.slice(),[randomUUID(),'old-record']);
  }
  const {payload:p,bytes}=body(1),ack=prepare(fake,p);upload(fake,p,bytes,0);finalize(fake,p,ack);
  const insp=fake.state.sheets.get('Inspections'),photos=fake.state.sheets.get('Photos');
  assert.deepEqual(insp.rows[0],[...headers.Inspections,'photo_manifest_json','review_json']);assert.deepEqual(photos.rows[0],[...headers.Photos,'caption']);
  assert.equal(insp.rows[1].length,2);assert.equal(photos.rows[1].length,2);
  assert.equal(rec(insp,2).workflow_status,'submitted');assert.equal(rec(insp,2).revision,'2');assert.equal(rec(insp,2).submission_verification,'unverified');
  assert.equal(rec(photos,2).caption,'=keterangan sintetis');assert.equal(fake.state.files.size,1);
});

test('T4: real Next finalize route recovers an executed request whose response was lost',async()=>{
  const { POST: finalizeRoute }=await import('../app/api/inspections/[id]/finalize/route.ts');
  const fake=setup(),{payload:p,bytes}=body(1),ack=prepare(fake,p);upload(fake,p,bytes,0);
  const server=await startFakeGateway(fake),prev={url:process.env.GATEWAY_URL,secret:process.env.GATEWAY_HMAC_SECRET,timeout:process.env.GATEWAY_TIMEOUT_MS};
  process.env.GATEWAY_URL=server.url;process.env.GATEWAY_HMAC_SECRET='g'.repeat(48);process.env.GATEWAY_TIMEOUT_MS='100';
  const req=()=>new Request('http://local/finalize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(finalizePayload(p,ack))});
  const ctx={params:Promise.resolve({id:p.inspectionId})};
  try{
    server.control.dropNext=1;
    const lost=await finalizeRoute(req(),ctx);assert.equal(lost.status,504);assert.equal((await lost.json()).retryable,true);
    assert.equal(rec(fake.state.sheets.get('Inspections')).status,'submitted');
    const retry=await finalizeRoute(req(),ctx);assert.equal(retry.status,200);assert.equal((await retry.json()).version,2);
    assert.equal(fake.state.sheets.get('Inspections').rows.length,2);assert.equal(fake.state.files.size,1);
  }finally{
    await server.close();for(const [k,v] of [['GATEWAY_URL',prev.url],['GATEWAY_HMAC_SECRET',prev.secret],['GATEWAY_TIMEOUT_MS',prev.timeout]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  }
});

test('T4: changed saved-location master returns a correctable pre-write rejection',()=>{
  const fake=setup(),{payload:p}=body(1);
  p.location.object.method='saved_location';p.location.object.savedLocation={id:'synthetic-master',revision:'1',areaId:'pit',label:'Uji master',latitude:1,longitude:2,source:'manual_coordinates',accuracyM:null,capturedAt:null};
  assert.throws(()=>prepare(fake,p),e=>e.code==='LOCATION_CHANGED');
  assert.equal(fake.state.files.size,0);assert.equal(fake.state.sheets.get('Inspections').rows.length,1);assert.equal(fake.state.sheets.get('Photos').rows.length,1);
});
