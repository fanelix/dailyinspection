// T7 — uji browser nyata (Chromium headless, bukan Android) untuk mode pesawat, kuota penyimpanan,
// eviction IndexedDB, dan Web Locks dua tab. Gateway = runtime Apps Script palsu (checks/fake-apps-script.mjs),
// jadi ini membuktikan logika klien dan jalur Next, BUKAN Sheets/Drive/Apps Script sungguhan.
// Tidak masuk `npm run check`. Jalankan setelah `npm run build`:
//   node checks/t7-browser.mjs
// Opsional: PLAYWRIGHT_MODULE (path modul playwright bila tidak bisa di-import dari repo),
//           CHROMIUM_PATH (binary Chromium bila bukan default Playwright).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createFakeAppsScript, startFakeGateway } from './fake-apps-script.mjs';
import { TINY_JPEG } from './tiny-jpeg.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const playwright = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright';
const { chromium } = await import(playwright);
const port = Number(process.env.T7_PORT ?? 3100);
const base = `http://127.0.0.1:${port}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
let step = 'persiapan';
const must = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${msg}`);
};
const info = (msg) => console.log(`INFO   ${msg}`);

// Hitungan dari tiruan Sheets: baris record berawalan UUID, foto berstatus stored, inspeksi berstatus submitted.
const rowsOf = (name) => fake.state.sheets.get(name)?.rows ?? [];
const inspections = () => rowsOf('Inspections').filter((r) => UUID.test(String(r[0])));
const storedPhotos = () => rowsOf('Photos').slice(1).filter((r) => r.includes('stored')).length;

const secret = crypto.randomBytes(32).toString('hex'); // hanya hidup di proses ini; tidak dicetak
const fake = createFakeAppsScript({ secret });
const gateway = await startFakeGateway(fake);
let nextLog = '';
const next = spawn(path.join(root, 'node_modules/.bin/next'), ['start', '-p', String(port), '-H', '127.0.0.1'], {
  cwd: root,
  env: { ...process.env, GATEWAY_URL: gateway.url, GATEWAY_HMAC_SECRET: secret },
  stdio: ['ignore', 'pipe', 'pipe'],
});
next.stdout.on('data', (d) => (nextLog += d));
next.stderr.on('data', (d) => (nextLog += d));

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    const up = await new Promise((resolve) =>
      http.get(base, (res) => { res.resume(); resolve(res.statusCode === 200); }).on('error', () => resolve(false)),
    );
    if (up) return;
    await sleep(500);
  }
  throw new Error(`Next tidak siap di ${base}:\n${nextLog}`);
}

// Keadaan tombol dan status untuk diagnosis saat tombol tidak bisa diklik.
async function snapshot(page, label) {
  const queuedDisabled = await page.getByRole('button', { name: 'Kirim yang tertunda' }).isDisabled();
  const fieldsetDisabled = await page.locator('fieldset.form-fields').isDisabled().catch(() => 'tidak ada');
  const texts = await page.locator('.status').allTextContents();
  return `${label}: tombol Kirim yang tertunda disabled=${queuedDisabled}; fieldset disabled=${fieldsetDisabled}; status=${JSON.stringify(texts)}`;
}

