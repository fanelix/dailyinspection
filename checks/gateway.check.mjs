// Pemeriksaan T1 (tanpa jaringan): route Next -> klien gateway -> kode Apps Script asli (di runtime palsu).
// Jalankan: node --test checks/gateway.check.mjs   (atau: npm run check)
// Bukan bukti Drive/Sheets/Apps Script sungguhan bekerja; untuk itu jalankan checks/live.mjs di staging.
// Keputusan pengguna 2026-10-09: tanpa aktivasi perangkat. Satu-satunya penjaga foto adalah pasangan ID inspeksi+foto (UUID acak).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFakeAppsScript, startFakeGateway } from './fake-apps-script.mjs';
import { TINY_JPEG } from './tiny-jpeg.mjs';
import { signMessage } from '../lib/gateway.ts';
import { MAX_PHOTO_BYTES, sha256Hex } from '../lib/photos.ts';
import * as inspections from '../app/api/inspections/route.ts';
import * as photos from '../app/api/inspections/[id]/photos/[photoId]/route.ts';
import { CHECKLISTS, emptyAnswers } from '../lib/inspection.ts';

const ORIGIN = 'http://app.test';
const SECRET = 'g'.repeat(48);
process.env.GATEWAY_HMAC_SECRET = SECRET;
process.env.GATEWAY_TIMEOUT_MS = '500';

const fake = createFakeAppsScript({ secret: SECRET });
const gw = await startFakeGateway(fake);
process.env.GATEWAY_URL = gw.url;
after(() => gw.close());

// ---- pembantu ----
const call = (handler, method, path, { body, headers, params } = {}) =>
  handler(new Request(ORIGIN + path, { method, body, headers }), { params: Promise.resolve(params) });
const jsonHeaders = { 'content-type': 'application/json' };

const prepareBody = (over = {}) => ({
  inspectionId: randomUUID(),
  inspectorName: 'Petugas Uji',
  note: '=SUM(1,1) catatan uji',
  observedAt: '2026-10-08T01:02:03.000Z',
  photoIds: [randomUUID()],
  schemaVersion: CHECKLISTS.schemaVersion, templateVersion: CHECKLISTS.templateVersion, areaId: 'pit',
  answers: emptyAnswers('pit').map(a => ({ ...a, answer: 'not_inspected' })),
  ...over,
});
const prepare = (body) => call(inspections.POST, 'POST', '/api/inspections', { body: JSON.stringify(body), headers: jsonHeaders });

const photoPath = (b) => `/api/inspections/${b.inspectionId}/photos/${b.photoIds[0]}`;
const photoParams = (b) => ({ id: b.inspectionId, photoId: b.photoIds[0] });
async function put(b, bytes, sha) {
  return call(photos.PUT, 'PUT', photoPath(b), {
    body: bytes,
    headers: { 'content-type': 'image/jpeg', 'x-photo-sha256': sha ?? (await sha256Hex(bytes)) },
    params: photoParams(b),
  });
}
const get = (b) => call(photos.GET, 'GET', photoPath(b), { params: photoParams(b) });

const rows = (sheet) => (fake.state.sheets.get(sheet)?.rows ?? []).slice(1);
const photoRow = (b) => rows('Photos').find((r) => r[0] === b.photoIds[0]);
const filesCount = () => fake.state.files.size;

const envelope = (over = {}, secret = SECRET) => {
  const msg = JSON.stringify({ v: 1, action: 'prepareInspection', requestId: randomUUID(), ts: Date.now(), payload: {}, ...over });
  return JSON.stringify({ msg, sig: signMessage(msg, secret) });
};
const direct = async (body) => (await fetch(gw.url, { method: 'POST', body })).json();

