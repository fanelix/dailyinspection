import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createFakeAppsScript, startFakeGateway } from './fake-apps-script.mjs';
import { emptyAnswers } from '../lib/inspection.ts';
import { buildCsv, buildGeoJson } from '../lib/history.ts';
import { GET as listRoute } from '../app/api/inspections/route.ts';
import { GET as detailRoute } from '../app/api/inspections/[id]/route.ts';
import { POST as reviewRoute } from '../app/api/inspections/[id]/review/route.ts';

const plain = (v) => JSON.parse(JSON.stringify(v));
const hash = (v) => createHash('sha256').update(v).digest('hex');
const setup = () => createFakeAppsScript({ secret: 'g'.repeat(48) });

function submitted(fake, { areaId = 'pit', observedAt = '2026-10-10T02:00:00.000Z', name = 'Uji sintetis', findings = 0 } = {}) {
  const bytes = Buffer.from([255, 216, 255, 224, 1, 255, 217]);
  const photoManifest = [{ photoId: randomUUID(), sha256: hash(bytes), size: bytes.length, caption: '=keterangan' }];
  const answers = emptyAnswers(areaId).map((a) => ({ ...a, answer: 'not_inspected' }));
  if (findings >= 1) answers[0] = { ...answers[0], answer: 'finding', finding: { type: 'Retakan', description: '=Temuan sintetis', photoIds: [photoManifest[0].photoId], noPhotoReason: null, measurement: null } };
  if (findings >= 2) answers[1] = { ...answers[1], answer: 'finding', finding: { type: 'Rembesan', description: 'Temuan tanpa foto', photoIds: [], noPhotoReason: 'Observasi dari posisi aman', measurement: null } };
  const payload = {
    submissionVersion: 1, inspectionId: randomUUID(), inspectorName: name, note: 'catatan sintetis', observedAt,
    photoIds: photoManifest.map((p) => p.photoId), photoManifest, schemaVersion: 2, templateVersion: '2026-10-09.draft1', areaId, answers,
    location: { version: 1, crs: 'EPSG:4326', observerGps: null, object: { latitude: -2.1, longitude: 117.2, method: 'manual_coordinates', accuracyM: null, capturedAt: observedAt, savedLocation: null } },
  };
  const ack = fake.run('prepareCompleteInspection')(payload);
  fake.run('uploadPhoto')({ inspectionId: payload.inspectionId, photoId: photoManifest[0].photoId, sha256: photoManifest[0].sha256, mime: 'image/jpeg', bytesBase64: bytes.toString('base64') });
  fake.run('finalizeInspection')({ inspectionId: payload.inspectionId, expectedVersion: 1, checklistSha256: ack.checklistSha256, locationSha256: ack.locationSha256, photoManifestSha256: ack.photoManifestSha256 });
  return payload;
}
function uploading(fake, { areaId = 'pit', observedAt = '2026-10-11T02:00:00.000Z', name = 'Belum terkirim' } = {}) {
  const answers = emptyAnswers(areaId).map((a) => ({ ...a, answer: 'not_inspected' }));
  const payload = {
    submissionVersion: 1, inspectionId: randomUUID(), inspectorName: name, note: '', observedAt, photoIds: [], photoManifest: [],
    schemaVersion: 2, templateVersion: '2026-10-09.draft1', areaId, answers,
    location: { version: 1, crs: 'EPSG:4326', observerGps: null, object: { latitude: -2.2, longitude: 117.3, method: 'manual_coordinates', accuracyM: null, capturedAt: observedAt, savedLocation: null } },
  };
  fake.run('prepareCompleteInspection')(payload);
  return payload;
}
const recOf = (sheet, id) => Object.fromEntries(sheet.rows[0].map((c, i) => [c, sheet.rows.find((r) => r[0] === id)?.[i] ?? '']));

