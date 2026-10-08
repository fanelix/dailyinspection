// Pemeriksaan T1 (tanpa jaringan): route Next -> klien gateway -> kode Apps Script asli (di runtime palsu).
// Jalankan: node --test checks/gateway.check.mjs   (atau: npm run check)
// Bukan bukti Drive/Sheets/Apps Script sungguhan bekerja; untuk itu jalankan checks/live.mjs di staging.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFakeAppsScript, startFakeGateway } from './fake-apps-script.mjs';
import { TINY_JPEG } from './tiny-jpeg.mjs';
import { signMessage } from '../lib/gateway.ts';
import { MAX_PHOTO_BYTES, sha256Hex } from '../lib/photos.ts';
import * as activate from '../app/api/activate/route.ts';
import * as inspections from '../app/api/inspections/route.ts';
import * as photos from '../app/api/inspections/[id]/photos/[photoId]/route.ts';

const ORIGIN = 'http://app.test';
const SECRET = 'g'.repeat(48);
process.env.GATEWAY_HMAC_SECRET = SECRET;
process.env.SESSION_SECRET = 's'.repeat(48);
process.env.GATEWAY_TIMEOUT_MS = '500';

const fake = createFakeAppsScript({ secret: SECRET });
const gw = await startFakeGateway(fake);
process.env.GATEWAY_URL = gw.url;
after(() => gw.close());

// ---- pembantu ----
const call = (handler, method, path, { cookie, body, headers, params, origin = ORIGIN } = {}) =>
  handler(
    new Request(ORIGIN + path, { method, body, headers: { origin, ...(cookie ? { cookie } : {}), ...headers } }),
    { params: Promise.resolve(params) },
  );
const jsonHeaders = { 'content-type': 'application/json' };

