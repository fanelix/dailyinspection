// Pembuktian T1 terhadap STAGING sungguhan (Vercel + Apps Script + Drive + Sheets). Tidak dijalankan oleh `npm run check`.
//
// Dua tahap (boleh dijalankan terpisah):
//   Tahap A, hanya Apps Script : GATEWAY_URL=<url /exec> node checks/live.mjs
//   Tahap B, seluruh alur      : BASE_URL=https://<staging> [GATEWAY_URL=<url /exec>] node checks/live.mjs
// Opsional: GATEWAY_URL  (URL /exec, untuk uji "gateway menolak pesan tanpa tanda tangan" dan menampilkan build)
//           PHOTO_PATH   (JPEG <= 2 MB; bawaan: JPEG 8x8. Skrip ini mengirim byte apa adanya, tanpa kompresi)
//           ABORT_MS     (batas klien pada upload pertama untuk mensimulasikan respons hilang; bawaan 1500)
//
// Tanpa aktivasi perangkat (keputusan pengguna 2026-10-09): tidak ada kode atau cookie yang diperlukan.
// Skrip ini membuat data uji sungguhan (2 inspeksi, 1 foto) di staging. Jangan arahkan ke produksi.
// Yang TIDAK bisa dibuktikan dari sini: jumlah file di Drive dan baris di Sheets; periksa manual (lihat keluaran akhir).
import fs from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { TINY_JPEG } from './tiny-jpeg.mjs';

const { BASE_URL, GATEWAY_URL, PHOTO_PATH } = process.env;
const ABORT_MS = Number(process.env.ABORT_MS) || 1500;
if (!GATEWAY_URL && !BASE_URL) {
  console.error('Isi GATEWAY_URL saja (tahap A), atau BASE_URL (tahap B). Lihat komentar di awal checks/live.mjs.');
  process.exit(2);
}
const gatewayOnly = !BASE_URL;
const base = (BASE_URL ?? '').replace(/\/$/, '');
const photo = PHOTO_PATH ? fs.readFileSync(PHOTO_PATH) : TINY_JPEG;
const sha256 = createHash('sha256').update(photo).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
const must = (cond, msg) => {
  console.log(`${cond ? 'LULUS' : 'GAGAL'}  ${msg}`);
  if (!cond) failures++;
};
const info = (msg) => console.log(`INFO   ${msg}`);

const call = (path, { method = 'GET', body, headers = {}, timeoutMs } = {}) =>
  fetch(base + path, { method, body, headers, signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined });
const json = (res) => res.json().catch(() => null);
const jsonHeaders = { 'content-type': 'application/json' };

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
  info('Tahap A saja (BASE_URL tidak diisi): uji aplikasi dilewati');
  console.log(failures ? `${failures} pemeriksaan GAGAL` : 'pemeriksaan gateway lulus');
  process.exit(failures ? 1 : 0);
}

// 2. Sidik jari aplikasi. Body kosong harus dijawab 400 VALIDATION_ERROR yang berasal dari gateway: jawaban itu hanya
// mungkin bila aplikasi kita yang melayani (bukan halaman login Vercel), GATEWAY_URL benar, dan HMAC cocok.
const probe = await call('/api/inspections', { method: 'POST', body: '{}', headers: jsonHeaders });
const probeBody = await json(probe);
must(probe.status === 400 && probeBody?.code === 'VALIDATION_ERROR', `aplikasi + GATEWAY_URL + HMAC bekerja (POST /api/inspections {} -> HTTP ${probe.status}${probeBody?.code ? ' ' + probeBody.code : ''})`);
if (probeBody?.code !== 'VALIDATION_ERROR') {
  if (probeBody === null) info('Respons bukan JSON dari aplikasi. Penyebab umum: Vercel Deployment Protection (halaman login Vercel), BASE_URL salah, atau deployment belum selesai/bukan dari branch aplikasi.');
  else if (probeBody.code === 'SERVER_ERROR') info('Aplikasi tidak bisa memakai gateway: periksa GATEWAY_URL dan GATEWAY_HMAC_SECRET di Vercel (harus sama dengan Script Property), centang untuk environment yang dipakai, lalu deploy ulang.');
  console.log('\nTidak bisa lanjut: jalur aplikasi -> gateway belum bekerja.');
  process.exit(1);
}

// Data sintetis; tidak menyatakan hasil observasi lapangan.
const checklist = {
  schemaVersion: 2, templateVersion: '2026-10-09.draft1', areaId: 'pit',
  answers: ['cracks', 'loose_material', 'slope_changes', 'seepage', 'drainage', 'access']
    .map(itemId => ({ itemId, answer: 'not_inspected', finding: null })),
};