test('T6: listInspections filters area/status/date, pages, sorts, and skips junk rows read-only', () => {
  const fake = setup();
  const a = submitted(fake, { areaId: 'pit', observedAt: '2026-10-08T01:00:00.000Z', name: 'A' });
  const b = submitted(fake, { areaId: 'pit', observedAt: '2026-10-10T01:00:00.000Z', name: 'B', findings: 2 });
  const c = submitted(fake, { areaId: 'dam', observedAt: '2026-10-09T01:00:00.000Z', name: 'C' });
  const u = uploading(fake);
  const insp = fake.state.sheets.get('Inspections');
  insp.rows.push(['bukan-uuid', 'baris rusak dipertahankan']);
  const before = structuredClone(insp.rows);

  const all = fake.run('listInspections')({});
  assert.equal(all.matched, 4);
  assert.equal(all.skipped, 1);
  assert.deepEqual(Array.from(all.inspections, (i) => String(i.inspectionId)), [u.inspectionId, b.inspectionId, c.inspectionId, a.inspectionId]);
  assert.equal(fake.run('listInspections')({ areaId: 'pit' }).matched, 3);
  assert.equal(fake.run('listInspections')({ status: 'submitted' }).matched, 3);
  assert.equal(fake.run('listInspections')({ from: '2026-10-09', to: '2026-10-10' }).matched, 2);
  const page = fake.run('listInspections')({ limit: 1, offset: 1 });
  assert.equal(page.inspections.length, 1);
  assert.equal(page.inspections[0].inspectionId, b.inspectionId);
  assert.equal(page.hasMore, true);
  for (const bad of [{ status: 'aneh' }, { areaId: 'tidak-ada' }, { from: '10-10-2026' }, { limit: 0 }, { limit: 51 }, { offset: -1 }]) {
    assert.throws(() => fake.run('listInspections')(bad), (e) => e.code === 'VALIDATION_ERROR', JSON.stringify(bad));
  }
  const itemA = all.inspections.find((i) => i.inspectionId === a.inspectionId);
  const itemB = all.inspections.find((i) => i.inspectionId === b.inspectionId);
  assert.equal(itemA.status, 'submitted');
  assert.equal(itemA.version, 2);
  assert.equal(itemA.photoCount, 1);
  assert.equal(itemA.reviewRequired, false);
  assert.deepEqual(plain(itemA.findings), { total: 0, open: 0, closed: 0 });
  assert.equal(itemA.reviews, 0);
  assert.deepEqual(plain(itemB.findings), { total: 2, open: 0, closed: 0 });
  assert.equal(itemB.reviewRequired, true);
  assert.ok(Math.abs(itemA.location.latitude + 2.1) < 1e-9);
  assert.ok(Math.abs(itemA.location.longitude - 117.2) < 1e-9);
  const uItem = all.inspections.find((i) => i.inspectionId === u.inspectionId);
  assert.equal(uItem.status, 'uploading');
  assert.deepEqual(insp.rows, before, 'membaca riwayat tidak boleh mengubah satu sel pun');
});

test('T6: getInspection returns snapshot, reviews and photo metadata but never photo bytes', () => {
  const fake = setup();
  const p = submitted(fake, { findings: 1 });
  const d = fake.run('getInspection')({ inspectionId: p.inspectionId }).inspection;
  assert.equal(d.inspectionId, p.inspectionId);
  assert.equal(d.status, 'submitted');
  assert.equal(d.version, 2);
  assert.equal(d.areaId, 'pit');
  assert.equal(d.note, 'catatan sintetis');
  assert.equal(d.checklist.answers.filter((a) => a.answer === 'finding').length, 1);
  assert.ok(Math.abs(d.location.object.latitude + 2.1) < 1e-9);
  assert.equal(d.photoManifest.length, 1);
  assert.equal(d.photoManifest[0].caption, '=keterangan');
  assert.equal(d.photos.length, 1);
  assert.equal(d.photos[0].status, 'stored');
  assert.equal(d.photos[0].size, 7);
  assert.equal(d.photos[0].caption, '=keterangan');
  assert.ok(!('bytesBase64' in d.photos[0]) && !('drive_file_id' in d.photos[0]) && !('driveFileId' in d.photos[0]));
  assert.equal(d.reviews.length, 0);
  assert.throws(() => fake.run('getInspection')({ inspectionId: randomUUID() }), (e) => e.code === 'NOT_FOUND');
  assert.throws(() => fake.run('getInspection')({ inspectionId: 'abc' }), (e) => e.code === 'VALIDATION_ERROR');
});

