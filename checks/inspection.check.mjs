// T2: reject incomplete observations at the actual storage boundary, not just in the form.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFakeAppsScript } from './fake-apps-script.mjs';
import { CHECKLISTS, emptyAnswers, parseChecklist } from '../lib/inspection.ts';

test('all seven user areas start blank; shared validator matches gateway; template IDs are unique', () => {
  assert.deepEqual(CHECKLISTS.areas.map(a=>a.label), ['Pit','Waste Dump','LGSP','Topsoil Stockpile','Sedimen Sump','DAM','Heap Leach']);
  const fake = setup();
  assert.equal(new Set(CHECKLISTS.areas.map(a=>a.id)).size, 7);
  for (const area of CHECKLISTS.areas) {
    assert.equal(new Set(area.items.map(i=>i.id)).size, area.items.length);
    const answers = emptyAnswers(area.id);
    assert.ok(answers.every(a=>a.answer===null && a.finding===null));
    const body = {...fixture(), areaId:area.id, answers};
    assert.throws(()=>parseChecklist(body), /Jawab item/);
    body.answers = answers.map(a=>({...a, answer:'not_inspected'}));
    assert.deepEqual(plain(fake.run('parseChecklist')(body)), parseChecklist(body));
    assert.equal(fake.run('prepareInspection')(body).templateVersion, CHECKLISTS.templateVersion);
  }
});

const fixture = () => ({
  inspectionId: randomUUID(), inspectorName: 'Nama manual', note: '',
  observedAt: '2026-10-09T04:00:00.000Z', photoIds: [randomUUID()],
  schemaVersion: 2, templateVersion: '2026-10-09.draft1', areaId: 'pit',
  answers: ['cracks', 'loose_material', 'slope_changes', 'seepage', 'drainage', 'access'].map(itemId => ({ itemId, answer: 'no_finding', finding: null })),
});
const setup = () => createFakeAppsScript({ secret: 'g'.repeat(48) });
const plain = v => JSON.parse(JSON.stringify(v));
const reject = (fake, body) => assert.throws(() => fake.run('prepareInspection')(body), e => e.code === 'VALIDATION_ERROR');

test('blank, missing, duplicate, foreign and invalid answers never become no_finding', () => {
  const fake = setup();
  for (const answer of [null, '', undefined, 'safe']) {
    const body = fixture(); body.answers[0].answer = answer;
    reject(fake, body);
  }
  for (const alter of [b => b.answers.pop(), b => b.answers.push(b.answers[0]), b => b.answers[0].itemId = 'unknown']) {
    const body = fixture(); alter(body); reject(fake, body);
  }
  assert.equal(fake.state.sheets.size, 0, 'validation precedes all writes');
});

test('schema, template, area and manual inspector are mandatory', () => {
  const fake = setup();
  for (const change of [{schemaVersion: undefined}, {schemaVersion: 1}, {templateVersion: 'unknown'}, {areaId: 'unknown'}, {inspectorName: '   '}]) reject(fake, {...fixture(), ...change});
});

test('four distinct answers and null measurements survive storage and retry', () => {
  const fake = setup(), body = fixture();
  body.inspectorName = "  =Nama manual  ";
  body.answers[1].answer = 'not_inspected';
  body.answers[2].answer = 'not_applicable';
  body.answers[3] = {itemId:'seepage', answer:'finding', finding:{type:'Rembesan', description:'Air terlihat pada kaki lereng', photoIds:[body.photoIds[0]], noPhotoReason:null, measurement:null}};
  const first = fake.run('prepareInspection')(body);
  assert.equal(first.templateVersion, body.templateVersion);
  const sheet = fake.state.sheets.get('Inspections');
  const record = Object.fromEntries(sheet.rows[0].map((c,i) => [c,sheet.rows[1][i]]));
  assert.equal(record.inspector_name, '=Nama manual');
  assert.equal(record.area_id, 'pit');
  assert.equal(record.schema_version, '2');
  const saved = JSON.parse(record.checklist_json);
  assert.deepEqual(saved.answers.map(a=>a.answer), body.answers.map(a=>a.answer));
  assert.equal(saved.answers[3].finding.measurement, null);
  assert.equal(saved.templateSnapshot.label, 'Pit');
  assert.equal(saved.templateSnapshot.items[0].id, 'cracks');
  assert.equal(saved.reviewRequired, false);
  assert.equal(record.template_version, body.templateVersion);
  const reordered = {...body, answers: [...body.answers].reverse()};
  assert.deepEqual(plain(fake.run('prepareInspection')(reordered)), plain(first));
  assert.equal(sheet.rows.length, 2);
  const changed = structuredClone(body); changed.answers[0].answer = 'not_inspected';
  assert.throws(() => fake.run('prepareInspection')(changed), e => e.code === 'CONFLICT');
});

test('a finding needs a type, description and linked photo OR reason; no photo forces review', () => {
  const fake = setup(), body = fixture();
  const finding = {type:'Retakan', description:'Retakan terlihat dari akses', photoIds:[], noPhotoReason:'Tidak dapat mengambil foto dari posisi pengamatan', measurement:null};
  body.answers[0] = {itemId:'cracks', answer:'finding', finding};
  for (const change of [{type:''}, {description:' '}, {noPhotoReason:null}, {photoIds:[randomUUID()]}, {measurement:{value:1,unit:'',method:''}}, {measurement:{value:'',unit:'mm',method:'meteran'}}]) {
    const bad = structuredClone(body); Object.assign(bad.answers[0].finding, change); reject(fake,bad);
  }
  body.photoIds = [];
  const result = fake.run('prepareInspection')(body);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.status, 'uploading', 'T2 never finalizes');
  assert.equal(result.photos.length, 0);
  const changed = structuredClone(body); changed.answers[0].finding.measurement={value:0,unit:'mm',method:'pengukuran ulang'};
  changed.inspectionId=randomUUID();
  fake.run('prepareInspection')(changed);
});

test('existing T1 headers expand additively; old rows remain unchanged; damaged headers fail closed', () => {
  const fake = setup();
  fake.run('sheet_')( 'Inspections');
  const sheet = fake.state.sheets.get('Inspections');
  const oldHeader = ['inspection_id','device_id','inspector_name','observed_at','received_at','note','status','version'];
  const oldRow = [randomUUID(),'','Lama','2026-10-08T00:00:00.000Z','2026-10-08T00:00:01.000Z','catatan','uploading','1'];
  sheet.rows.splice(0,sheet.rows.length,oldHeader.slice(),oldRow.slice());
  fake.run('prepareInspection')(fixture());
  assert.deepEqual(sheet.rows[0].slice(0,8),oldHeader);
  assert.deepEqual(sheet.rows[0].slice(8),['schema_version','template_version','area_id','checklist_json']);
  assert.deepEqual(sheet.rows[1],oldRow);
  sheet.rows[0][2]='wrong_column';
  assert.throws(() => fake.run('prepareInspection')(fixture()), e=>e.code==='INTERNAL_ERROR');
});

test('a non-finding answer cannot carry hidden finding data; invalid measurement is never coerced to zero', () => {
  const fake = setup(), body=fixture();
  body.answers[0].finding={type:'hidden'};
  reject(fake,body);
  body.answers[0]={itemId:'cracks',answer:'finding',finding:{type:'Retakan',description:'Uji',photoIds:[body.photoIds[0]],noPhotoReason:null,measurement:{value:NaN,unit:'mm',method:'meteran'}}};
  reject(fake,body);
  body.answers[0].finding.measurement.value=Infinity;
  reject(fake,body);
});
