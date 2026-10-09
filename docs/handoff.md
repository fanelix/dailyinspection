# Serah terima sesi — 2026-10-09 (T0 dan T1 selesai; T2 berikutnya)

Dokumen ini untuk sesi baru. Baca bersama `AGENTS.md`, `CLAUDE.md`, `docs/plan.md` (v1.1, salinan apa adanya, tidak diubah) dan `README.md` (runbook staging, keputusan akses, daftar yang belum terbukti). Tidak ada rahasia, URL gateway, atau domain Vercel di sini; tanyakan ke pengguna bila perlu.

## 1. Mulai dari mana
- Repo `fanelix/dailyinspection`. **Semua pekerjaan ada di branch `claude/eager-carson-bqb25q`.** `main` di remote hanya berisi `Initial commit` (README + LICENSE); belum ada PR dan belum ada merge. Sesi baru harus memulai dari branch ini (`git fetch origin claude/eager-carson-bqb25q && git checkout claude/eager-carson-bqb25q`), bukan dari `main`, atau akan melihat repo kosong.
- HEAD terakhir sebelum dokumen ini: `bbbe9cd`. Riwayat lama repo ini (sebelum reset 8 Okt) **sengaja diabaikan** atas permintaan pengguna.
- Vercel (staging pengguna) men-deploy branch ini sebagai Production. Apps Script staging pengguna sudah ter-deploy dengan build `2026-10-09.1`.

## 2. Keputusan pengguna (berlaku, urut waktu)
1. 8 Okt: maksimal dua inspector; sekitar 80% lokasi tercover GSM; foto terkompresi cukup; Drive perusahaan; akses per perangkat.
2. Riwayat lama diabaikan; kerja dimulai dari repo kosong.
3. **Kompresi foto ditarik maju dari T4 ke T1** (agar uji Android memakai foto kamera asli).
4. 9 Okt: **aktivasi perangkat dihapus total** (menggantikan butir 1 bagian akses; menyimpang dari plan §3/§10/§14). Risiko diterima pengguna: siapa pun yang tahu URL bisa menulis ke Drive/Sheets; tidak ada pencabutan per perangkat; nama petugas tidak terbukti; batas laju belum ada dan **menunggu angka kapasitas dari pengguna (plan §16)**. Jangan memulihkan login atau menambah gerbang akses tanpa diminta. Foto hanya terjaga oleh pasangan ID inspeksi+foto (UUID acak): jangan menampilkan atau mencatat ID itu.

## 3. Apa yang ada
- **App (Next.js 16.3.8, App Router)**: `app/page.tsx` (form: nama, catatan, satu foto; kompres saat dipilih; ID dipertahankan saat kirim ulang; "tersimpan" hanya bila server menjawab `stored` dengan checksum sama), `app/api/inspections/route.ts` (prepare), `app/api/inspections/[id]/photos/[photoId]/route.ts` (PUT unggah, GET baca).
- **`lib/gateway.ts`**: pesan `{v, action, requestId, ts, payload}` ditandatangani HMAC-SHA256 atas string `msg` apa adanya; timeout/jaringan putus = `UPSTREAM_UNKNOWN` (hasil belum diketahui, retryable); `errorResponse` memetakan kode ke HTTP. **`lib/photos.ts`**: kompresi native (`createImageBitmap` + canvas, orientasi EXIF dibakar ke piksel, sisi panjang 2048, kualitas 0,8→0,7→0,6, ≤ 2 MB, latar putih untuk PNG transparan, EXIF tidak ikut), SHA-256.
- **Apps Script** (`apps-script/src/`): `gateway.js` (`doGet` health + `build`; `doPost` verifikasi HMAC, timestamp ±5 menit, nonce via CacheService, allowlist `prepareInspection`/`uploadPhoto`/`getPhoto`) dan `storage.js` (Sheets + Drive; `adminSelfTest` untuk menguji Drive+Sheets dari editor). **Naikkan `GATEWAY_BUILD` setiap perubahan perilaku gateway.**
- **Data**: tab `Inspections` [inspection_id, device_id (kosong, dipertahankan), inspector_name, observed_at, received_at, note, status, version] dan `Photos` [photo_id, inspection_id, drive_file_id, status, size, mime, sha256, reserved_at, stored_at]. Semua sel ditulis dengan format `@` **ditambah apostrof di depan** (diukur: format `@` saja tidak mencegah `=…` menjadi rumus).
- **Alur unggah**: `prepare` mencadangkan ID file Drive (`generateIds`) dan menyimpan petanya → PUT byte foto → `Drive.Files.create` dengan ID cadangan → baris `stored`. Retry idempoten; bila Drive menolak ID ganda, isi file diverifikasi lewat MD5 (jalur pemulihan, terbukti di Google).
- **Pemeriksaan**: `npm run check` (typecheck Next + Apps Script, 9 test), `checks/live.mjs` (Node; tahap A = hanya `GATEWAY_URL`, tahap B = `BASE_URL`), `checks/live-browser.js` (ditempel di Console; untuk laptop terkunci admin), `checks/fake-apps-script.mjs` (tiruan Apps Script, lihat jebakan di bawah).

## 4. Yang sudah terbukti (di staging pengguna)
Gateway menolak pesan tanpa tanda tangan; `adminSelfTest` lulus penuh di Drive+Sheets sungguhan; alur penuh lewat Vercel (14 pemeriksaan otomatis, termasuk upload diputus lalu diulang → `replayed=true`, satu file); pemeriksaan manual Drive/Sheets/privasi lulus; pengguna melaporkan uji Chrome Android berhasil (foto di Drive, keterangan di Sheets). Kompresi/orientasi/PNG transparan/file rusak/sumber 33 MB: Chromium headless desktop saja.

