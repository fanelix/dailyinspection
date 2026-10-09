// Pembuktian T1 dari BROWSER, tanpa Node dan tanpa instal apa pun (untuk laptop yang tidak boleh memasang aplikasi).
// Setara tahap B checks/live.mjs, minus pemeriksaan gateway-langsung (browser tidak boleh memanggil script.google.com
// karena CORS; tahap A tetap dijalankan dari terminal oleh siapa pun yang punya Node).
//
// Cara pakai:
//   1. Buka halaman aplikasi yang diuji, mis. https://dailyinspection.vercel.app/
//   2. Tekan F12 -> tab Console.
//   3. Bila Chrome memperingatkan soal menempel kode, ketik  allow pasting  lalu Enter.
//   4. Tempel SELURUH isi file ini, tekan Enter, tunggu sampai muncul "semua pemeriksaan otomatis lulus" (sekitar 10-30 dtk).
//   5. Salin seluruh keluaran Console (klik kanan -> Save as... atau pilih semua teks) dan kirim.
//
// Kode ini hanya memanggil alamat di origin yang sama (fetch relatif) dan membuat data uji sungguhan di staging
// (2 inspeksi, 1 foto kecil). Jangan dijalankan di halaman lain atau terhadap produksi. Tidak ada yang dikirim ke luar.
(async () => {
  const ABORT_MS = 1500; // batas klien pada upload pertama untuk mensimulasikan respons hilang
  let failures = 0;
  const must = (cond, msg) => {
    console.log(`${cond ? 'LULUS' : 'GAGAL'}  ${msg}`);
    if (!cond) failures++;
  };
  const info = (msg) => console.log(`INFO   ${msg}`);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const json = (res) => res.json().catch(() => null);
  const jsonHeaders = { 'content-type': 'application/json' };
  const post = (body) => fetch('/api/inspections', { method: 'POST', headers: jsonHeaders, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const sha256Hex = async (buf) =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');

  // Foto uji: JPEG 64x64 yang dibuat kanvas (valid, beberapa ratus byte).
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1e783c';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#f0c828';
  ctx.fillRect(16, 16, 32, 32);
  const photo = await (await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))).arrayBuffer();
  const sha = await sha256Hex(photo);
  info(`origin yang diuji: ${location.origin} | foto uji ${photo.byteLength} byte`);

  // 1. Sidik jari aplikasi: body kosong harus dijawab 400 VALIDATION_ERROR dari gateway. Jawaban itu hanya mungkin bila
  // aplikasi kita yang melayani (bukan halaman login Vercel), GATEWAY_URL benar, dan HMAC cocok.
  const probe = await post('{}');
  const probeBody = await json(probe);
  must(probe.status === 400 && probeBody?.code === 'VALIDATION_ERROR', `aplikasi + GATEWAY_URL + HMAC bekerja (POST /api/inspections {} -> HTTP ${probe.status}${probeBody?.code ? ' ' + probeBody.code : ''})`);
  if (probeBody?.code !== 'VALIDATION_ERROR') {
    if (probeBody === null) info('Respons bukan JSON dari aplikasi: halaman login Vercel (Deployment Protection), deployment belum dipromosikan/bukan dari branch aplikasi, atau halaman ini bukan aplikasi kita.');
    else if (probeBody.code === 'SERVER_ERROR') info('Aplikasi tidak bisa memakai gateway: periksa GATEWAY_URL dan GATEWAY_HMAC_SECRET di Vercel (harus sama dengan Script Property), centang untuk environment Production, lalu deploy ulang.');
    console.log('Tidak bisa lanjut: jalur aplikasi -> gateway belum bekerja.');
    return { failures: failures };
  }

  // Data sintetis; tidak menyatakan hasil observasi lapangan.
  const checklist = {
    schemaVersion: 2, templateVersion: '2026-10-09.draft1', areaId: 'pit',
    answers: ['cracks', 'loose_material', 'slope_changes', 'seepage', 'drainage', 'access']
      .map(itemId => ({ itemId, answer: 'not_inspected', finding: null })),
  };

  // 2. Satu inspeksi + satu foto
  const inspectionId = crypto.randomUUID();
  const photoId = crypto.randomUUID();
  const photoPath = `/api/inspections/${inspectionId}/photos/${photoId}`;
  const prepareBody = JSON.stringify({
    ...checklist,
    inspectionId,
    inspectorName: 'Uji live T1 (browser)',
    note: '=Data uji otomatis checks/live-browser.js; boleh dihapus.',
    observedAt: new Date().toISOString(),
    photoIds: [photoId],
  });
  const incomplete = JSON.parse(prepareBody);
  incomplete.answers[0].answer = null;
  const blank = await post(incomplete);
  must(blank.status === 400 && (await json(blank))?.code === 'VALIDATION_ERROR', 'jawaban kosong ditolak sebelum penyimpanan');
  const prep = await post(prepareBody);
  const prepJson = await json(prep);
  must(prepJson?.schemaVersion === 2 && prepJson?.templateVersion === checklist.templateVersion && /^[0-9a-f]{64}$/.test(prepJson?.checklistSha256 ?? ''), 'gateway mengonfirmasi versi dan checksum checklist T2');
  must(prep.status === 200 && prepJson?.photos?.[0]?.status === 'reserved', `prepareInspection (HTTP ${prep.status}); foto berstatus reserved`);
  must((await post(prepareBody)).status === 200, 'prepareInspection diulang dengan isi sama tetap 200 (idempoten)');
  must((await post(prepareBody.replace('Uji live T1 (browser)', 'Nama lain'))).status === 409, 'ID inspeksi yang sama dengan isi berbeda ditolak (409)');

  // 3. Upload pertama diputus klien lebih awal (respons hilang), lalu diulang dengan ID yang sama
  const putOnce = (signal) => fetch(photoPath, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-photo-sha256': sha }, body: photo, signal });
  let firstAborted = false;
  const t0 = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ABORT_MS);
  try {
    const first = await putOnce(controller.signal);
    info(`upload pertama selesai dalam ${Math.round(performance.now() - t0)} ms (HTTP ${first.status}) sebelum batas ${ABORT_MS} ms: skenario respons hilang TIDAK terjadi (koneksi cepat); hasil lain tetap sah`);
  } catch {
    firstAborted = true;
    info(`upload pertama diputus klien setelah ${ABORT_MS} ms (simulasi respons hilang)`);
  } finally {
    clearTimeout(timer);
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
  must(second.status === 200 && secondJson?.status === 'stored' && secondJson.sha256 === sha, `upload diulang dengan photoId sama: server mengonfirmasi stored + checksum sama (HTTP ${second.status})`);
  info(`replayed=${secondJson?.replayed}${firstAborted && secondJson?.replayed ? ' -> file sudah tersimpan oleh percobaan yang respons-nya hilang' : ''}`);
  const third = await putOnce();
  const thirdJson = await json(third);
  must(third.status === 200 && thirdJson?.replayed === true, 'upload ketiga: replay, tidak menyimpan lagi');

  // 4. Baca kembali foto privat
  const read = await fetch(photoPath);
  const readSha = read.ok ? await sha256Hex(await read.arrayBuffer()) : '';
  must(read.status === 200 && readSha === sha, `foto dibaca kembali via aplikasi; bytes identik (HTTP ${read.status})`);
  must(/private/.test(read.headers.get('cache-control') ?? ''), 'respons foto bertanda Cache-Control private');

  // 5. Tanpa aktivasi, satu-satunya penjaga adalah pasangan ID: foto hanya terbaca dengan pasangan yang benar
  const otherInspection = crypto.randomUUID();
  const otherPrep = await post({ ...checklist, inspectionId: otherInspection, inspectorName: 'Uji live T1 (pembanding)', note: '', observedAt: new Date().toISOString(), photoIds: [crypto.randomUUID()] });
  must(otherPrep.status === 200, 'inspeksi pembanding dibuat');
  must((await fetch(`/api/inspections/${otherInspection}/photos/${photoId}`)).status === 404, 'foto A dengan ID inspeksi lain: 404');
  must((await fetch(`/api/inspections/${crypto.randomUUID()}/photos/${photoId}`)).status === 404, 'ID inspeksi yang tidak ada: 404');
  must((await fetch('/api/inspections/abc/photos/def')).status === 400, 'ID bukan UUID: 400');

  console.log(`
Periksa MANUAL (tidak bisa dibuktikan dari browser):
  - Drive staging: tepat 1 file bernama ${inspectionId}_${photoId}.jpg
  - Spreadsheet staging: tab Photos punya 1 baris untuk photo_id ${photoId} berstatus stored
  - Tab Inspections: kolom note berisi teks "=Data uji ..." apa adanya (bukan #ERROR! atau hasil rumus)
  - Foto tidak dapat dibuka lewat tautan Drive tanpa izin (bukan "Anyone with the link")
`);
  console.log(failures ? `${failures} pemeriksaan GAGAL` : 'semua pemeriksaan otomatis lulus');
  return { failures: failures };
})();
