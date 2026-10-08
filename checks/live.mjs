// Pembuktian T1 terhadap STAGING sungguhan (Vercel + Apps Script + Drive + Sheets). Tidak dijalankan oleh `npm run check`.
//
//   BASE_URL=https://<staging> ACTIVATION_CODE=XXXXX-XXXXX-XXXXX-XXXXX node checks/live.mjs
//
// Dua tahap (boleh dijalankan terpisah):
//   Tahap A, hanya Apps Script : GATEWAY_URL=<url /exec> node checks/live.mjs
//   Tahap B, seluruh alur      : BASE_URL + ACTIVATION_CODE (+ GATEWAY_URL agar tahap A ikut dijalankan)
// Wajib untuk tahap B: BASE_URL, ACTIVATION_CODE (kode BARU, sekali pakai; terbitkan dengan adminCreateActivationCode)
// Opsional: ACTIVATION_CODE_2 (perangkat kedua, untuk uji akses lintas perangkat)
//           GATEWAY_URL      (URL /exec, untuk uji "gateway menolak pesan tanpa tanda tangan")
//           PHOTO_PATH       (JPEG <= 2 MB; bawaan: JPEG 8x8)
//           ABORT_MS         (batas klien pada upload pertama untuk mensimulasikan respons hilang; bawaan 1500)
//
// Skrip ini membuat data uji sungguhan (1 inspeksi, 1 foto) di staging. Jangan arahkan ke produksi.
// Yang TIDAK bisa dibuktikan dari sini: jumlah file di Drive dan baris di Sheets; periksa manual (lihat keluaran akhir).
import fs from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { TINY_JPEG } from './tiny-jpeg.mjs';

const { BASE_URL, ACTIVATION_CODE, ACTIVATION_CODE_2, GATEWAY_URL, PHOTO_PATH } = process.env;
const ABORT_MS = Number(process.env.ABORT_MS) || 1500;
if (!GATEWAY_URL && !(BASE_URL && ACTIVATION_CODE)) {
  console.error('Isi GATEWAY_URL saja (tahap A), atau BASE_URL + ACTIVATION_CODE (tahap B). Lihat komentar di awal checks/live.mjs.');
  process.exit(2);
}
const gatewayOnly = !(BASE_URL && ACTIVATION_CODE);
const base = (BASE_URL ?? '').replace(/\/$/, '');
const origin = base ? new URL(base).origin : '';
const photo = PHOTO_PATH ? fs.readFileSync(PHOTO_PATH) : TINY_JPEG;
const sha256 = createHash('sha256').update(photo).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
const must = (cond, msg) => {
  console.log(`${cond ? 'LULUS' : 'GAGAL'}  ${msg}`);
  if (!cond) failures++;
};
const info = (msg) => console.log(`INFO   ${msg}`);

const call = (path, { method = 'GET', cookie, body, headers = {}, timeoutMs } = {}) =>
  fetch(base + path, {
    method,
    body,
    headers: { ...(method === 'GET' ? {} : { origin }), ...(cookie ? { cookie } : {}), ...headers },
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });
const json = (res) => res.json().catch(() => null);

async function activate(code) {
  const res = await call('/api/activate', { method: 'POST', body: JSON.stringify({ code }), headers: { 'content-type': 'application/json' } });
  return { res, body: await json(res), cookie: res.headers.getSetCookie?.()[0]?.split(';')[0] };
}

