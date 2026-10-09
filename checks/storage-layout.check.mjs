// Headers verified against the user's existing staging spreadsheet, 2026-10-09.
// Records below are synthetic; no staging IDs or field observations are copied.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFakeAppsScript } from './fake-apps-script.mjs';
import { emptyAnswers } from '../lib/inspection.ts';

const inspections = ['inspection_id','revision','operation_id','operational_date','shift','area_id','reporter_name','unit_company','identity_verification','template_id','template_version','workflow_status','submission_verification','owner_public_session_id','actor_id','created_at','updated_at'];
const photos = ['photo_id','inspection_id','revision','item_id','finding_id','photo_point_id','drive_file_id','thumbnail_file_id','checksum','status'];
const body = () => ({inspectionId:randomUUID(), inspectorName:'=Nama manual', note:'=Catatan', observedAt:'2026-10-09T06:00:00.000Z', photoIds:[randomUUID()], schemaVersion:2, templateVersion:'2026-10-09.draft1', areaId:'pit', subArea:'Bench 280', answers:emptyAnswers('pit').map(a=>({...a,answer:'not_inspected'}))});
const plain = v => JSON.parse(JSON.stringify(v));
const record = (sheet,id) => Object.fromEntries(sheet.rows[0].map((c,i)=>[c,sheet.rows.find(r=>r[0]===id)?.[i] ?? '']));

function staging() {
  const fake=createFakeAppsScript({secret:'g'.repeat(48)});
  for(const [name,header] of [['Inspections',inspections],['Photos',photos]]) {
    fake.run('sheet_')(name);
    fake.state.sheets.get(name).rows[0]=header.slice();
  }
  const insp=fake.state.sheets.get('Inspections'), photo=fake.state.sheets.get('Photos');
  insp.rows.push([randomUUID(),1,'old-operation',new Date('2026-10-05'),'siang','old-area','Lama','Unit','unverified','old-template',1,'submitted','unverified','','',new Date('2026-10-05'),new Date('2026-10-05')]);
  // A previous T1 self-test wrote eight positional values under the older 17-column header.
  insp.rows.push([randomUUID(),'','Self-test','2026-10-08T00:00:00.000Z','2026-10-08T00:00:01.000Z','#ERROR!','uploading','1']);
  photo.rows.push([randomUUID(),randomUUID(),1,'old-item','','','old-drive-file','old-thumbnail','a'.repeat(64),'stored']);
  photo.rows.push([randomUUID(),randomUUID(),'misaligned-drive-file','stored','21','image/jpeg','b'.repeat(64),'old-reserved','old-stored']);
  return {fake,insp,photo};
}

test('existing staging columns are reused; T2 fields append without changing either kind of old row', () => {
  const {fake,insp,photo}=staging(), payload=body();
  const oldInspections=structuredClone(insp.rows.slice(1)), oldPhotos=structuredClone(photo.rows.slice(1));
  const first=fake.run('prepareInspection')(payload);
  assert.deepEqual(insp.rows[0], [...inspections,'device_id','observed_at','note','schema_version','checklist_json','sub_area','location_json']);
  assert.deepEqual(photo.rows[0], [...photos,'size','mime','reserved_at','stored_at']);
  assert.deepEqual(insp.rows.slice(1,3),oldInspections);
  assert.deepEqual(photo.rows.slice(1,3),oldPhotos);
  const saved=record(insp,payload.inspectionId), savedPhoto=record(photo,payload.photoIds[0]);
  assert.equal(saved.reporter_name,payload.inspectorName);
  assert.equal(saved.workflow_status,'uploading');
  assert.equal(saved.revision,'1');
  assert.equal(saved.area_id,'pit');
  assert.equal(saved.template_version,payload.templateVersion);
  assert.equal(saved.observed_at,payload.observedAt);
  assert.equal(saved.note,payload.note);
  assert.equal(saved.created_at,saved.updated_at);
  assert.equal(saved.identity_verification,'unverified');
  assert.equal(saved.submission_verification,'unverified');
  assert.equal(JSON.parse(saved.checklist_json).subArea,payload.subArea);
  assert.equal(first.checklistSha256,fake.run('sha256Hex_')(saved.checklist_json));
  assert.ok(savedPhoto.drive_file_id.startsWith('F'));
  assert.equal(savedPhoto.status,'reserved');
  assert.equal(savedPhoto.revision,'1');
  assert.ok(savedPhoto.reserved_at);
  assert.deepEqual(plain(fake.run('prepareInspection')(payload)),plain(first));
  assert.equal(insp.rows.length,4);
  assert.equal(photo.rows.length,4);
  for(const row of oldInspections) assert.throws(()=>fake.run('prepareInspection')({...payload,inspectionId:row[0]}),e=>e.code==='CONFLICT');
  assert.deepEqual(insp.rows.slice(1,3),oldInspections);
});