// ---- kasus ----
test('gateway menolak pesan tanpa otorisasi, kedaluwarsa, replay, dan action di luar allowlist (termasuk aktivasi yang sudah dihapus)', async () => {
  assert.equal((await direct('bukan json')).code, 'UNAUTHORIZED');
  assert.equal((await direct(envelope({}, 'x'.repeat(48)))).code, 'UNAUTHORIZED', 'tanda tangan salah');
  assert.equal((await direct(envelope({ ts: Date.now() - 10 * 60 * 1000 }))).code, 'UNAUTHORIZED', 'timestamp kedaluwarsa');

  const { msg, sig } = JSON.parse(envelope());
  const tampered = JSON.stringify({ msg: msg.replace('prepareInspection', 'uploadPhoto'), sig });
  assert.equal((await direct(tampered)).code, 'UNAUTHORIZED', 'isi diubah setelah ditandatangani');

  const valid = envelope();
  assert.equal((await direct(valid)).code, 'VALIDATION_ERROR', 'tanda tangan sah, tetapi payload kosong ditolak validasi');
  assert.equal((await direct(valid)).code, 'REPLAY', 'requestId yang sama ditolak');
  const unknown = await direct(envelope({ action: 'hapusSemua' }));
  assert.deepEqual([unknown.code, unknown.message], ['VALIDATION_ERROR', 'Action tidak dikenal'], 'action di luar allowlist');
  // pesan diperiksa, bukan hanya kode: action yang masih ada pun menjawab VALIDATION_ERROR untuk payload yang salah
  const gone = await direct(envelope({ action: 'activateDevice', payload: { code: 'AAAAA-BBBBB-CCCCC-DDDDD' } }));
  assert.deepEqual([gone.code, gone.message], ['VALIDATION_ERROR', 'Action tidak dikenal'], 'action aktivasi sudah tidak ada');

  const health = fake.doGet();
  assert.ok(JSON.parse(health).ok && !health.includes(SECRET), 'doGet tidak membocorkan rahasia');
  assert.match(JSON.parse(health).build, /^\d{4}-\d{2}-\d{2}\.\d+$/, 'doGet menyebut build agar kode lama yang belum di-deploy ulang terlihat');
  assert.equal(fake.state.locked, false);
});

test('tanpa aktivasi: satu inspeksi + satu foto; prepare idempoten, upload, baca kembali; foto hanya terbaca dengan pasangan ID yang benar', async () => {
  const body = prepareBody();

  const p1 = await prepare(body);
  assert.equal(p1.status, 200, 'tanpa cookie atau origin khusus');
  assert.equal((await p1.json()).photos[0].status, 'reserved');
  const p2 = await prepare(body);
  assert.equal(p2.status, 200, 'prepare ulang dengan isi sama aman');
  assert.equal(rows('Inspections').filter((r) => r[0] === body.inspectionId).length, 1);
  assert.equal(rows('Photos').filter((r) => r[0] === body.photoIds[0]).length, 1);
  assert.equal((await prepare({ ...body, note: 'diubah' })).status, 409, 'isi berbeda untuk ID sama = konflik');
  const inspRow = rows('Inspections').find((r) => r[0] === body.inspectionId);
  assert.equal(inspRow[1], '', 'tidak ada identitas perangkat yang disimpan (kolom device_id dibiarkan kosong)');
  assert.equal(inspRow[3], body.observedAt, 'observed_at tetap string, tidak diubah jadi Date');
  assert.equal(inspRow[5], body.note, 'catatan berawalan = tetap teks');

  const before = filesCount();
  const up = await put(body, TINY_JPEG);
  assert.equal(up.status, 200);
  const upJson = await up.json();
  assert.equal(upJson.status, 'stored');
  assert.equal(upJson.replayed, false);
  assert.equal(upJson.sha256, await sha256Hex(TINY_JPEG));
  assert.equal(filesCount(), before + 1);

  const read = await get(body);
  assert.equal(read.status, 200);
  assert.deepEqual(Buffer.from(await read.arrayBuffer()), TINY_JPEG, 'bytes yang dibaca = bytes yang dikirim');
  assert.match(read.headers.get('cache-control'), /private, no-store/);

  // Penjaga pengganti kepemilikan: foto hanya terbaca/tertulis lewat pasangan (inspeksi, foto) yang benar-benar berpasangan.
  const other = prepareBody();
  assert.equal((await prepare(other)).status, 200);
  assert.equal((await get({ ...body, inspectionId: other.inspectionId })).status, 404, 'foto A dengan ID inspeksi B ditolak');
  assert.equal((await put({ ...body, inspectionId: other.inspectionId }, TINY_JPEG)).status, 404, 'unggah ke pasangan yang salah ditolak');
  assert.equal((await get({ ...body, inspectionId: randomUUID() })).status, 404, 'inspeksi yang tidak ada');
  assert.equal((await get({ inspectionId: 'abc', photoIds: ['def'] })).status, 400, 'ID bukan UUID ditolak validasi');
  assert.equal(filesCount(), before + 1, 'percobaan salah tidak menyimpan apa pun');
  assert.equal(fake.state.locked, false);
});