## 5. Jebakan yang sudah terjadi (jangan diulang)
- **Tiruan lokal hanya sebaik asumsinya.** Bug rumus Sheets lolos 10 test karena tiruan salah mengira format `@` cukup. Perilaku Google yang penting harus diukur di Google (`adminSelfTest`, atau probe sekali jalan), lalu tiruan disesuaikan dan test dibuat merah dulu.
- **Mengganti kode di editor Apps Script tidak mengubah deployment web app.** Buat versi baru (*Manage deployments → ✏ → New version*) lalu jalankan `GATEWAY_URL=… node checks/live.mjs` dan cocokkan `build gateway:`.
- **Vercel**: layar impor tidak punya pilihan branch; preset "Other" → `No Output Directory named "public"` (atur Framework Preset = Next.js); Production Branch harus branch aplikasi; deployment "Production Staged" harus di-*Promote*; URL unik per deployment biasanya terkunci Deployment Protection.
- Menghapus route lalu `tsc` gagal karena `.next/types` basi → `rm -rf .next tsconfig.tsbuildinfo`.
- Sandbox: `vercel.com` dan `*.vercel.app` **tidak terjangkau**; `script.google.com` dan `googleapis.com` terjangkau; `developers.google.com` diblokir. Jangan memakai `spawnSync` untuk proses yang bergantung pada event loop yang sama (deadlock). `pkill -f` bisa membunuh shell sendiri.
- Laptop pengguna terkunci admin (tidak bisa memasang Node): arahkan ke `checks/live-browser.js` atau GitHub Codespaces.

## 6. Cara bekerja yang sudah dipakai
Check merah dulu → implementasi minimum → hijau; mutation check (rusak logika kunci, pastikan test merah) untuk logika penting; satu perubahan = satu commit dengan trailer `Co-Authored-By` dan `Claude-Session`; push lalu verifikasi remote = HEAD lokal; tidak menyatakan hasil Google tanpa bukti nyata; angka usulan diberi komentar "usulan" di kode; verifikasi dari keadaan bersih (`rm -rf node_modules .next && npm ci && npm run check && npm run build`) sebelum melapor.

## 7. Terbuka / belum terukur
- Lama unggah foto sungguhan dan timeout (gateway 30 dtk, `maxDuration` 60 dtk: usulan); kuota Apps Script untuk dua petugas; model HP dan versi Chrome uji Android; hasil per poin Android (potret tegak, resolusi sangat tinggi, HEIC) tidak dirinci pengguna.
- Belum ada: folder Drive per area (`YYYY/MM/AREA/INSPECTION_ID`), tab `Audit`, peran reviewer, finalisasi (T4), draft offline (T5), lokasi/peta (T3), batas laju.
- Skrip harness Chromium (UI, kompresi, mode `live.mjs`) dan fixture foto hanya ada di scratchpad sesi lama dan **tidak tersimpan di repo**; tulis ulang bila dibutuhkan (Playwright global tersedia di sandbox).
- Sisa data uji di staging (file dan baris uji), properti lama `dev:*`/`act:*` di Script Properties, dan file `probe` di editor Apps Script boleh dihapus pengguna.

## 8. T2 — apa yang diminta rencana dan apa yang kurang
Acceptance (plan §13): form/checklist **berversi** dengan validasi, dan **bukti bahwa item kosong tidak menjadi "tidak ada temuan"**.
- **Masukan pengguna yang belum ada (jangan dikarang):** daftar area (usulan plan §6: pit/lereng, waste dump, heap leach pad, dam/pond), checklist awal per jenis area (untuk review engineer; draf dari plan §6 boleh sebagai *usulan*), nama dua inspector.
- Aturan dari plan §6: empat jawaban terpisah (**Tidak ada temuan / Ada temuan / Tidak diperiksa / Tidak berlaku**); semua jawaban awal **kosong**; "Ada temuan" → jenis temuan, deskripsi, foto, atau alasan tanpa foto + status perlu review; ukuran/satuan/metode opsional, nilai tidak diketahui **null bukan nol**; label tindak lanjut Rutin / Perlu review / Segera dilaporkan hanyalah usulan (definisi final engineer); aplikasi tidak menghitung kestabilan dan tidak menetapkan ambang geoteknik. Template berversi di `config/checklists.json` (plan §12); versi template disimpan pada inspeksi.
- **Jebakan skema Sheets:** `sheet_()` hanya menulis header saat tab dibuat. Menambah kolom ke `SHEET_COLUMNS` tidak memperbarui header tab staging yang sudah ada, dan baris lama lebih pendek. Tambahkan kolom **di akhir** (additif, plan §15), dan putuskan cara memperbarui header atau minta pengguna menghapus tab staging uji. Kontrak JSON final sebaiknya baru dibekukan setelah review (plan §12).
- Check minimum: logika validasi di Node tanpa framework (stdlib), merah dulu, plus mutation check; uji tampilan lewat inspeksi UI.

## 9. Prompt awal yang disarankan untuk sesi baru
> Baca AGENTS.md, CLAUDE.md, docs/plan.md, docs/handoff.md, dan README.md. Mulai dari branch `claude/eager-carson-bqb25q`. Kerjakan hanya T2. Masukan saya: area = …; checklist = …; inspector = …. Jangan mengarang ambang geoteknik atau isi checklist.
