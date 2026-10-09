// Synthetic WGS84 points, never operational coordinates. Tests the real storage boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFakeAppsScript, startFakeGateway } from './fake-apps-script.mjs';
import { POST } from '../app/api/inspections/route.ts';
import { emptyAnswers } from '../lib/inspection.ts';
import { coordinateInput, gpsErrorMessage, locationGeoJson, parseLocation } from '../lib/location.ts';

const plain=v=>JSON.parse(JSON.stringify(v));
const setup=()=>createFakeAppsScript({secret:'g'.repeat(48)});
const timestamp='2026-10-09T08:00:00.000Z';
const gps=()=>({latitude:1,longitude:2,accuracyM:12,capturedAt:timestamp});
const location=()=>({version:1,crs:'EPSG:4326',observerGps:gps(),object:{latitude:3,longitude:4,method:'manual_pin',accuracyM:null,capturedAt:timestamp,savedLocation:null}});
const body=()=>({inspectionId:randomUUID(),inspectorName:'Uji sintetis',note:'',observedAt:timestamp,photoIds:[],schemaVersion:2,templateVersion:'2026-10-09.draft1',areaId:'pit',answers:emptyAnswers('pit').map(a=>({...a,answer:'not_inspected'})),location:location()});
const record=s=>Object.fromEntries(s.rows[0].map((c,i)=>[c,s.rows[1][i]??'']));

test('T3 uses a distinct action so a T2 deployment cannot silently write locationless data',()=>{
  const fake=setup();
  assert.equal(fake.run('typeof lookupAction_("prepareLocatedInspection")'),'function');
  const result=fake.run('lookupAction_("prepareLocatedInspection")')(body());
  assert.ok(result.locationSha256);
});