async function newDevice(name) {
  const code = fake.createActivationCode(name);
  const res = await call(activate.POST, 'POST', '/api/activate', { body: JSON.stringify({ code }), headers: jsonHeaders });
  return { code, res, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

const prepareBody = (over = {}) => ({
  inspectionId: randomUUID(),
  inspectorName: 'Petugas Uji',
  note: '=SUM(1,1) catatan uji',
  observedAt: '2026-10-08T01:02:03.000Z',
  photoIds: [randomUUID()],
  ...over,
});
const prepare = (cookie, body) =>
  call(inspections.POST, 'POST', '/api/inspections', { cookie, body: JSON.stringify(body), headers: jsonHeaders });

const photoPath = (b) => `/api/inspections/${b.inspectionId}/photos/${b.photoIds[0]}`;
const photoParams = (b) => ({ id: b.inspectionId, photoId: b.photoIds[0] });
async function put(cookie, b, bytes, sha) {
  return call(photos.PUT, 'PUT', photoPath(b), {
    cookie,
    body: bytes,
    headers: { 'content-type': 'image/jpeg', 'x-photo-sha256': sha ?? (await sha256Hex(bytes)) },
    params: photoParams(b),
  });
}
const get = (cookie, b) => call(photos.GET, 'GET', photoPath(b), { cookie, params: photoParams(b) });

const rows = (sheet) => (fake.state.sheets.get(sheet)?.rows ?? []).slice(1);
const photoRow = (b) => rows('Photos').find((r) => r[0] === b.photoIds[0]);
const filesCount = () => fake.state.files.size;

const envelope = (over = {}, secret = SECRET) => {
  const msg = JSON.stringify({ v: 1, action: 'prepareInspection', requestId: randomUUID(), ts: Date.now(), deviceId: null, payload: {}, ...over });
  return JSON.stringify({ msg, sig: signMessage(msg, secret) });
};
const direct = async (body) => (await fetch(gw.url, { method: 'POST', body })).json();

// ---- kasus ----
test('gateway menolak pesan tanpa otorisasi, kedaluwarsa, replay, dan perangkat tak dikenal', async () => {
  assert.equal((await direct('bukan json')).code, 'UNAUTHORIZED');
  assert.equal((await direct(envelope({}, 'x'.repeat(48)))).code, 'UNAUTHORIZED', 'tanda tangan salah');
  assert.equal((await direct(envelope({ ts: Date.now() - 10 * 60 * 1000 }))).code, 'UNAUTHORIZED', 'timestamp kedaluwarsa');

  const { msg, sig } = JSON.parse(envelope());
  const tampered = JSON.stringify({ msg: msg.replace('prepareInspection', 'uploadPhoto'), sig });
  assert.equal((await direct(tampered)).code, 'UNAUTHORIZED', 'isi diubah setelah ditandatangani');

  const valid = envelope();
  assert.equal((await direct(valid)).code, 'DEVICE_INACTIVE', 'tanda tangan sah tetapi perangkat tidak dikenal');
  assert.equal((await direct(valid)).code, 'REPLAY', 'requestId yang sama ditolak');
  assert.equal((await direct(envelope({ action: 'hapusSemua' }))).code, 'VALIDATION_ERROR', 'action di luar allowlist');

  const health = fake.doGet();
  assert.ok(JSON.parse(health).ok && !health.includes(SECRET), 'doGet tidak membocorkan rahasia');
  assert.equal(fake.state.locked, false);
});

test('aktivasi sekali pakai; sesi palsu, tanpa sesi, dan origin asing ditolak', async () => {
  const a = await newDevice('Tablet A');
  assert.equal(a.res.status, 200);
  const setCookie = a.res.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);

  const again = await call(activate.POST, 'POST', '/api/activate', { body: JSON.stringify({ code: a.code }), headers: jsonHeaders });
  assert.equal(again.status, 401, 'kode yang sudah dipakai ditolak');
  assert.equal((await again.json()).code, 'INVALID_ACTIVATION');
  const wrong = await call(activate.POST, 'POST', '/api/activate', { body: JSON.stringify({ code: '00000-00000-00000-00000' }), headers: jsonHeaders });
  assert.equal(wrong.status, 401);

  const body = prepareBody();
  assert.equal((await prepare(undefined, body)).status, 401, 'tanpa cookie');
  assert.equal((await prepare(a.cookie.slice(0, -2) + 'xx', body)).status, 401, 'cookie dipalsukan');
  const evil = await call(inspections.POST, 'POST', '/api/inspections', { cookie: a.cookie, body: JSON.stringify(body), headers: jsonHeaders, origin: 'http://evil.test' });
  assert.equal(evil.status, 403, 'origin asing ditolak walau cookie sah');
  assert.equal(rows('Inspections').filter((r) => r[0] === body.inspectionId).length, 0, 'penolakan tidak menulis data');
});

test('satu inspeksi + satu foto: prepare idempoten, upload, baca kembali, akses lintas perangkat dan pencabutan', async () => {
  const a = await newDevice('Tablet A2');
  const b = await newDevice('Tablet B2');
  const body = prepareBody();

  const p1 = await prepare(a.cookie, body);
  assert.equal(p1.status, 200);
  assert.equal((await p1.json()).photos[0].status, 'reserved');
  const p2 = await prepare(a.cookie, body);
  assert.equal(p2.status, 200, 'prepare ulang dengan isi sama aman');
  assert.equal(rows('Inspections').filter((r) => r[0] === body.inspectionId).length, 1);
  assert.equal(rows('Photos').filter((r) => r[0] === body.photoIds[0]).length, 1);
  assert.equal((await prepare(a.cookie, { ...body, note: 'diubah' })).status, 409, 'isi berbeda untuk ID sama = konflik');
  assert.equal(rows('Inspections').find((r) => r[0] === body.inspectionId)[3], body.observedAt, 'observed_at tetap string, tidak diubah jadi Date');
  assert.equal(rows('Inspections').find((r) => r[0] === body.inspectionId)[5], body.note, 'catatan berawalan = tetap teks');

  const before = filesCount();
  const up = await put(a.cookie, body, TINY_JPEG);
  assert.equal(up.status, 200);
  const upJson = await up.json();
  assert.equal(upJson.status, 'stored');
  assert.equal(upJson.replayed, false);
  assert.equal(upJson.sha256, await sha256Hex(TINY_JPEG));
  assert.equal(filesCount(), before + 1);

  const read = await get(a.cookie, body);
  assert.equal(read.status, 200);
  assert.deepEqual(Buffer.from(await read.arrayBuffer()), TINY_JPEG, 'bytes yang dibaca = bytes yang dikirim');
  assert.match(read.headers.get('cache-control'), /private, no-store/);

  assert.equal((await get(b.cookie, body)).status, 403, 'perangkat lain ditolak walau ID diketahui');
  assert.equal((await put(b.cookie, body, TINY_JPEG)).status, 403);
  assert.equal((await get(a.cookie, { ...body, inspectionId: randomUUID() })).status, 404);

  const deviceA = fake.listDevices().find((d) => d.name === 'Tablet A2');
  fake.revokeDevice(deviceA.deviceId);
  const revoked = await get(a.cookie, body);
  assert.equal(revoked.status, 401, 'perangkat yang dicabut ditolak di server');
  assert.equal((await revoked.json()).code, 'DEVICE_INACTIVE');
  assert.equal(fake.state.locked, false);
});

test('respons hilang setelah file benar-benar tersimpan: retry mengembalikan file yang sama', async () => {
  const a = await newDevice('Tablet A3');
  const body = prepareBody();
  await prepare(a.cookie, body);
  const before = filesCount();

  gw.control.dropNext = 1; // gateway menjalankan upload, tetapi balasannya tidak pernah sampai
  const lost = await put(a.cookie, body, TINY_JPEG);
  assert.equal(lost.status, 504);
  const lostJson = await lost.json();
  assert.equal(lostJson.code, 'UPSTREAM_UNKNOWN');
  assert.equal(lostJson.retryable, true);
  assert.equal(filesCount(), before + 1, 'file sudah tersimpan walau klien menganggap timeout');
  const idAfterLost = photoRow(body)[2];

  const createsBeforeRetry = fake.state.creates;
  const retry = await put(a.cookie, body, TINY_JPEG);
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
  const a = await newDevice('Tablet A4');
  const body = prepareBody();
  await prepare(a.cookie, body);
  const before = filesCount();

  fake.state.hooks.onSetValues = ({ sheet, values }) => {
    if (sheet === 'Photos' && values[0].includes('stored')) {
      fake.state.hooks.onSetValues = null;
      throw new Error('Service Spreadsheets failed');
    }
  };
  const failed = await put(a.cookie, body, TINY_JPEG);
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).retryable, true);
  assert.equal(filesCount(), before + 1);
  assert.equal(photoRow(body)[3], 'reserved', 'record tidak dinyatakan stored');
  assert.equal(fake.state.locked, false, 'lock dilepas walau Sheets gagal');

  const healed = await put(a.cookie, body, TINY_JPEG);
  assert.equal(healed.status, 200);
  assert.equal((await healed.json()).replayed, true);
  assert.equal(photoRow(body)[3], 'stored');
  assert.equal(filesCount(), before + 1);
});