test('respons hilang setelah file benar-benar tersimpan: retry mengembalikan file yang sama', async () => {
  const body = prepareBody();
  await prepare(body);
  const before = filesCount();

  gw.control.dropNext = 1; // gateway menjalankan upload, tetapi balasannya tidak pernah sampai
  const lost = await put(body, TINY_JPEG);
  assert.equal(lost.status, 504);
  const lostJson = await lost.json();
  assert.equal(lostJson.code, 'UPSTREAM_UNKNOWN');
  assert.equal(lostJson.retryable, true);
  assert.equal(filesCount(), before + 1, 'file sudah tersimpan walau klien menganggap timeout');
  const idAfterLost = photoRow(body)[2];

  const createsBeforeRetry = fake.state.creates;
  const retry = await put(body, TINY_JPEG);
  assert.equal(retry.status, 200);
  const retryJson = await retry.json();
  assert.equal(retryJson.status, 'stored');
  assert.equal(retryJson.replayed, true);
  assert.equal(fake.state.creates, createsBeforeRetry, 'retry setelah sukses penuh tidak menyentuh Drive lagi');
  assert.equal(filesCount(), before + 1, 'retry tidak membuat file kedua');
  assert.equal(photoRow(body)[2], idAfterLost, 'drive_file_id tetap sama');
  assert.equal(rows('Photos').filter((r) => r[0] === body.photoIds[0]).length, 1);
  assert.equal(fake.state.locked, false);
});

test('Drive berhasil tetapi Sheets gagal: status tetap reserved, retry memulihkan tanpa file ganda', async () => {
  const body = prepareBody();
  await prepare(body);
  const before = filesCount();

  fake.state.hooks.onSetValues = ({ sheet, values }) => {
    // nilai tiba di setValues dengan apostrof penanda "paksa teks" di depan; abaikan saat mencocokkan
    if (sheet === 'Photos' && values[0].some((v) => String(v).replace(/^'/, '') === 'stored')) {
      fake.state.hooks.onSetValues = null;
      throw new Error('Service Spreadsheets failed');
    }
  };
  let failed;
  try {
    failed = await put(body, TINY_JPEG);
  } finally {
    fake.state.hooks.onSetValues = null; // jangan menjalar ke test lain bila gagal sebelum hook sempat terpicu
  }
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).retryable, true);
  assert.equal(filesCount(), before + 1);
  assert.equal(photoRow(body)[3], 'reserved', 'record tidak dinyatakan stored');
  assert.equal(fake.state.locked, false, 'lock dilepas walau Sheets gagal');

  const healed = await put(body, TINY_JPEG);
  assert.equal(healed.status, 200);
  assert.equal((await healed.json()).replayed, true);
  assert.equal(photoRow(body)[3], 'stored');
  assert.equal(filesCount(), before + 1);
});

test('adminSelfTest (diagnostik Drive+Sheets dari editor): lulus di runtime palsu dan membuang file ujinya', () => {
  const before = filesCount();
  const createsBefore = fake.state.creates;
  assert.equal(fake.run('adminSelfTest')(), 'LULUS');
  assert.equal(filesCount(), before + 1);
  assert.equal(fake.state.creates, createsBefore + 2, 'langkah pemulihan benar-benar mencoba create ulang (jalur konflik ID Drive)');
  assert.equal([...fake.state.files.values()].at(-1).trashed, true, 'file uji dibuang ke tempat sampah');
  assert.equal(fake.state.locked, false);
});

test('validasi foto: checksum salah, bukan JPEG, terlalu besar, ID sama beda isi', async () => {
  const body = prepareBody();
  await prepare(body);
  const before = filesCount();

  const badSum = await put(body, TINY_JPEG, '0'.repeat(64));
  assert.equal(badSum.status, 400);
  assert.equal((await badSum.json()).code, 'VALIDATION_ERROR');
  const notJpeg = await put(body, Buffer.from('bukan gambar'));
  assert.equal(notJpeg.status, 400);
  assert.equal(filesCount(), before, 'tidak ada yang tersimpan');
  assert.equal(photoRow(body)[3], 'reserved');

  const seen = gw.control.requests;
  const huge = await put(body, Buffer.concat([TINY_JPEG, Buffer.alloc(MAX_PHOTO_BYTES)]));
  assert.equal(huge.status, 413);
  assert.equal(gw.control.requests, seen, 'ditolak di route, tidak diteruskan ke gateway');

  assert.equal((await put(body, TINY_JPEG)).status, 200);
  const other = Buffer.concat([TINY_JPEG, Buffer.from([0])]);
  const conflict = await put(body, other);
  assert.equal(conflict.status, 409, 'photo_id yang sama tidak boleh menimpa isi lain');
  assert.equal(filesCount(), before + 1);
  assert.equal(fake.run('MAX_PHOTO_BYTES'), MAX_PHOTO_BYTES, 'batas ukuran gateway = batas aplikasi');
});