test('mapped staging photos upload, retry, recover and read through the actual storage functions', () => {
  const {fake,insp,photo}=staging(), payload=body();
  const oldInspections=structuredClone(insp.rows.slice(1)), oldPhotos=structuredClone(photo.rows.slice(1));
  fake.run('prepareInspection')(payload);
  const bytes=[-1,-40,-1,0,1], sha256=fake.run('sha256Hex_')(bytes);
  const upload={inspectionId:payload.inspectionId,photoId:payload.photoIds[0],mime:'image/jpeg',sha256,bytesBase64:Buffer.from(bytes.map(v=>v&255)).toString('base64')};
  assert.equal(fake.run('uploadPhoto')(upload).replayed,false);
  assert.equal(fake.run('uploadPhoto')(upload).replayed,true);
  let saved=record(photo,upload.photoId);
  assert.equal(saved.checksum,sha256);
  assert.equal(saved.status,'stored');
  assert.equal(saved.size,'5');
  assert.equal(saved.mime,'image/jpeg');
  const photoRow=photo.rows.find(r=>r[0]===upload.photoId);
  photoRow[photo.rows[0].indexOf('status')]='reserved';
  assert.equal(fake.run('uploadPhoto')(upload).replayed,true);
  assert.equal(fake.state.files.size,1);
  assert.equal(fake.run('getPhoto')(upload).bytesBase64,upload.bytesBase64);
  assert.deepEqual(insp.rows.slice(1,3),oldInspections);
  assert.deepEqual(photo.rows.slice(1,3),oldPhotos);
  assert.equal(fake.run('adminSelfTest')(),'LULUS');
});

test('older staging photo rows cannot be rewritten or acknowledged as T2 reservations', () => {
  const {fake,insp,photo}=staging(), payload=body(), old=photo.rows[1];
  payload.inspectionId=old[1]; payload.photoIds=[old[0]];
  const before=structuredClone(photo.rows.slice(1)), beforeInspections=structuredClone(insp.rows.slice(1));
  assert.throws(()=>fake.run('prepareInspection')(payload),e=>e.code==='CONFLICT');
  assert.throws(()=>fake.run('getPhoto')({inspectionId:old[1],photoId:old[0]}),e=>e.code==='NOT_FOUND');
  assert.deepEqual(photo.rows.slice(1),before);
  assert.deepEqual(insp.rows.slice(1),beforeInspections);
  assert.equal(fake.state.files.size,0);
});

test('edited, reordered or unknown staging headers still stop before any new data row', () => {
  for(const [name,alter] of [
    ['Inspections',h=>h[6]='reporter_name '],
    ['Photos',h=>[h[6],h[7]]=[h[7],h[6]]],
    ['Photos',h=>h.push('unknown')],
  ]) {
    const {fake,insp,photo}=staging();
    alter(fake.state.sheets.get(name).rows[0]);
    assert.throws(()=>fake.run('prepareInspection')(body()),e=>e.code==='INTERNAL_ERROR');
    assert.equal(insp.rows.length,3); assert.equal(photo.rows.length,3);
  }
});