// 1. Gateway menolak pesan tanpa tanda tangan (opsional, butuh GATEWAY_URL)
if (GATEWAY_URL) {
  const health = await fetch(GATEWAY_URL).then(json).catch(() => null);
  must(health?.ok === true, 'GET gateway (health) membalas JSON ok; akses deployment tidak diblokir');
  if (health?.ok !== true) info('Bukan JSON dari gateway: biasanya halaman login Google, yaitu deployment bukan "Anyone" atau kebijakan Workspace memblokirnya.');
  else info(`build gateway: ${health.build ?? '(kosong: kode lama; buat versi baru deployment)'}`);
  const unsigned = await fetch(GATEWAY_URL, { method: 'POST', body: JSON.stringify({ msg: '{}', sig: 'x' }) }).then(json).catch(() => null);
  must(unsigned?.ok === false && unsigned.code === 'UNAUTHORIZED', 'POST gateway tanpa tanda tangan sah ditolak (UNAUTHORIZED)');
} else {
  info('GATEWAY_URL tidak diisi: uji gateway-langsung dilewati');
}
if (gatewayOnly) {
  info('Tahap A saja (BASE_URL/ACTIVATION_CODE tidak diisi): uji aplikasi dilewati');
  console.log(failures ? `${failures} pemeriksaan GAGAL` : 'pemeriksaan gateway lulus');
  process.exit(failures ? 1 : 0);
}

// 2. Tanpa sesi ditolak. Harus JSON NO_SESSION dari aplikasi kita: 401 saja bisa juga halaman login Vercel (Deployment Protection).
const noSession = await call('/api/session');
const noSessionBody = await json(noSession);
must(noSession.status === 401 && noSessionBody?.code === 'NO_SESSION', 'tanpa cookie: /api/session 401 NO_SESSION (JSON dari aplikasi)');
if (noSessionBody === null) {
  info('Respons bukan JSON dari aplikasi. Penyebab umum: Vercel Deployment Protection (halaman login Vercel), BASE_URL salah, atau deployment belum selesai.');
}
const idsProbe = { inspectionId: randomUUID(), photoId: randomUUID() };
const noSessionPhoto = await call(`/api/inspections/${idsProbe.inspectionId}/photos/${idsProbe.photoId}`);
must(noSessionPhoto.status === 401 && (await json(noSessionPhoto))?.code === 'NO_SESSION', 'tanpa cookie: baca foto 401 NO_SESSION walau ID diketahui');

// 3. Aktivasi sekali pakai
const a = await activate(ACTIVATION_CODE);
must(a.res.status === 200 && !!a.cookie, `aktivasi perangkat (HTTP ${a.res.status}${a.body?.code ? ' ' + a.body.code : ''})`);
if (!a.cookie) {
  if (a.body === null) info('Respons aktivasi bukan JSON dari aplikasi (lihat petunjuk di atas).');
  else if (a.body.code === 'GATEWAY_FAILURE' || a.body.code === 'SERVER_ERROR') info('Aplikasi tidak bisa memakai gateway: periksa GATEWAY_URL dan GATEWAY_HMAC_SECRET di Vercel (harus sama dengan Script Property), lalu deploy ulang.');
  else if (a.body.code === 'INVALID_ACTIVATION') info('Kode aktivasi salah, sudah dipakai, atau lewat 24 jam: terbitkan kode baru.');
  console.log('\nTidak bisa lanjut tanpa sesi.');
  process.exit(1);
}
const again = await activate(ACTIVATION_CODE);
must(again.res.status === 401 && again.body?.code === 'INVALID_ACTIVATION', 'kode yang sama tidak bisa dipakai dua kali');

// 4. Satu inspeksi + satu foto
const inspectionId = randomUUID();
const photoId = randomUUID();
const photoPath = `/api/inspections/${inspectionId}/photos/${photoId}`;
const prepareBody = JSON.stringify({
  inspectionId,
  inspectorName: 'Uji live T1',
  note: 'Data uji otomatis checks/live.mjs; boleh dihapus.',
  observedAt: new Date().toISOString(),
  photoIds: [photoId],
});
const prep = await call('/api/inspections', { method: 'POST', cookie: a.cookie, body: prepareBody, headers: { 'content-type': 'application/json' } });
const prepJson = await json(prep);
must(prep.status === 200 && prepJson?.photos?.[0]?.status === 'reserved', `prepareInspection (HTTP ${prep.status}); foto berstatus reserved`);
const prep2 = await call('/api/inspections', { method: 'POST', cookie: a.cookie, body: prepareBody, headers: { 'content-type': 'application/json' } });
must(prep2.status === 200, 'prepareInspection diulang dengan isi sama tetap 200 (idempoten)');