test('T6: review validates findings, bumps version, rejects stale versions, replays by reviewId', () => {
  const fake = setup();
  const p = submitted(fake, { findings: 2 });
  const base = (over = {}) => ({
    inspectionId: p.inspectionId, expectedVersion: 2,
    review: { reviewId: randomUUID(), reviewerName: 'Reviewer sintetis', note: '=Catatan review', findings: [{ itemId: 'cracks', status: 'closed', note: 'Sudah ditutup' }, { itemId: 'loose_material', status: 'open', note: '' }], ...over },
  });
  const first = fake.run('reviewInspection')(base());
  assert.equal(first.version, 3);
  assert.equal(first.status, 'submitted');
  assert.equal(first.review.reviewerName, 'Reviewer sintetis');
  const insp = fake.state.sheets.get('Inspections');
  const saved = recOf(insp, p.inspectionId);
  assert.equal(saved.version, '3');
  assert.equal(saved.status, 'submitted');
  const reviews = JSON.parse(saved.review_json);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].reviewId, first.review.reviewId);
  assert.equal(reviews[0].version, 3);
  assert.equal(saved.photo_manifest_json, JSON.stringify(p.photoManifest));
  const rowsAfterFirst = structuredClone(insp.rows);

  const replay = fake.run('reviewInspection')(base({ reviewId: first.review.reviewId, reviewerName: 'Reviewer sintetis' }));
  assert.deepEqual(plain(replay), plain(first));
  assert.deepEqual(insp.rows, rowsAfterFirst, 'replay reviewId tidak menulis ulang');

  assert.throws(() => fake.run('reviewInspection')(base({ reviewId: randomUUID() })), (e) => e.code === 'VERSION_CONFLICT');
  const fresh = (over) => ({ ...base(over), expectedVersion: 3 });
  assert.throws(() => fake.run('reviewInspection')(fresh({ reviewId: randomUUID(), findings: [{ itemId: 'seepage', status: 'closed', note: '' }] })), (e) => e.code === 'VALIDATION_ERROR');
  assert.throws(() => fake.run('reviewInspection')(fresh({ reviewId: randomUUID(), findings: [{ itemId: 'cracks', status: 'selesai', note: '' }] })), (e) => e.code === 'VALIDATION_ERROR');
  assert.throws(() => fake.run('reviewInspection')(fresh({ reviewId: randomUUID(), reviewerName: '   ' })), (e) => e.code === 'VALIDATION_ERROR');
  assert.throws(() => fake.run('reviewInspection')(fresh({ reviewId: 'bukan-uuid' })), (e) => e.code === 'VALIDATION_ERROR');

  const second = fake.run('reviewInspection')({ inspectionId: p.inspectionId, expectedVersion: 3, review: { reviewId: randomUUID(), reviewerName: 'Reviewer 2', note: '', findings: [{ itemId: 'loose_material', status: 'closed', note: 'Beres' }] } });
  assert.equal(second.version, 4);
  const d = fake.run('getInspection')({ inspectionId: p.inspectionId }).inspection;
  assert.equal(d.reviews.length, 2);
  assert.equal(d.reviews[1].findings[0].status, 'closed');
  const listed = fake.run('listInspections')({ areaId: 'pit' }).inspections[0];
  assert.deepEqual(plain(listed.findings), { total: 2, open: 0, closed: 2 });
  assert.equal(listed.reviews, 2);
  assert.equal(listed.lastReviewedAt, d.reviews[1].reviewedAt);

  const up = uploading(fake);
  assert.throws(() => fake.run('reviewInspection')({ inspectionId: up.inspectionId, expectedVersion: 1, review: { reviewId: randomUUID(), reviewerName: 'R', note: '', findings: [] } }), (e) => e.code === 'CONFLICT');
});

test('T6: review history is capped and touch only the review fields', () => {
  const fake = setup();
  const p = submitted(fake, { findings: 1 });
  const insp = fake.state.sheets.get('Inspections');
  const untouched = ['inspector_name', 'status', 'checklist_json', 'location_json', 'photo_manifest_json', 'observed_at', 'received_at', 'note'];
  const before = recOf(insp, p.inspectionId);
  let version = 2;
  for (let i = 0; i < 25; i++) {
    const r = fake.run('reviewInspection')({ inspectionId: p.inspectionId, expectedVersion: version, review: { reviewId: randomUUID(), reviewerName: 'R' + i, note: '', findings: [{ itemId: 'cracks', status: i % 2 ? 'open' : 'closed', note: '' }] } });
    version = r.version;
  }
  assert.equal(version, 27);
  const d = fake.run('getInspection')({ inspectionId: p.inspectionId }).inspection;
  assert.equal(d.reviews.length, 20);
  assert.equal(d.reviews[0].reviewerName, 'R5');
  assert.equal(d.reviews.at(-1).reviewerName, 'R24');
  const after = recOf(insp, p.inspectionId);
  for (const key of untouched) assert.equal(after[key], before[key], key);
  assert.equal(after.version, '27');
  assert.equal(JSON.parse(after.review_json).length, 20);
});