test('validasi foto: checksum salah, bukan JPEG, terlalu besar, ID sama beda isi', async () => {
  const a = await newDevice('Tablet A5');
  const body = prepareBody();
  await prepare(a.cookie, body);
  const before = filesCount();

  const badSum = await put(a.cookie, body, TINY_JPEG, '0'.repeat(64));
  assert.equal(badSum.status, 400);
  assert.equal((await badSum.json()).code, 'VALIDATION_ERROR');
  const notJpeg = await put(a.cookie, body, Buffer.from('bukan gambar'));
  assert.equal(notJpeg.status, 400);
  assert.equal(filesCount(), before, 'tidak ada yang tersimpan');
  assert.equal(photoRow(body)[3], 'reserved');

  const seen = gw.control.requests;
  const huge = await put(a.cookie, body, Buffer.concat([TINY_JPEG, Buffer.alloc(MAX_PHOTO_BYTES)]));
  assert.equal(huge.status, 413);
  assert.equal(gw.control.requests, seen, 'ditolak di route, tidak diteruskan ke gateway');

  assert.equal((await put(a.cookie, body, TINY_JPEG)).status, 200);
  const other = Buffer.concat([TINY_JPEG, Buffer.from([0])]);
  const conflict = await put(a.cookie, body, other);
  assert.equal(conflict.status, 409, 'photo_id yang sama tidak boleh menimpa isi lain');
  assert.equal(filesCount(), before + 1);
  assert.equal(fake.run('MAX_PHOTO_BYTES'), MAX_PHOTO_BYTES, 'batas ukuran gateway = batas aplikasi');
});