// 3. Satu inspeksi + satu foto
const inspectionId = randomUUID();
const photoId = randomUUID();
const photoPath = `/api/inspections/${inspectionId}/photos/${photoId}`;
const prepareBody = JSON.stringify({
  ...checklist,
  inspectionId,
  inspectorName: 'Uji live T1',
  note: '=Data uji otomatis checks/live.mjs; boleh dihapus.',
  observedAt: new Date().toISOString(),
  photoIds: [photoId],
});
const incomplete = JSON.parse(prepareBody);
incomplete.answers[0].answer = null;
const blank = await call('/api/inspections', { method: 'POST', body: JSON.stringify(incomplete), headers: jsonHeaders });
must(blank.status === 400 && (await json(blank))?.code === 'VALIDATION_ERROR', 'jawaban kosong ditolak sebelum penyimpanan');
const prep = await call('/api/inspections', { method: 'POST', body: prepareBody, headers: jsonHeaders });
const prepJson = await json(prep);
must(prepJson?.schemaVersion === 2 && prepJson?.templateVersion === checklist.templateVersion && /^[0-9a-f]{64}$/.test(prepJson?.checklistSha256 ?? ''), 'gateway mengonfirmasi versi dan checksum checklist T2');
must(prep.status === 200 && prepJson?.photos?.[0]?.status === 'reserved', `prepareInspection (HTTP ${prep.status}); foto berstatus reserved`);
const prep2 = await call('/api/inspections', { method: 'POST', body: prepareBody, headers: jsonHeaders });
must(prep2.status === 200, 'prepareInspection diulang dengan isi sama tetap 200 (idempoten)');
const conflict = await call('/api/inspections', { method: 'POST', body: prepareBody.replace('Uji live T1', 'Nama lain'), headers: jsonHeaders });
must(conflict.status === 409, 'ID inspeksi yang sama dengan isi berbeda ditolak (409)');

// 4. Upload pertama diputus klien lebih awal (respons hilang), lalu diulang dengan ID yang sama
const putOnce = (timeoutMs) =>
  call(photoPath, { method: 'PUT', body: photo, headers: { 'content-type': 'image/jpeg', 'x-photo-sha256': sha256 }, timeoutMs });
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

// 5. Baca kembali foto privat
const read = await call(photoPath);
const readBytes = Buffer.from(await read.arrayBuffer());
must(read.status === 200 && createHash('sha256').update(readBytes).digest('hex') === sha256, `foto dibaca kembali via aplikasi; bytes identik (HTTP ${read.status})`);
must(/private/.test(read.headers.get('cache-control') ?? ''), 'respons foto bertanda Cache-Control private');

// 6. Tanpa aktivasi, satu-satunya penjaga adalah pasangan ID: foto hanya terbaca dengan pasangan yang benar
const otherInspection = randomUUID();
const otherPrep = await call('/api/inspections', {
  method: 'POST',
  body: JSON.stringify({ ...checklist, inspectionId: otherInspection, inspectorName: 'Uji live T1 (pembanding)', note: '', observedAt: new Date().toISOString(), photoIds: [randomUUID()] }),
  headers: jsonHeaders,
});
must(otherPrep.status === 200, 'inspeksi pembanding dibuat');
must((await call(`/api/inspections/${otherInspection}/photos/${photoId}`)).status === 404, 'foto A dengan ID inspeksi lain: 404');
must((await call(`/api/inspections/${randomUUID()}/photos/${photoId}`)).status === 404, 'ID inspeksi yang tidak ada: 404');
must((await call('/api/inspections/abc/photos/def')).status === 400, 'ID bukan UUID: 400');

console.log(`
Periksa MANUAL (tidak bisa dibuktikan dari skrip ini):
  - Drive staging: tepat 1 file bernama ${inspectionId}_${photoId}.jpg
  - Spreadsheet staging: tab Photos punya 1 baris untuk photo_id ${photoId} berstatus stored
  - Tab Inspections: kolom note berisi teks "=Data uji ..." apa adanya (bukan #ERROR! atau hasil rumus)
  - Foto tidak dapat dibuka lewat tautan Drive tanpa izin (bukan "Anyone with the link")
`);
console.log(failures ? `${failures} pemeriksaan GAGAL` : 'semua pemeriksaan otomatis lulus');
process.exit(failures ? 1 : 0);