test('T6: CSV guards formula injection and quotes RFC4180 cells', () => {
  const item = (over = {}) => ({
    inspectionId: '11111111-1111-1111-1111-111111111111', inspectorName: '=Nama', observedAt: '2026-10-10T02:00:00.000Z', receivedAt: '2026-10-10T02:01:00.000Z',
    areaId: 'pit', subArea: 'Bench, "A"', status: 'submitted', version: 2, reviewRequired: true, findings: { total: 2, open: 1, closed: 1 }, reviews: 1,
    lastReviewedAt: '2026-10-10T03:00:00.000Z', photoCount: 1, location: { latitude: -2.1, longitude: 117.2 }, ...over,
  });
  const csv = buildCsv([item(), item({ inspectionId: 'b', inspectorName: '+62', subArea: 'baris\nbaru', status: '@x', location: null })]);
  assert.ok(csv.startsWith('inspection_id,observed_at,received_at,area_id,sub_area,inspector_name,status,review_required,reviews,findings_open,findings_closed,longitude,latitude\r\n'));
  assert.ok(csv.includes("'=Nama"));
  assert.ok(csv.includes('"Bench, ""A"""'));
  assert.ok(csv.includes("'+62"));
  assert.ok(csv.includes('"baris\nbaru"'));
  assert.ok(csv.includes("'@x"));
  assert.ok(csv.includes(',117.2,-2.1'));
  assert.ok(csv.includes(',,'));
  assert.ok(csv.endsWith('\r\n'));
  assert.ok(csv.split('\r\n').length >= 3);
});

test('T6: GeoJSON uses [longitude, latitude] and null geometry without location', () => {
  const item = (over = {}) => ({
    inspectionId: '11111111-1111-1111-1111-111111111111', inspectorName: 'A', observedAt: '2026-10-10T02:00:00.000Z', receivedAt: null,
    areaId: 'pit', subArea: '', status: 'submitted', version: 2, reviewRequired: false, findings: { total: 0, open: 0, closed: 0 }, reviews: 0,
    lastReviewedAt: null, photoCount: 0, location: { latitude: -2.1, longitude: 117.2 }, ...over,
  });
  const gj = JSON.parse(buildGeoJson([item(), item({ inspectionId: 'b', location: null }), item({ inspectionId: 'c', location: { latitude: NaN, longitude: 117 } })]));
  assert.equal(gj.type, 'FeatureCollection');
  assert.deepEqual(gj.features[0].geometry, { type: 'Point', coordinates: [117.2, -2.1] });
  assert.equal(gj.features[1].geometry, null);
  assert.equal(gj.features[2].geometry, null);
  assert.equal(gj.features[0].properties.inspection_id, '11111111-1111-1111-1111-111111111111');
  assert.equal(gj.features[0].properties.status, 'submitted');
  assert.equal(gj.features[0].properties.findings_open, 0);
});

test('T6: photos stay reachable only through the matching inspection+photo pair', () => {
  const fake = setup();
  const p = submitted(fake, { findings: 1 });
  assert.throws(() => fake.run('getPhoto')({ inspectionId: randomUUID(), photoId: p.photoIds[0] }), (e) => e.code === 'NOT_FOUND');
  assert.throws(() => fake.run('getPhoto')({ inspectionId: p.inspectionId, photoId: randomUUID() }), (e) => e.code === 'NOT_FOUND');
  assert.ok(fake.run('getPhoto')({ inspectionId: p.inspectionId, photoId: p.photoIds[0] }).bytesBase64.length > 0);
});