// Data uji sintetis: koordinat dan nama hanya untuk uji, bukan observasi lapangan.
async function fillDraft(page, name) {
  await page.getByLabel('Nama petugas').fill(name);
  await page.getByLabel('Area inspeksi').selectOption('pit');
  const answers = page.getByRole('radio', { name: 'Tidak diperiksa' });
  for (let i = 0; i < (await answers.count()); i++) await answers.nth(i).check();
  await page.getByRole('radio', { name: 'WGS84 lat/long' }).check();
  await page.locator('#latitude').fill('-2');
  await page.locator('#longitude').fill('117');
  await page.getByRole('button', { name: 'Pratinjau koordinat manual' }).click();
  await page.getByRole('button', { name: 'Konfirmasi lokasi objek' }).click();
  await page.locator('#photo').setInputFiles({ name: 'uji.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG });
  await page.getByText('foto siap').waitFor({ timeout: 30000 });
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(String(err)));

try {
  await waitForServer();
  await page.goto(base);
  await page.getByRole('button', { name: 'Siapkan pencatatan offline' }).click();
  await page.getByText('Siap untuk pencatatan offline').waitFor({ timeout: 120000 });
  must(true, 'Persiapan offline: indikator Siap muncul (shell dan aset di-cache)');

  step = '0. kirim online';
  // 0. Jalur online normal sebagai pembanding.
  const s0 = { ins: inspections().length, photos: storedPhotos() };
  await fillDraft(page, 'Uji T7 online');
  await page.getByRole('button', { name: 'Kirim', exact: true }).click();
  await page.getByText('Inspeksi terkirim dan difinalisasi').waitFor({ timeout: 60000 });
  must(inspections().length === s0.ins + 1, 'Kirim online: tepat satu inspeksi baru di Sheets');
  must(storedPhotos() === s0.photos + 1, 'Kirim online: satu foto berstatus stored');

  step = '1. mode pesawat';
  // 1. Mode pesawat: simpan ke antrean, reload, gagal saat offline, lalu terkirim sekali saat online.
  await page.getByRole('button', { name: 'Mulai inspeksi baru' }).click();
  await fillDraft(page, 'Uji T7 pesawat');
  const s1 = { ins: inspections().length, photos: storedPhotos() };
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Simpan untuk dikirim nanti' }).click();
  await page.getByText('Kiriman disimpan dalam antrean').waitFor({ timeout: 30000 });
  must(inspections().length === s1.ins, 'Mode pesawat: simpan untuk dikirim nanti tanpa menulis ke Sheets');
  await page.reload();
  await page.getByRole('heading', { name: 'Draft di perangkat' }).waitFor({ timeout: 30000 });
  await page.getByText('Menunggu kirim').first().waitFor({ timeout: 30000 });
  must(true, 'Mode pesawat + reload: antrean pulih dari shell offline');
  await page.getByRole('button', { name: 'Kirim yang tertunda' }).click();
  // Tunggu galat final (setelah percobaan ulang gagal), bukan galat pertama, agar tidak kembali online di tengah retry.
  await page.getByText('memakai ID yang sama saat dicoba lagi').waitFor({ timeout: 90000 });
  must((await page.locator('.status.error').count()) > 0, 'Kirim yang tertunda saat offline: galat final terlihat');
  must(inspections().length === s1.ins, 'Kirim yang tertunda saat offline: Sheets tidak berubah');
  must((await page.getByText('Menunggu kirim').count()) > 0, 'Kirim offline gagal: draft tetap menunggu kirim');
  await context.setOffline(false);
  await sleep(1000);
  info(await snapshot(page, 'sebelum kirim ulang online'));
  await page.getByRole('button', { name: 'Kirim yang tertunda' }).click({ timeout: 15000 });
  await page.getByText('Inspeksi terkirim dan difinalisasi').waitFor({ timeout: 60000 });
  must(inspections().length === s1.ins + 1, 'Online lagi: antrean terkirim tepat satu inspeksi, tanpa duplikat');
  must(storedPhotos() === s1.photos + 1, 'Online lagi: foto antrean berstatus stored sekali');
  must((await page.getByText('Menunggu kirim').count()) === 0, 'Setelah terkirim: tidak ada draft menunggu kirim');

  step = '2. dua tab';
  // 2. Web Locks dua tab: tab 1 menahan kiriman (rute ditunda), tab 2 harus ditolak dengan pesan jelas.
  await page.getByRole('button', { name: 'Mulai inspeksi baru' }).click();
  await fillDraft(page, 'Uji T7 dua tab');
  await page.getByRole('button', { name: 'Simpan untuk dikirim nanti' }).click();
  await page.getByText('Kiriman disimpan dalam antrean').waitFor({ timeout: 30000 });
  const page2 = await context.newPage();
  await page2.goto(base);
  await page2.getByRole('heading', { name: 'Draft di perangkat' }).waitFor({ timeout: 30000 });
  const s2 = inspections().length;
  await page.route('**/api/inspections**', async (route) => { await sleep(2500); await route.continue(); });
  const send1 = page.getByRole('button', { name: 'Kirim yang tertunda' }).click();
  await sleep(400);
  await page2.getByRole('button', { name: 'Kirim yang tertunda' }).click();
  await page2.getByText('Pengiriman berjalan di tab lain').waitFor({ timeout: 15000 });
  must(true, 'Dua tab: tab kedua ditolak Web Locks dengan pesan jelas');
  await send1;
  await page.getByText('Inspeksi terkirim dan difinalisasi').waitFor({ timeout: 60000 });
  await page.unroute('**/api/inspections**');
  must(inspections().length === s2 + 1, 'Dua tab: tepat satu inspeksi untuk antrean yang sama');
  await page2.close();

  step = '3. kuota';
  // 3. Kuota IndexedDB habis: simpan harus gagal terlihat dan tidak mengklaim tersimpan; lalu simpan berhasil lagi.
  //    (a) batas kuota CDP nyata; bila Chromium tidak memicu galat tulis, (b) suntikan QuotaExceededError di halaman.
  step = '3. kuota';
  await page.getByRole('button', { name: 'Mulai inspeksi baru' }).click();
  await fillDraft(page, 'Uji T7 kuota');
  await page.getByText(/Draft dan \d+ foto tersimpan di perangkat/).waitFor({ timeout: 30000 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Storage.overrideQuotaForOrigin', { origin: base, quotaSize: 1 });
  info(`estimasi kuota setelah batas CDP: ${JSON.stringify(await page.evaluate(() => navigator.storage.estimate()))}`);
  await page.getByLabel('Nama petugas').fill('Uji T7 kuota diubah'); // tanpa perubahan, persist() tidak menulis
  await page.getByRole('button', { name: 'Simpan draft sekarang' }).click();
  const cdpFailed = await page.getByRole('button', { name: 'Muat versi tersimpan' }).waitFor({ timeout: 8000 }).then(() => true, () => false);
  await cdp.send('Storage.overrideQuotaForOrigin', { origin: base });
  info(`batas kuota CDP ${cdpFailed ? 'memicu' : 'TIDAK memicu'} galat tulis IndexedDB di Chromium ini`);
  if (cdpFailed) {
    must(true, 'Kuota CDP habis: kegagalan simpan tampil (tombol pemulihan muncul)');
  } else {
    // Suntikan: galat tulis IndexedDB di halaman. Ini meniru jalur galat yang sama, bukan kuota OS/browser nyata.
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (window.__t7QuotaFail) throw new DOMException('Kuota penyimpanan habis (suntikan uji)', 'QuotaExceededError');
        return put.apply(this, args);
      };
      window.__t7QuotaFail = true;
    });
    await page.getByLabel('Nama petugas').fill('Uji T7 kuota suntik');
    await page.getByRole('button', { name: 'Simpan draft sekarang' }).click();
    await page.getByRole('button', { name: 'Muat versi tersimpan' }).waitFor({ timeout: 30000 }).catch(async (err) => {
      info(await snapshot(page, 'kuota suntik: tombol pemulihan tidak muncul'));
      throw err;
    });
    must((await page.getByText(/Draft dan \d+ foto tersimpan/).count()) === 0, 'Kuota habis (suntikan): UI tidak mengklaim draft tersimpan');
    must(true, 'Kuota habis (suntikan): kegagalan simpan tampil dengan jalur pemulihan');
    await page.evaluate(() => { window.__t7QuotaFail = false; });
    await page.getByRole('button', { name: 'Simpan draft sekarang' }).click();
    await page.getByText(/Draft dan \d+ foto tersimpan di perangkat/).waitFor({ timeout: 30000 });
    must(true, 'Kuota pulih (suntikan dilepas): simpan berhasil lagi');
  }

  step = '4. eviksi';
  // 4. Eviction IndexedDB (simulasi browser menghapus data situs): antrean hilang, tidak ada kiriman palsu.
  await page.getByRole('button', { name: 'Mulai inspeksi baru' }).click();
  await sleep(1500);
  info(await snapshot(page, 'eviksi: setelah draft baru dibuka'));
  await fillDraft(page, 'Uji T7 eviksi');
  await page.getByRole('button', { name: 'Simpan untuk dikirim nanti' }).click();
  await page.getByText('Kiriman disimpan dalam antrean').waitFor({ timeout: 30000 });
  const s4 = inspections().length;
  const errorsBefore = pageErrors.length;
  await cdp.send('Storage.clearDataForOrigin', { origin: base, storageTypes: 'indexeddb' });
  await page.reload();
  await page.getByRole('heading', { name: 'Draft di perangkat' }).waitFor({ timeout: 30000 });
  must((await page.getByText('Menunggu kirim').count()) === 0, 'Eviksi IndexedDB: antrean tidak muncul kembali');
  must((await page.getByText('Uji T7 eviksi').count()) === 0, 'Eviksi IndexedDB: draft yang hilang tidak tampil lagi, tanpa klaim terkirim');
  must(inspections().length === s4, 'Eviksi IndexedDB: tidak ada kiriman otomatis ke Sheets');
  must(pageErrors.length === errorsBefore, 'Eviksi IndexedDB: halaman tidak melempar galat tak tertangani');
  info('Eviksi nyata oleh OS/browser tidak bisa diuji di sini; ini hanya penghapusan IndexedDB oleh CDP.');
  info(`galat halaman tak tertangani selama uji: ${pageErrors.length}`);
  for (const e of pageErrors) info(`galat halaman: ${e.split('\n')[0].slice(0, 300)}`);
} catch (err) {
  failures++;
  console.log(`GAGAL  alur berhenti pada langkah "${step}": ${String(err.message).split('\n')[0]}`);
  const body = await page.locator('body').innerText({ timeout: 2000 }).catch(() => '(halaman tidak terbaca)');
  info(`teks halaman saat berhenti: ${body.replace(/\s+/g, ' ').slice(0, 700)}`);
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await gateway.close().catch(() => {});
  next.kill('SIGTERM');
}

console.log(failures === 0 ? 'SEMUA PEMERIKSAAN BROWSER LULUS' : `${failures} PEMERIKSAAN GAGAL`);
process.exitCode = failures === 0 ? 0 : 1;
