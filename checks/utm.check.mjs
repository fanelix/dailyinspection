// Independent PROJ 9.8 / EPSG control points; all coordinates are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as location from '../lib/location.ts';
import { emptyAnswers } from '../lib/inspection.ts';
import { createFakeAppsScript, startFakeGateway } from './fake-apps-script.mjs';
import { POST } from '../app/api/inspections/route.ts';

const timestamp='2026-10-09T08:00:00.000Z';
const plain=v=>JSON.parse(JSON.stringify(v));
const settings=(datum='WGS84',zone=50,hemisphere='S')=>({datum,zone,hemisphere});
const near=(actual,expected,tolerance)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const controls=[
  ['WGS84',32,'N',12,56,687071.4391,6210141.3269,'EPSG:32632'],
  ['WGS84',59,'S',174,-44,740526.3211,5123750.8730,'EPSG:32759'],
  ['DGN95',50,'S',117,-2,500000,9778939.006409215,'EPSG:23880'],
  ['ID74',50,'S',117,-2,499970.96301511826,9778934.973871427,'EPSG:23890'],
];
test('UTM forward/inverse agrees with independent northern, southern and datum-shift controls',()=>{
  assert.equal(typeof location.wgs84ToUtm,'function','UTM conversion must exist');
  for(const [datum,zone,hemisphere,longitude,latitude,easting,northing,crs] of controls){
    const u=location.wgs84ToUtm(latitude,longitude,settings(datum,zone,hemisphere));
    near(u.easting,easting,0.01);near(u.northing,northing,0.01);assert.equal(u.crs,crs);
    const p=location.utmToWgs84(u);
    near(p.longitude,longitude,1e-7);near(p.latitude,latitude,1e-7);
    assert.equal(u.transformationAccuracyM,datum==='WGS84'?null:datum==='DGN95'?1:3);
    assert.equal(u.operation,datum==='WGS84'?'identity':datum==='DGN95'?'EPSG:15912':'EPSG:1833');
  }
});
test('UTM validates explicit zone/hemisphere, blank input, finite axes and CRS area',()=>{
  assert.equal(typeof location.utmInput,'function');
  assert.throws(()=>location.utmInput(''),/kosong/);assert.equal(location.utmInput('0'),0);
  for(const s of [settings('WGS84',0),settings('WGS84',61),settings('WGS84',50.5),settings('WGS84','50'),settings('WGS84',50,''),settings('WGS84',50,['N']),settings(['WGS84']),settings('SRGI2013'),settings('DGN95',1)])
    assert.throws(()=>location.wgs84ToUtm(-2,117,s));
  for(const [lat,lon,s] of [[-2,117,settings('WGS84',50,'N')],[85,117,settings('WGS84',50,'N')],[-81,117,settings()],[0,0,settings('DGN95')],[1,117,settings('ID74',51,'N')],[0.005,123,settings('DGN95',51,'S')]])
    assert.throws(()=>location.wgs84ToUtm(lat,lon,s));
  for(const [easting,northing] of [[NaN,1],[Infinity,1],['500000',1],[500000,-1],[500000,10000001],[0,0]])
    assert.throws(()=>location.utmToWgs84({...settings(),easting,northing}));
  for(const [lat,lon,s] of [[0,-177,settings('WGS84',1,'N')],[-80,177,settings('WGS84',60,'S')],[84,177,settings('WGS84',60,'N')]]){
    const p=location.utmToWgs84(location.wgs84ToUtm(lat,lon,s));near(p.latitude,lat,1e-7);near(p.longitude,lon,1e-7);
  }
});
test('hemisphere arrays cannot forge northern coordinates under a southern EPSG code',()=>{
  assert.throws(()=>location.utmToWgs84({...settings('WGS84',50,['N']),easting:500000,northing:0}));
});
function payload(){
  const converted=location.utmToWgs84({...settings('ID74'),easting:499970.96301511826,northing:9778934.973871427});
  return {inspectionId:randomUUID(),inspectorName:'Uji UTM sintetis',note:'',observedAt:timestamp,photoIds:[],schemaVersion:2,templateVersion:'2026-10-09.draft1',areaId:'pit',answers:emptyAnswers('pit').map(a=>({...a,answer:'not_inspected'})),location:{version:1,crs:'EPSG:4326',observerGps:{latitude:1,longitude:2,accuracyM:12,capturedAt:timestamp},object:{...converted,method:'manual_coordinates',accuracyM:null,capturedAt:timestamp,savedLocation:null}}};
}
test('UTM source snapshot matches gateway canonical JSON, checksum, retry and GeoJSON WGS84 order',()=>{
  assert.equal(typeof location.utmToWgs84,'function');
  const fake=createFakeAppsScript({secret:'g'.repeat(48)}),p=payload();
  const canonical=location.parseLocation(p.location,'pit');
  assert.deepEqual(plain(fake.run('parseLocation')(p.location,'pit')),canonical);
  const first=fake.run('prepareInspection')(p),sh=fake.state.sheets.get('Inspections');
  const json=sh.rows[1][sh.rows[0].indexOf('location_json')];
  assert.equal(json,JSON.stringify(canonical));assert.equal(first.locationSha256,fake.run('sha256Hex_')(json));
  assert.deepEqual(plain(fake.run('prepareInspection')(p)),plain(first));assert.equal(sh.rows.length,2);
  const changed=structuredClone(p);changed.location.object.utm=location.wgs84ToUtm(canonical.object.latitude,canonical.object.longitude,settings('WGS84'));
  assert.throws(()=>fake.run('prepareInspection')(changed),e=>e.code==='CONFLICT');
  const geo=location.locationGeoJson(canonical);assert.deepEqual(geo.geometry.coordinates,[canonical.object.longitude,canonical.object.latitude]);
  assert.deepEqual(geo.properties.utm,canonical.object.utm);assert.equal(geo.properties.accuracy_m,null);
});
test('forged UTM coordinates, CRS and transform metadata fail before Sheets writes',()=>{
  assert.equal(typeof location.utmToWgs84,'function');
  for(const mutate of [p=>p.location.object.longitude+=1,p=>p.location.object.utm.easting+=10,p=>p.location.object.utm.crs='EPSG:32750',p=>p.location.object.utm.operation='identity',p=>p.location.object.utm.transformationAccuracyM=0,p=>p.location.object.utm=null]){
    const p=payload(),fake=createFakeAppsScript({secret:'g'.repeat(48)});mutate(p);
    assert.throws(()=>fake.run('prepareInspection')(p),e=>e.code==='VALIDATION_ERROR');assert.equal(fake.state.sheets.size,0);
  }
  const old=payload();delete old.location.object.utm;
  assert.deepEqual(location.parseLocation(old.location,'pit'),old.location,'existing T3 JSON must remain byte-compatible');
});
test('UTM uses a new action to reject an older T3 gateway before writes',async()=>{
  assert.equal(typeof location.utmToWgs84,'function');
  const fake=createFakeAppsScript({secret:'g'.repeat(48)}),server=await startFakeGateway(fake);
  const previous=[process.env.GATEWAY_URL,process.env.GATEWAY_HMAC_SECRET];process.env.GATEWAY_URL=server.url;process.env.GATEWAY_HMAC_SECRET='g'.repeat(48);
  try{
    fake.run('const utmLookup=lookupAction_; lookupAction_=function(name){return name==="prepareUtmInspection"?null:utmLookup(name)}');
    const p=payload(),req=()=>new Request('http://local/api/inspections',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(p)});
    const old=await POST(req());assert.equal(old.status,502);assert.equal((await old.json()).code,'GATEWAY_OUTDATED');assert.equal(fake.state.sheets.size,0);
    fake.run('lookupAction_=utmLookup');const response=await POST(req());assert.equal(response.status,200);assert.ok((await response.json()).locationSha256);
  }finally{await server.close();for(const [i,key] of ['GATEWAY_URL','GATEWAY_HMAC_SECRET'].entries()){if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i]}}
});