test('T6: staging-mapped headers resolve canonical fields and photo checksums', () => {
  const fake = setup();
  const ss = fake.run('SpreadsheetApp.openById(props_().getProperty("SPREADSHEET_ID"))');
  const headers = {
    Inspections: ['inspection_id', 'revision', 'operation_id', 'operational_date', 'shift', 'area_id', 'reporter_name', 'unit_company', 'identity_verification', 'template_id', 'template_version', 'workflow_status', 'submission_verification', 'owner_public_session_id', 'actor_id', 'created_at', 'updated_at', 'device_id', 'observed_at', 'note', 'schema_version', 'checklist_json', 'sub_area', 'location_json'],
    Photos: ['photo_id', 'inspection_id', 'revision', 'item_id', 'finding_id', 'photo_point_id', 'drive_file_id', 'thumbnail_file_id', 'checksum', 'status', 'size', 'mime', 'reserved_at', 'stored_at'],
  };
  for (const [name, header] of Object.entries(headers)) {
    const sheet = ss.insertSheet(name);
    sheet.rows.push(header.slice());
  }
  const p = submitted(fake, { findings: 1, name: 'Petugas staging' });
  const listed = fake.run('listInspections')({ areaId: 'pit', status: 'submitted' });
  assert.equal(listed.matched, 1);
  assert.equal(listed.inspections[0].inspectorName, 'Petugas staging');
  assert.equal(listed.inspections[0].status, 'submitted');
  assert.equal(listed.inspections[0].version, 2);
  assert.equal(listed.inspections[0].photoCount, 1);
  assert.equal(listed.inspections[0].findings.total, 1);
  const detail = fake.run('getInspection')({ inspectionId: p.inspectionId }).inspection;
  assert.equal(detail.inspectorName, 'Petugas staging');
  assert.equal(detail.status, 'submitted');
  assert.equal(detail.version, 2);
  assert.equal(detail.photos.length, 1);
  assert.equal(detail.photos[0].sha256, p.photoManifest[0].sha256);
  assert.equal(detail.photos[0].size, p.photoManifest[0].size);
  assert.equal(detail.photos[0].caption, '=keterangan');
  const reviewed = fake.run('reviewInspection')({ inspectionId: p.inspectionId, expectedVersion: 2, review: { reviewId: randomUUID(), reviewerName: 'Reviewer staging', note: '', findings: [{ itemId: 'cracks', status: 'closed', note: '' }] } });
  assert.equal(reviewed.version, 3);
  assert.equal(fake.run('listInspections')({ areaId: 'pit' }).inspections[0].findings.closed, 1);
});

test('T6: Next list/detail/review routes work against the real gateway client', async () => {
  const fake = setup();
  const p = submitted(fake, { findings: 1 });
  const server = await startFakeGateway(fake);
  const prev = { url: process.env.GATEWAY_URL, secret: process.env.GATEWAY_HMAC_SECRET };
  process.env.GATEWAY_URL = server.url;
  process.env.GATEWAY_HMAC_SECRET = 'g'.repeat(48);
  try {
    const list = await listRoute(new Request('http://local/api/inspections?areaId=pit&status=submitted'));
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assert.equal(listBody.inspections.length, 1);
    assert.equal(listBody.inspections[0].inspectionId, p.inspectionId);

    const detail = await detailRoute(new Request('http://local/api/inspections/' + p.inspectionId), { params: Promise.resolve({ id: p.inspectionId }) });
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).inspection.inspectionId, p.inspectionId);
    const missing = await detailRoute(new Request('http://local/api/inspections/' + randomUUID()), { params: Promise.resolve({ id: randomUUID() }) });
    assert.equal(missing.status, 404);

    const reviewReq = (expectedVersion, reviewId) => new Request('http://local/api/inspections/' + p.inspectionId + '/review', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedVersion, review: { reviewId, reviewerName: 'Reviewer route', note: '', findings: [{ itemId: 'cracks', status: 'closed', note: '' }] } }),
    });
    const ctx = { params: Promise.resolve({ id: p.inspectionId }) };
    const ok = await reviewRoute(reviewReq(2, randomUUID()), ctx);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).version, 3);
    const stale = await reviewRoute(reviewReq(2, randomUUID()), ctx);
    assert.equal(stale.status, 409);
    const conflictBody = await stale.json();
    assert.equal(conflictBody.code, 'VERSION_CONFLICT');
    assert.equal(conflictBody.retryable, false);
  } finally {
    await server.close();
    for (const [k, v] of [['GATEWAY_URL', prev.url], ['GATEWAY_HMAC_SECRET', prev.secret]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});