test('Next route rejects old gateway before writes and confirms location checksum with T3 gateway',async()=>{
  const fake=setup(),server=await startFakeGateway(fake),previous={url:process.env.GATEWAY_URL,secret:process.env.GATEWAY_HMAC_SECRET};
  process.env.GATEWAY_URL=server.url;process.env.GATEWAY_HMAC_SECRET='g'.repeat(48);
  try {
    fake.run('const t3Lookup = lookupAction_; lookupAction_ = function(name) { return name === "prepareInspection" ? prepareInspection : null; }');
    const payload=body(),req=()=>new Request('http://local/api/inspections',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    const old=await POST(req());assert.equal(old.status,502);
    assert.equal((await old.json()).code,'GATEWAY_OUTDATED');
    assert.equal(fake.state.sheets.size,0);
    fake.run('lookupAction_ = t3Lookup');
    const response=await POST(req());assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.locationSha256,fake.run('sha256Hex_')(record(fake.state.sheets.get('Inspections')).location_json));
    const retry=await POST(req());assert.deepEqual(await retry.json(),result);
    assert.equal(fake.state.sheets.get('Inspections').rows.length,2);
  } finally {
    await server.close();
    for(const [key,value] of [['GATEWAY_URL',previous.url],['GATEWAY_HMAC_SECRET',previous.secret]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});

test('manual input keeps blank distinct from zero and GeoJSON uses object longitude first',()=>{
  assert.throws(()=>coordinateInput(' ','latitude'),/kosong/);
  assert.equal(coordinateInput('0','longitude'),0);
  for(const [input,axis] of [['91','latitude'],['-181','longitude'],['Infinity','latitude'],['x','longitude']]) assert.throws(()=>coordinateInput(input,axis));
  const parsed=parseLocation(location(),'pit');
  assert.deepEqual(locationGeoJson(parsed).geometry,{type:'Point',coordinates:[4,3]});
  assert.equal(locationGeoJson(parsed).properties.accuracy_m,null);
  for(const code of [1,2,3]) assert.match(gpsErrorMessage(code),/koordinat manual/);
});

test('object pin and observer GPS are stored independently, checksum acknowledged, retry immutable',()=>{
  const fake=setup(),payload=body(),first=fake.run('prepareInspection')(payload);
  const sheet=fake.state.sheets.get('Inspections'),saved=record(sheet);
  assert.ok(saved.location_json,'location must be stored, not silently ignored');
  assert.deepEqual(JSON.parse(saved.location_json),payload.location);
  assert.equal(first.locationSha256,fake.run('sha256Hex_')(saved.location_json));
  assert.deepEqual(plain(fake.run('prepareInspection')(payload)),plain(first));
  assert.equal(sheet.rows.length,2);
  const changed=structuredClone(payload);changed.location.object.longitude=5;
  assert.throws(()=>fake.run('prepareInspection')(changed),e=>e.code==='CONFLICT');
});

test('invalid coordinates, timestamps and inherited pin accuracy are rejected before any data write',()=>{
  for(const change of [
    p=>p.location.version=99,p=>p.location.crs='EPSG:32750',p=>p.location.object.latitude='',
    p=>p.location.object.latitude=91,p=>p.location.object.longitude=-181,
    p=>p.location.object.latitude=NaN,p=>p.location.object.longitude=Infinity,
    p=>p.location.object.capturedAt='not-a-date',p=>p.location.observerGps.accuracyM=-1,
    p=>p.location.object.accuracyM=12,p=>p.location.object.method='unknown',
    p=>p.location.object.method='gps',p=>p.location.observerGps=null,
  ]) {
    const fake=setup(),payload=body();change(payload);
    // A manual point without GPS is valid; all other mutations must fail.
    if(payload.location.observerGps===null){fake.run('prepareInspection')(payload);continue;}
    assert.throws(()=>fake.run('prepareInspection')(payload),e=>e.code==='VALIDATION_ERROR');
    assert.equal(fake.state.sheets.size,0);
  }
});

test('GPS object must equal captured observer GPS; manual zero and boundary coordinates remain valid',()=>{
  const fake=setup();
  const payload=body();payload.location.object={...gps(),method:'gps',savedLocation:null};
  fake.run('prepareInspection')(payload);
  payload.inspectionId=randomUUID();payload.location.object.accuracyM=13;
  assert.throws(()=>fake.run('prepareInspection')(payload),e=>e.code==='VALIDATION_ERROR');
  for(const [latitude,longitude] of [[0,0],[-90,-180],[90,180]]){
    const p=body();p.location.observerGps=null;Object.assign(p.location.object,{latitude,longitude,method:'manual_coordinates'});
    fake.run('prepareInspection')(p);
    assert.equal(JSON.parse(record({rows:[fake.state.sheets.get('Inspections').rows[0],fake.state.sheets.get('Inspections').rows.at(-1)]}).location_json).object.latitude,latitude);
  }
});

test('T2 locationless retry expands its header without rewriting its saved row',()=>{
  const fake=setup(),payload=body();delete payload.location;
  const first=fake.run('prepareInspection')(payload),sheet=fake.state.sheets.get('Inspections');
  sheet.rows[0]=sheet.rows[0].slice(0,13);sheet.rows[1]=sheet.rows[1].slice(0,13);
  const before=structuredClone(sheet.rows[1]);
  assert.deepEqual(plain(fake.run('prepareInspection')(payload)),plain(first));
  assert.equal(sheet.rows[0][13],'location_json');
  assert.deepEqual(sheet.rows[1],before);
  assert.equal(first.locationSha256,null);
});

const headers={Areas:['area_id','name','area_type','boundary_geometry_id','active'],ObservationObjects:['object_id','area_id','label','location_text','geometry_id'],PhotoPoints:['photo_point_id','area_id','object_id','label','view_hint','geometry_id'],Locations:['location_id','entity_type','entity_id','revision','operation_id','latitude','longitude','source','accuracy_m','captured_at','source_crs','source_x','source_y','map_layer_id','map_layer_version']};
function masters(fake){
  for(const [name,header] of Object.entries(headers)){
    const sh=fake.run('SpreadsheetApp.openById(props_().getProperty("SPREADSHEET_ID"))').insertSheet(name);sh.rows.push(header.slice());
  }
  fake.state.sheets.get('Areas').rows.push(['native-area','Pit','','',true]);
  fake.state.sheets.get('ObservationObjects').rows.push(['native-object','native-area','=Nama objek','','']);
  fake.state.sheets.get('Locations').rows.push(['saved-point','observation_object','native-object',1,'',3,4,'manual_coordinates','',timestamp,'EPSG:4326','','','','']);
}
test('existing masters are read only; selection is checked on first save and snapshotted on retry',()=>{
  const fake=setup();masters(fake);
  const before=structuredClone([...fake.state.sheets].map(([k,v])=>[k,v.rows]));
  assert.equal(fake.run('typeof listLocations'),'function');
  const result=plain(fake.run('listLocations')({areaId:'pit'}));
  assert.equal(result.locations.length,1);const selected=result.locations[0];
  assert.equal(selected.label,'=Nama objek');assert.equal(selected.areaId,'pit');
  assert.deepEqual([...fake.state.sheets].map(([k,v])=>[k,v.rows]),before);
  const payload=body();payload.location.object={...payload.location.object,method:'saved_location',savedLocation:selected};
  fake.run('prepareInspection')(payload);
  const saved=record(fake.state.sheets.get('Inspections')).location_json;
  fake.state.sheets.get('Locations').rows[1][6]=5;
  fake.run('prepareInspection')(payload);
  assert.equal(record(fake.state.sheets.get('Inspections')).location_json,saved);
  payload.inspectionId=randomUUID();
  assert.throws(()=>fake.run('prepareInspection')(payload),e=>e.code==='CONFLICT');
});

test('empty masters return no invented location; foreign-area and projected coordinates cannot be selected',()=>{
  const fake=setup();
  assert.equal(fake.run('typeof listLocations'),'function');
  assert.deepEqual(plain(fake.run('listLocations')({areaId:'pit'})),{locations:[]});
  assert.equal(fake.state.sheets.size,0,'reading must not create tabs');
  masters(fake);
  assert.deepEqual(plain(fake.run('listLocations')({areaId:'dam'})),{locations:[]});
  fake.state.sheets.get('Locations').rows[1][10]='EPSG:32750';
  assert.throws(()=>fake.run('listLocations')({areaId:'pit'}),e=>e.code==='VALIDATION_ERROR');
});