// 5. Upload pertama diputus klien lebih awal (respons hilang), lalu diulang dengan ID yang sama
const putOnce = (timeoutMs) =>
  call(photoPath, { method: 'PUT', cookie: a.cookie, body: photo, headers: { 'content-type': 'image/jpeg', 'x-photo-sha256': sha256 }, timeoutMs });
let firstAborted = false;
const t0 = Date.now();
try {
  const first = await putOnce(ABORT_MS);
  info(`upload pertama selesai dalam ${Date.now() - t0} ms (HTTP ${first.status}) sebelum batas ${ABORT_MS} ms: skenario respons hilang TIDAK terjadi; turunkan ABORT_MS`);
} catch {
  firstAborted = true;
  info(`upload pertama diputus klien setelah ${ABORT_MS} ms (simulasi respons hilang)`);
}
let second;
let secondJson;
for (let i = 0; i < 6; i++) {
  second = await putOnce();
  secondJson = await json(second);
  if (second.status !== 503 && second.status !== 504) break;
  info(`pengulangan ${i + 1}: HTTP ${second.status} (server mungkin masih memproses percobaan pertama), menunggu 3 dtk`);
  await sleep(3000);
}
must(second.status === 200 && secondJson?.status === 'stored' && secondJson.sha256 === sha256, `upload diulang dengan photoId sama: server mengonfirmasi stored + checksum sama (HTTP ${second.status})`);
info(`replayed=${secondJson?.replayed}${firstAborted && secondJson?.replayed ? ' -> file sudah tersimpan oleh percobaan yang respons-nya hilang' : ''}`);
const third = await putOnce();
const thirdJson = await json(third);
must(third.status === 200 && thirdJson?.replayed === true, 'upload ketiga: replay, tidak menyimpan lagi');

// 6. Baca kembali foto privat
const read = await call(photoPath, { cookie: a.cookie });
const readBytes = Buffer.from(await read.arrayBuffer());
must(read.status === 200 && createHash('sha256').update(readBytes).digest('hex') === sha256, `foto dibaca kembali via aplikasi; bytes identik (HTTP ${read.status})`);
must(/private/.test(read.headers.get('cache-control') ?? ''), 'respons foto bertanda Cache-Control private');
must((await call(`/api/inspections/${randomUUID()}/photos/${photoId}`, { cookie: a.cookie })).status === 404, 'inspeksi yang tidak ada: 404');

// 7. Perangkat lain tidak boleh membaca/menulis
if (ACTIVATION_CODE_2) {
  const b = await activate(ACTIVATION_CODE_2);
  must(!!b.cookie, 'aktivasi perangkat kedua');
  if (b.cookie) {
    must((await call(photoPath, { cookie: b.cookie })).status === 403, 'perangkat kedua membaca foto perangkat pertama: 403');
    const forbiddenPut = await call(photoPath, { method: 'PUT', cookie: b.cookie, body: photo, headers: { 'content-type': 'image/jpeg', 'x-photo-sha256': sha256 } });
    must(forbiddenPut.status === 403, 'perangkat kedua mengunggah ke inspeksi perangkat pertama: 403');
  }
} else {
  info('ACTIVATION_CODE_2 tidak diisi: uji lintas perangkat dilewati');
}

console.log(`
Periksa MANUAL (tidak bisa dibuktikan dari skrip ini):
  - Drive staging: tepat 1 file bernama ${inspectionId}_${photoId}.jpg
  - Spreadsheet staging: tab Photos punya 1 baris untuk photo_id ${photoId} berstatus stored
  - Foto tidak dapat dibuka lewat tautan Drive tanpa izin (bukan "Anyone with the link")
`);
console.log(failures ? `${failures} pemeriksaan GAGAL` : 'semua pemeriksaan otomatis lulus');
process.exit(failures ? 1 : 0);
