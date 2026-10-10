# Serah terima sesi — 2026-10-10 (T5 dan verifikasi gateway)

## T7 — uji browser, backup/restore, dan rollout (2026-10-10, sesi ini)

**Status:** sebagian. Pengguna memilih T7 setelah rekap T6. Tidak ada merge, promosi Production, perubahan Apps Script atau Vercel, dan tidak ada penulisan ke Google.

**Dikerjakan:**
- `checks/t7-browser.mjs`: harness Chromium headless nyata (Playwright 1.56.1 global, Chromium `/opt/pw-browsers`) dengan gateway tiruan dan `next start`. Di luar `npm run check`. Hasil: **20/20 lulus**, exit 0, dua kali berturut-turut.
- `docs/runbook.md`: gerbang Production G1–G7, checklist uji Android (15 skenario), prosedur backup/restore, rollback, dan keputusan terbuka.
- `npm ci`, `npm run check` (74/74), dan `npm run build` lulus di Node v22.22.0.

**Temuan yang mengubah rencana:**
1. **Batas kuota CDP tidak memicu galat tulis** di Chromium ini. `navigator.storage.estimate()` melapor kuota 1 byte, tetapi tulis IndexedDB tetap berhasil. Jalur galat kuota diuji dengan suntikan `QuotaExceededError` pada `IDBObjectStore.put`, dan ditandai sebagai suntikan.
2. **Gateway T5 tidak bisa membaca header Inspections 26 kolom.** Dari `git show 5d65e0d:apps-script/src/storage.js`, `sheetLayout_` hanya menerima 17–25 kolom. Rollback gateway ke T5 setelah kolom `review_json` (Z) ada menolak semua baca dan tulis Inspections. Ini gagal-tertutup, tetapi layanan berhenti. Dari kode, belum diuji Google.
3. **Frontend T5 memakai aksi yang seluruhnya ada di allowlist gateway T6.** Jadi pasangan frontend T5 + gateway T6 kompatibel dari kode.
4. **Frontend T1 yang disebut handoff masih di Production tidak kompatibel dengan gateway T2 ke atas.** Rollback ke T1 bukan pilihan.
5. **Galat di harness awal adalah race harness**, bukan bug produk. Harness kembali online saat percobaan ulang offline masih berjalan, dan pengecekan dilakukan sebelum daftar termuat. Keduanya sudah diperbaiki di harness.
6. **Satu galat halaman tak tertangani** selama uji berasal dari suntikan sendiri (`QuotaExceededError` sinkron pada `put`). Ini bukan galat produk; kuota IndexedDB nyata menggagalkan transaksi secara asinkron.

**Belum (butuh pengguna atau perangkat):** Android nyata (`docs/runbook.md` bagian 3), mode pesawat OS, eviksi dan kuota OS, GPS dan kamera, Sheets/Drive/Apps Script nyata (tidak ada `GATEWAY_URL` atau secret di sesi ini), backup/restore, drill rollback di staging, pilot, dan Production.

**Keputusan terbuka:** G1–G7 di runbook bagian 1; angka kapasitas dan batas laju; pemilik dan frekuensi backup; lokasi salinan foto yang independen; branch Production dan urutan merge PR #1–#5; izin menjalankan uji restore dan drill rollback di staging.

**Branch:** `claude/zen-heisenberg-kcgjpu` (branch kerja yang ditetapkan sesi) belum ada di origin sebelum sesi ini. Branch itu dibuat dari `codex/t6-history` (`a5d35aa`) dan memuat riwayat T0–T6 plus T7. `codex/t6-history` tidak diubah. Tidak ada force push. Trailer commit tidak menyebut nama model.

**Pembaruan Android (2026-10-10):**
- **G1 dan G2 lulus menurut laporan pengguna.** Skenario 1–15 sesuai rencana di Oppo Find X8 dengan Chrome dan Android terbaru, pada preview T6. Pesan "Penyimpanan persisten belum diberikan browser" muncul.
- **Sheets staging (dibaca agent):** `Inspections` 30 → 31, `Photos` 19 → 20. Isinya satu inspeksi `submitted` revisi 2 dengan GPS Android, UTM 50S, dan satu foto `stored` yang checksum-nya sama dengan manifest. Tidak ada baris ganda.
- **Batas:** hanya satu kiriman end-to-end yang terkonfirmasi. Pengguna memilih menerima laporannya apa adanya.
- **Data:** record itu memakai nama dan GPS nyata. Statusnya belum ditetapkan, jadi jangan dihapus.
- Rincian ada di `docs/runbook.md` bagian 3.

**Keputusan G3–G5 (2026-10-10):**
- **G3:** rata-rata 3 inspeksi per hari. Batas laju belum diputuskan.
- **G4:** didelegasikan ke agent. Dipilih satu PR rilis draft `claude/zen-heisenberg-kcgjpu` → `main`, belum di-merge. Vercel Production Branch akan menjadi `main`.
- **G5:** pakai Apps Script, Spreadsheet, dan folder Drive yang ada.

Akibat G5 ada di `docs/runbook.md` bagian 1a:
- tidak ada staging terpisah;
- data uji lama tetap tampil di riwayat;
- izin foto Android terbaru `anyone`/writer (diperiksa baca saja; tidak diubah);
- rotasi secret disarankan;
- gateway tidak perlu diubah.

**Perintah pengguna 2026-10-10:**
- **Backup:** salinan Spreadsheet dibuat dan diverifikasi oleh agent (Inspections 31 / Photos 20, identik). Lokasinya di akun pribadi pengguna. Foto belum dicadangkan.
- **Izin foto:** dibiarkan `anyone`/writer atas keputusan pengguna.
- **Merge:** PR rilis #6 di-merge ke `main` dengan merge commit.

**Production aktif (2026-10-10):**
- `main` `40ff92c` dipromosikan ke Production oleh pengguna. Deployment `main` berstatus "Production Staged" sampai dipromosikan manual.
- Smoke test "Uji produksi 2026-10-10" lulus (dibaca agent di Sheets): +1 inspeksi `submitted` revisi 2, +1 foto `stored` dengan checksum sama dengan manifest, tanpa duplikat.
- PR #1–#5 ditutup sebagai superseded.
- Tag `v2026.10.10` gagal di-push dari sesi agent (push tag terputus); pengguna membuatnya lewat GitHub Releases.

**Berikutnya (sisa):**
1. ~~Pengguna mengatur Vercel Production Branch = `main` dan memeriksa env Production.~~ Selesai.
2. Rotasi `GATEWAY_HMAC_SECRET`, bila disetujui.
3. ~~Smoke test satu inspeksi berlabel.~~ Lulus.
4. Pilot 3–5 hari (G7).
5. ~~PR #1–#5 ditutup sebagai superseded.~~ Selesai. Tag rilis dibuat pengguna.

Pekerjaan berikutnya dimulai dari `main` terbaru, bukan dari branch rilis yang sudah di-merge. Drill rollback atau uji restore di staging hanya dijalankan bila pengguna memberi izin. Tanpa izin itu, T7 berhenti di sini.

## T6 dan verifikasi riwayat/review/ekspor — 10 Oktober 2026 (sesi Codespace)

**Status:** T6 selesai dan terverifikasi terhadap Google. Branch `codex/t6-history` (produk `8c4d134`, docs menyusul), PR [#5](https://github.com/fanelix/dailyinspection/pull/5) draft bertumpuk di atas PR #4. Gateway aktif **`build 2026-10-10.2`** (pembaruan dua file: `gateway`, `storage`). Foto penutupan **ditunda** atas keputusan pengguna; tidak mengubah invarian manifest T4.

**Insiden deploy sesi ini (jangan diulang):** (1) setelah pengguna menempel file, deployment menjawab halaman Error `SyntaxError: Identifier 'SCHEMA_VERSION' has already been declared (line 1, file "storage")` — penyebabnya isi `gateway` ikut tertempel/nama tertukar di file `storage`; satu-satunya `const SCHEMA_VERSION` harus di file `gateway`. (2) Mengganti isi editor **tidak** mengubah web app; user harus *Manage deployments → ✏ → New version → Deploy* dan nomor Version harus naik. (3) Pencarian editor default tidak case-sensitive — `schema_version` (kolom) bukan `SCHEMA_VERSION` (konstanta). Setelah dua kali redeploy, health dan perilaku terverifikasi.

**Bug produk yang ditemukan verifikasi nyata lalu diperbaiki (`8c4d134`):** `listInspections`/`getInspection` membaca kolom sheet mentah sehingga pemetaan staging tidak diterapkan (nama/status/versi/checksum foto kosong untuk database pengguna). Diperbaiki dengan `recordFromRow_` bersama `readRecord_`; check regresi dengan header staging ditambahkan (`checks/history.check.mjs`). Pelajaran: runtime tiruan berskema sederhana menyembunyikan bug pemetaan staging; verifikasi Google tetap wajib.

**Isi T6:** aksi `listInspections` (filter area/status/tanggal + paginasi, `skipped` untuk baris non-UUID, read-only), `getInspection` (tanpa byte/ID Drive), `reviewInspection` (`expectedVersion`, `VERSION_CONFLICT` 409, replay `reviewId` idempoten, cap riwayat 20 entri); kolom additif `Inspections!Z review_json`; halaman `/riwayat` + `/riwayat/[id]`; ekspor CSV (guard formula) dan GeoJSON `[lon,lat]` dari baris tampil; foto tetap lewat pasangan ID.

**Bukti nyata (22/22 lulus):** riwayat memuat 12 record UUID, `skipped` 17 baris lama non-UUID (dipertahankan apa adanya); record `Uji T5 verifikasi 20261010043340` tampil Terkirim revisi 2 dengan dua foto didekode; review “Reviewer verifikasi T6” (`reviewId b320e309…`) → revisi 3, temuan `cracks` ditutup; versi basi → 409; replay idempoten → versi tetap 3; detail dua foto `stored` checksum/ukuran = manifest dan tidak membocorkan byte; CSV/GeoJSON memuat koordinat `[117.000261105488, -1.9999997634890758]`; matched tetap 12 (tanpa baris/revisi ganda). Ringkasan: `/tmp/opencode/verify/t6-live-summary.json` (khusus Codespace ini).

**Sisa pemeriksaan manual pengguna (Sheets):**
- `Inspections!Z` header `review_json` (26 kolom A..Z; baris tetap 30 termasuk header).
- Baris `Uji T5 verifikasi 20261010043340`: `revision` = 3, `workflow_status` = submitted, sel `Z` berisi satu entri review: reviewer `Reviewer verifikasi T6`, catatan “Review sintetis verifikasi T6; boleh dihapus.”, `findings: [{itemId: "cracks", status: "closed", note: ""}]`, versi 3.
- `Photos` tetap 19 baris termasuk header; dua foto record itu tidak berubah.
- Data lama/kolom lama utuh; hanya header bertambah Y (T4) dan Z (T6).

**Catatan data nyata:** riwayat ikut menampilkan baris uji T1 lama (nama `#ERROR!`, `=uji teks, bukan rumus`, dll.) apa adanya karena tidak dihapus; 17 baris lain tanpa UUID dilewati dan tidak diubah. T6 tidak memutuskan pembersihan.

**Berikutnya:** pemeriksaan Sheets di atas; lalu keputusan pengguna untuk T7 (Android/lapangan, volume pilot, backup/restore, rollout) dan/atau increment foto penutupan review; PR #1–#5 tetap draft, Production tidak disentuh.

## Verifikasi T4/T5 terhadap Google sungguhan — 10 Oktober 2026 (sesi Codespace)

**Jalur yang dipakai:** sesi pengganti berjalan di GitHub Codespace (CLI) tanpa akses ke cloud browser/antrean “Uji T5 sintetis” lama dan tanpa auth Vercel. Sesuai instruksi handoff, uji sintetis **baru dibuat eksplisit** dari profil Chromium headless baru di Codespace terhadap app Next lokal (`next start` di 127.0.0.1:3100) dengan `GATEWAY_URL`/`GATEWAY_HMAC_SECRET` nyata; antrean lama di browser lain tidak tersentuh. Harness ada di `/tmp/opencode/verify/verify-t5.mjs` (di luar repo). Pengguna memilih memeriksa Sheets sendiri.

**Prasyarat terverifikasi:** checkout `2ad2153`; `npm ci`, `npm run check` (**65/65 lulus**), `npm run build` lulus dengan **Node v22.23.3** (repo butuh ≥22.18 untuk type stripping; Node 22.16 sandbox membuat 9 checks gagal `ERR_UNKNOWN_FILE_EXTENSION` — bukan bug kode). Tahap A `checks/live.mjs`: health gateway **`build 2026-10-10.1`**, POST tanpa tanda tangan ditolak `UNAUTHORIZED`. Sidik jari app→gateway: `POST /api/inspections {}` → `400 VALIDATION_ERROR` dari storage, membuktikan HMAC cocok dan storage baru berjalan.

**Jebakan lokal (bukan bug produk):** nilai `GATEWAY_HMAC_SECRET` yang mengandung `#` terpotong parser dotenv bila ditulis tanpa kutip di `.env.local`, sehingga app menandatangani dengan nilai salah → `UNAUTHORIZED`/`SERVER_ERROR` 502. Solusi: kutip nilainya (`GATEWAY_HMAC_SECRET='…'`) atau set lewat environment proses. Nilai secret tidak dicetak ke git/README; harap rotasi bila log sesi dianggap bocor (nilai sempat tampil di log tool sesi ini karena escape shell).

**Uji sintetis eksplisit** nama petugas `Uji T5 verifikasi 20261010043340`, area Pit, sub-area “Bench 1 uji gate T5”, UTM ID74 zona 50S EPSG:23890 E=500000 N=9778935, satu temuan retakan uji bertaut dua foto kuning/biru 800×600 dengan keterangan “Foto kuning uji T5”/“Foto biru uji T5” (diisi dengan spasi tepi untuk membuktikan trim), lima item lain `not_inspected`. Jalur persis T5 UI: isi → **Simpan untuk dikirim nanti** → reload → **Kirim yang tertunda**.

- Pemulihan lokal: byte foto, keterangan, UTM terkonfirmasi, tautan temuan, dan antrean pulih setelah reload; payload antrean byte-identik; isian terkunci; dua foto didekode ulang; kiriman selesai 22,5 dtk.
- `prepareCompleteInspection` 200: `uploading` revisi 1, dua reservasi, checksum checklist/lokasi/manifest cocok dengan yang diperiksa UI, `reviewRequired=false`.
- Dua `uploadPhoto` `stored`; ukuran byte 130.610 dan 134.591 serta SHA-256 sama dengan manifest pengiriman; `finalizeInspection` → **`submitted` revisi 2**, checksum manifest/checklist/lokasi sama, dua foto `stored`, photo ID tidak berubah.
- Baca kembali kedua foto lewat app: byte + SHA-256 identik dengan yang diunggah, `Cache-Control private`.
- Retry tanpa duplikat: prepare ulang → `submitted` revisi 2 tanpa revisi baru; upload ulang → `stored` (`replayed=true`); finalize ulang → acknowledgment sama; tidak ada respons error pada jalur kirim.
- Manifest `Inspections!Y` berisi dua entri `{photoId, sha256, size, caption}` dengan caption ter-trim; manifest SHA-256 `37f151c64b2503c4…`. Ringkasan lengkap (ID, hash, payload) di `/tmp/opencode/verify/summary.json` (khusus Codespace ini; jangan diterbitkan).
- 47 pemeriksaan harness LULUS; satu label harness sempat GAGAL karena asumsi skrip keliru (`prepare` tidak mengembalikan `size` foto `reserved` — ukuran/hash divalidasi gateway pada manifest, `storage.js:209`), sudah diperbaiki; tidak ada temuan produk.

**Sisa pemeriksaan manual (pengguna, di Sheets):** baris baru `Inspections` kolom **Y `photo_manifest_json`**, dua baris `Photos` kolom **O `caption`** (nilai “Foto kuning uji T5” dan “Foto biru uji T5”), data lama utuh, dan hitungan baris. Harapan: baseline 29/17 → **30/19 baris termasuk header** (kolom 25/15) bila tidak ada write lain; `note` berawalan `=` tetap teks. Bila antrean lama “Uji T5 sintetis” di browser lain ikut dikirim, jumlah akan bertambah terpisah (nama berbeda).

**Batas:** ini verifikasi gateway/storage T4 dan jalur T5 di Chromium headless desktop Codespace, bukan Android; mode pesawat, eviction/quota nyata, Web Locks dua tab, dan antrean lama di perangkat lain tidak diuji sesi ini. T6/T7, izin foto/login, dan Production tidak disentuh.

## Status sesi sebelumnya (sebelum verifikasi di atas)

**Mulai dari `codex/t5-drafts`, bukan branch awal T2.** Repo: https://github.com/fanelix/dailyinspection. Baca `AGENTS.md`, `CLAUDE.md`, `docs/plan.md`, dokumen ini, dan `README.md`. Bagian ini mengungguli status rollout historis di bawah. Source produk terbaru `495b33f`; commit dokumentasi sebelum rekap ini `f336465`.

**Pesan terakhir pengguna, 10 Oktober 2026 pukul 10:50 WIB:** “storage gs sudah saya ganti, dan sudah saya deploy yang terbaru.” Pengguna meminta rekap untuk pindah sesi. Pembaruan tersebut adalah laporan pengguna; isi editor, nomor versi deployment baru, dan pengiriman sesudahnya **belum diverifikasi** oleh agent. Jangan menyatakan finalisasi Google berhasil sampai acknowledgment, baris Sheets, dan kedua foto benar-benar diperiksa.

### Diagnosis terakhir dan perbaikan yang sudah dilaporkan

- Proyek gateway yang benar akhirnya ditemukan: **Daily Geotechnical Inspection**, memakai akun perusahaan. Tautan editor telah diberikan pengguna dalam percakapan. Proyek yang sebelumnya terlihat pada akun lain bukan dasar diagnosis terbaru.
- Sebelum pembaruan terakhir, deployment aktif **Version 7**, dibuat 10 Oktober pukul 09:16 WIB. `gateway.gs` sudah build **`2026-10-10.1`**, schema 2, dan memanggil `prepareCompleteInspection`; `storage.gs` masih persis source T3 `efe3c18`, tanpa fungsi itu maupun kolom manifest/keterangan. Salinan kode editor dibandingkan dengan source Git, bukan sekadar melihat nama file.
- Ketidakcocokan tersebut menjelaskan `RETRYABLE_ERROR` sebelum write. Status `doPost` **Completed** bukan keberhasilan aplikasi: exception ditangkap gateway dan dikembalikan sebagai payload error. Execution log pada baris doPost tidak menampilkan rincian yang diminta; jangan meminta pengguna mencari failed doPost lagi sebagai satu-satunya jalan.
- Agent menyiapkan source `apps-script/src/storage.js` T4 yang sudah diuji dan mencadangkan source lama. Upaya penggantian melalui browser ditolak peninjauan persetujuan otomatis sebelum perubahan diterapkan. Pengguna kemudian mengganti `storage.gs` dan deploy sendiri, sesuai pesan terakhir di atas.
- Source `storage.js` T4 yang disiapkan identik dengan repo: SHA-256 **`9dd406ad7695b69e59c25c4c63df2e6903d3760a94535c1ac4cf136c28269690`**. T5 tidak memerlukan pembaruan Apps Script tambahan. Empat file T3 (`checklist`, `location`, `locations`, `projection`) tetap baseline; jangan mengganti Script Properties, manifest, Spreadsheet ID, atau URL deployment tanpa kebutuhan yang terbukti.

### Pekerjaan dan keputusan yang sudah tersimpan

| Tahap | Hasil |
| --- | --- |
| T0/T1 | Baseline integrasi Next.js/Vercel → Apps Script → Sheets/Drive sudah tersedia. Uji upload, baca foto, retry tanpa duplikat dan penolakan pesan tanpa tanda tangan lulus; uji kamera/galeri Android dasar dilaporkan pengguna. |
| T2 | Tujuh area, enam item checklist usulan per area, nama inspector teks manual, sub-area teks manual untuk semua area, temuan dan validasi, template berversi. Jawaban awal kosong, tidak dianggap “Tidak ada temuan”. |
| Kompatibilitas staging | Memakai tabel/kolom yang sudah ada di **Geotech Inspection Staging DB**; alias header dan kolom tambahan bersifat additif. Tidak mengganti tab atau menghapus baris lama. |
| T3 | Lokasi objek terpisah dari GPS petugas; pin peta, koordinat manual, lokasi master dan konfirmasi snapshot. GeoJSON WGS84 `[longitude, latitude]`. Master yang masih kosong tidak diisi contoh. |
| Revisi UTM | Pemilihan zona/belahan dan datum WGS84, DGN95, ID74; angka asli serta CRS/operasi disimpan. DGN95/ID74 dalam cakupan Indonesia; SRGI2013/epoch dan grid/RL belum didukung. Uji nyata satu inspeksi ID74 50S tanpa foto beserta retry berhasil di Google. |
| T4 | Hingga lima foto terkompresi, keterangan, relasi foto ke temuan, prepare → upload → finalize, manifest immutable, pemeriksaan ukuran/hash/status, retry tanpa duplikat. Implementasi dan checks selesai; finalisasi dua foto Google masih perlu uji setelah deploy terakhir. |
| T5 | Autosave IndexedDB, pemulihan form/blob/keterangan/UTM/tautan temuan, antrean immutable, pengiriman saat app aktif, Web Locks dan konflik revisi dua tab, persiapan shell/aset/template/master tujuh area untuk pencatatan offline. |
| T6/T7 | Belum dikerjakan: riwayat/review/ekspor lengkap, acceptance Android/lapangan, backup/restore dan rollout produksi. |

Area tetap **Pit, Waste Dump, LGSP, Topsoil Stockpile, Sedimen Sump, DAM, Heap Leach**. Checklist berstatus **usulan**, template `2026-10-09.draft1`, schema 2. Empat jawaban: Tidak ada temuan / Ada temuan / Tidak diperiksa / Tidak berlaku. Temuan wajib jenis/deskripsi serta foto terkait atau alasan tanpa foto; tanpa bukti foto ditandai perlu review. Tidak mengarang ambang geoteknik atau menyamakan form dengan penetapan kestabilan.

Keputusan akses terbaru: **tanpa login/aktivasi perangkat**, nama petugas manual. Pengguna meminta mengabaikan pekerjaan izin foto. Jangan memulihkan login, mengganti izin Drive/foto, atau memperluas lingkup tersebut. File Drive tidak dibuat publik oleh kode; pasangan ID inspeksi+foto adalah kunci akses dan tidak boleh dicatat/dipublikasikan.

### Branch, PR, deployment, dan bukti pengujian

| Urutan | Branch | PR draft | Source penting |
| --- | --- | --- | --- |
| Baseline | `claude/eager-carson-bqb25q` | — | T0/T1; titik awal T2 `50318a7` |
| T2 | `codex/t2-checklists` | [#1](https://github.com/fanelix/dailyinspection/pull/1) | `9979a49` setelah form, sub-area dan kompatibilitas staging |
| T3 + UTM | `codex/t3-locations` | [#2](https://github.com/fanelix/dailyinspection/pull/2) | produk UTM `3616b33`, dokumentasi `efe3c18` |
| T4 | `codex/t4-finalization` | [#3](https://github.com/fanelix/dailyinspection/pull/3) | produk `ab95974`, dokumentasi `ae34c68` |
| T5 aktif | `codex/t5-drafts` | [#4](https://github.com/fanelix/dailyinspection/pull/4) | produk `495b33f`, dokumentasi sebelum rekap `f336465` |

PR bertumpuk; PR #4 berbasis `codex/t4-finalization`. Belum ada merge atau promosi Production; jangan menyamakan preview T5 dengan Production yang masih baseline T1 pada pemeriksaan terakhir. Preview T5 terakhir terverifikasi Ready: https://dailyinspection-git-codex-t5-drafts-fanelixs-projects.vercel.app/.

- Pemeriksaan terakhir source produk: **65/65 checks**, typecheck Next/Apps Script, sinkronisasi generator dan build produksi lulus. Review independen selesai dan temuan penting diperbaiki. `fake-indexeddb@6.2.5` hanya devDependency; proyeksi memakai Proj4js `2.22.0`.
- Cloud browser T5 membuktikan reload dua JPEG sintetis 800×600 beserta keterangan, UTM parsial tetap belum terkonfirmasi, UTM terkonfirmasi pulih, tautan ke temuan pulih, konflik dua tab tidak menimpa, “Muat versi tersimpan” berhasil, dan indikator **Siap untuk pencatatan offline** muncul setelah persiapan minimum.
- Pengiriman antrean sebelum perbaikan gateway gagal; reload tetap memulihkan kedua foto, ID, payload dan antrean. Tidak ada status Terkirim/pembersihan blob palsu. Baseline staging terakhir terukur: **Inspections 29 baris/24 kolom**, **Photos 17 baris/14 kolom**, termasuk header; sebelum/sesudah kiriman gagal identik. Ini baseline sebelum deployment terakhir pengguna, bukan pembacaan sesudahnya.
- Belum terbukti: finalisasi dua foto pada Google setelah pembaruan, kamera/GPS dan mode pesawat Android untuk alur T3–T5, eviction/quota nyata, upgrade cache lintas deployment nyata, serta byte unduhan GeoJSON aktual. Checks tiruan tidak menggantikan uji itu.
- Draft hanya tersedia pada **browser dan origin yang sama**; pindah URL preview/Production atau perangkat tidak memindahkan antrean. Basemap OSM memerlukan jaringan. Upload tidak dijanjikan berjalan ketika Android menutup app. Jangan menghapus data situs atau mengganti origin saat hendak menguji antrean yang sudah ada.

### Langkah pertama sesi selanjutnya

1. Checkout branch `codex/t5-drafts` terbaru, baca dokumen wajib di atas. **Fokus verifikasi T4/T5 setelah deployment, belum mulai T6/T7.**
2. Pastikan proyek gateway yang benar memuat `prepareCompleteInspection` dan `finalizeInspection` di storage, gateway build `2026-10-10.1`, serta deployment aktif memakai versi yang baru. Jangan mengganti gateway URL/environment hanya karena Script sudah deploy.
3. Pada **origin preview T5 yang sama**, pulihkan antrean **Uji T5 sintetis** yang sudah ada bila sesi browser masih tersedia; dua foto kuning/biru bertaut ke satu temuan, lokasi sintetis ID74 50S terkonfirmasi. Tekan **Kirim yang tertunda**. Gunakan ID/payload yang sama; jangan membuat duplikat untuk mengatasi error. Bila sesi lama tidak tersedia, jelaskan keterbatasan dan buat uji sintetis baru secara eksplisit.
4. Periksa satu record `submitted` revisi 2, tepat dua foto `stored`, SHA-256/ukuran/manifest/keterangan dan hubungan temuan cocok. Header tambahan yang diharapkan: **Inspections!Y `photo_manifest_json`**, **Photos!O `caption`**. Kolom/baris lama tetap utuh. Baseline 29/17 dapat menjadi 30/19 bila hanya uji dua foto tersebut menambah data; jangan memaksakan hitungan jika ada write pengguna.
5. Baca kedua foto melalui aplikasi dan pastikan berhasil didekode; retry identik tidak menambah file/baris/revisi. Hanya setelah acknowledgment finalisasi valid, metadata acknowledgment tersimpan dan byte antrean boleh dibersihkan dalam transaksi lokal.
6. Catat hasil nyata, commit frontend dan build/versi gateway di README/handoff. Jika masih error, telusuri payload error dan kode deployment aktif. Jangan menyimpulkan berhasil dari HTTP 200, status Completed, atau checks lokal.
7. Setelah verifikasi tersebut, laporkan batas uji Android/lapangan dan tunggu arahan tahap berikutnya. Tidak ada izin untuk merge/promote Production atau mengerjakan T6/T7 dalam rekap ini.

Untuk pemeriksaan kode jika ada perubahan berikutnya: `npm ci`, `npm run check`, `npm run build`; generator checklist/lokasi mengikuti CLAUDE.md. Rekap ini hanya mengubah dokumentasi, sehingga tidak mengulang checks produk yang sudah lulus pada source yang sama.

---

Bagian berikut adalah riwayat implementasi dan pengujian; status gateway sebelum diagnosis/pembaruan terakhir di atas tidak lagi menjadi instruksi terbaru.

## T5 — draft, pemulihan dan pencatatan offline (2026-10-10)

Pengguna sudah memperbarui Apps Script dan meminta melanjutkan. T5 dikerjakan di `codex/t5-drafts`, bertumpuk di atas T4 `ae34c68`. T6/T7 belum dikerjakan. Rencana: [`docs/superpowers/plans/2026-10-10-t5-drafts.md`](docs/superpowers/plans/2026-10-10-t5-drafts.md).

- Form, JPEG terkompresi, keterangan dan relasi temuan disimpan otomatis di IndexedDB; status berhasil hanya sesudah transaksi selesai. Koordinat UTM mentah, datum/zona/belahan, titik/GPS dan lokasi terkonfirmasi pulih terpisah; input belum lengkap tidak menjadi lokasi terkonfirmasi.
- **Simpan draft sekarang**, **Simpan untuk dikirim nanti**, daftar draft lokal dan **Kirim yang tertunda** tersedia. Antrean menyimpan UUID/hash/payload immutable sebelum request pertama. Pengiriman hanya foreground, satu pengirim lintas tab dengan Web Locks; browser tanpa Web Locks menahan pengiriman dan mempertahankan draft.
- Respons hilang mempertahankan byte dan ID. Byte dibersihkan bersama acknowledgment finalisasi yang sudah diperiksa, dalam satu transaksi lokal. Metadata kiriman tetap tersedia untuk baca foto server. Konflik revisi dua tab tidak menimpa data; tawarkan muat versi tersimpan atau salinan baru. Salinan baru meremap UUID foto/tautan dan ditolak bila sumber sudah masuk antrean di tab lain.
- **Siapkan pencatatan offline** memuat daftar lokasi tervalidasi ketujuh area, meminta storage persistent bila tersedia, dan memeriksa shell/aset/template versi yang sama. Daftar kosong yang benar dari server boleh disimpan sebagai master kosong. Indikator Siap hanya sesudah seluruh cache minimum diperiksa. Basemap OSM tetap memerlukan jaringan; koordinat manual/lokasi tersimpan tersedia.
- Worker hanya cache shell dan aset statis. API, foto privat, respons inspeksi dan tile lintas origin dilewati. Build menghasilkan worker/manifest dengan hash aset; upgrade menunggu tab lama ditutup, tidak menghapus IndexedDB. Template yang tidak didukung menahan pemulihan tanpa menghapus data lama.
- Draft hanya tersedia pada browser/origin yang sama; pindah preview/Production atau perangkat tidak memindahkan draft. Storage OS/browser dapat terhapus/penuh; UI menampilkan kegagalan dan menahan pengiriman bila snapshot belum durable. Tidak ada janji backup permanen atau upload saat Android menutup browser.

**Apps Script:** T5 tidak mengubah file gateway, Script Properties, manifest atau izin Drive. Pembaruan dua file T4 tetap menjadi baseline.

**Bukti lokal:** 65/65 checks lulus (47 sebelumnya + 13 draft/IDB + 5 worker), typecheck dan build produksi lulus. `fake-indexeddb@6.2.5` hanya devDependency untuk boundary test Node; tidak ada dependency produk baru. Review independen selesai; penolakan lokasi master pada antrean memulihkan record yang tepat, kesiapan shell membandingkan identitas bundle yang berjalan, dan pemulihan eksplisit selalu membuka ulang form.

**Bukti preview T5, source `495b33f`:** PR [#4](https://github.com/fanelix/dailyinspection/pull/4) draft di atas T4; Vercel Ready. Preview terverifikasi https://dailyinspection-git-codex-t5-drafts-fanelixs-projects.vercel.app/. Cloud browser memulihkan dua JPEG sintetis 800×600, keterangannya, nama/sub-area/catatan serta input UTM ID74/50S yang masih kosong Northing-nya setelah reload; input itu tetap belum terkonfirmasi. Kedua gambar berhasil didekode. Dua tab dengan revisi sama: tab A tersimpan, tab B ditolak tanpa menimpa atau menghilangkan isiannya, lalu **Muat versi tersimpan** memulihkan catatan tab A beserta kedua foto. Persiapan shell/aset/template dan master tujuh area menampilkan **Siap untuk pencatatan offline**; browser belum memberi penyimpanan persisten.

**Antrean dan kegagalan gateway:** lokasi sintetis dikonfirmasi, kedua foto ditautkan ke satu temuan, lalu **Simpan untuk dikirim nanti** membuat antrean lokal. Setelah reload, antrean, kedua foto/keterangan/tautan, UTM terkonfirmasi serta isian terkunci tetap pulih. **Kirim yang tertunda** mendapat kesalahan sementara yang sama dari Apps Script; reload lagi tetap memulihkan antrean beserta byte foto. Rentang staging sebelum/sesudah identik (Inspections 29, Photos 17 baris termasuk header; 24/14 kolom). Tidak ada status Terkirim atau pembersihan foto lokal palsu.

**Batas verifikasi:** quota/transaction abort, acknowledgment hilang, pengirim bersamaan, master berubah, aset gagal dan pergantian identitas bundle diuji lewat checks boundary, bukan perangkat Android nyata. Mode pesawat, eviction OS, upgrade cache nyata lintas deployment, kamera/GPS Android serta finalisasi dua foto pada Google belum terbukti. Ini bukti implementasi T5, belum acceptance lapangan; T6/T7 dan Production belum dilanjutkan.

**Verifikasi T4 Google asli, 2026-10-10:** Kirim ulang attempt dua JPEG sintetis pada preview T4 kini mencapai gateway, tetapi mendapat `RETRYABLE_ERROR` (galat Apps Script generik). Rentang staging `Inspections!A1:Y80` dan `Photos!A1:O80` sebelum/sesudah identik: 29/17 baris termasuk header, header belum bertambah Y/O. Tidak ada finalisasi atau byte T4 yang dapat dinyatakan berhasil. Proyek Apps Script yang terlihat pada akun cloud browser masih schema 1 dan dua file lama; tidak terbukti proyek itu deployment gateway aktif. URL gateway di Vercel bertipe Secret/write-only, tidak diubah atau dirotasi. Untuk diagnosis perlu pesan Execution log **dari deployment gateway aktif**; kode tidak ditebak atau diganti pada proyek yang tidak cocok. Dua foto/attempt T4 tetap di halaman.


## T4 — foto dan finalisasi (2026-10-10)

Pengguna menyelesaikan pembaruan enam file T3 lalu meminta tahap berikutnya. Branch `codex/t4-finalization` bertumpuk di atas T3 `efe3c18`; hanya T4 dikerjakan. T5–T7 menunggu permintaan terpisah.

- Hingga **5 foto** (batas usulan §8) dapat dipilih sekaligus atau ditambah bertahap. Kompresi JPEG yang sudah ada dipakai ulang, satu decode setiap waktu, maksimal 2 MB per foto. Keterangan opsional maksimal 500 karakter. Hapus sebelum kirim menghapus tautan foto itu saja dari temuan; temuan tanpa foto tetap wajib beralasan dan ditandai Perlu review.
- Tiap temuan memilih foto secara eksplisit, termasuk beberapa foto. Foto umum tidak otomatis menjadi bukti seluruh temuan. Server menyimpan manifest immutable berisi photo ID, SHA-256, ukuran, dan keterangan. Manifest ikut acknowledgment dan konflik retry.
- Pengiriman: prepare → upload setiap foto → finalize. UI memeriksa ID/status/ukuran/checksum serta checksum checklist, lokasi, dan manifest. Isian dikunci sebelum request pertama, termasuk saat hasil belum diketahui. Kirim ulang memakai attempt dan ID yang sama; Mulai inspeksi baru mengosongkan form dengan konfirmasi bila kiriman belum selesai. Isian/blob masih di memori halaman; pemulihan setelah reload tetap T5.
- `finalizeInspection` hanya menerima record T4 dengan lokasi terkonfirmasi, versi yang diharapkan, hash yang sama, dan tepat seluruh reservasi manifest dalam status `stored`. Checklist dan relasi temuan diperiksa ulang sebelum transisi `uploading` revisi 1 → `submitted` revisi 2. Respons finalisasi hilang dapat diulang tanpa revisi/file/baris kedua. Finalisasi bukan persetujuan engineer; `submission_verification` tetap `unverified`.
- Tidak ada dependency baru, perubahan schema/template checklist, izin Drive, login, atau rollout Production.

### Pembaruan Apps Script T4

Dari gateway T3 build `2026-10-09.6` yang sudah diperbarui, **hanya dua file berubah**:

| File repo | File editor | Tujuan |
| --- | --- | --- |
| `apps-script/src/gateway.js` | `gateway` | Build `2026-10-10.1`, allowlist prepare T4 dan finalisasi |
| `apps-script/src/storage.js` | `storage` | Manifest/keterangan immutable, verifikasi upload dan finalisasi |

Empat file T3 lain (`checklist`, `location`, `locations`, `projection`) tetap harus ada dengan versi T3 terakhir. Script Properties, manifest, Spreadsheet ID dan deployment URL tetap. Salin dua file di atas dari branch T4, lalu **Deploy → Manage deployments → Edit → New version → Deploy** pada deployment yang sama. Health build yang diharapkan **`2026-10-10.1`**. Update editor saja tidak mengubah web app.

Gateway menambahkan header di kanan secara otomatis: `Inspections!Y` **`photo_manifest_json`** (24 → 25 kolom) dan `Photos!O` **`caption`** (14 → 15). Header/baris lama tidak diganti. Skema sederhana ikut didukung (15/10 kolom). Frontend memakai action baru `prepareCompleteInspection`, sehingga gateway T3 lama menolak sebelum menulis data T4; jalur retry T1/T2/T3 tetap tersedia.

Setelah deployment gateway, uji preview T4: dua foto, masing-masing keterangan, hubungan ke temuan, lokasi sintetis terkonfirmasi → Kirim; periksa satu inspeksi `submitted` revisi 2 dan dua foto `stored`, manifest/keterangan cocok, serta baca kedua foto melalui tombol Baca foto. Ulangi kiriman tidak membuat duplikat. Pengujian Android/kamera nyata dan putus jaringan lapangan masih diperlukan. Jangan pakai koordinat sintetis untuk observasi operasional.

**Bukti lokal:** 47/47 check lulus, termasuk kegagalan foto kedua setelah Drive tersimpan tetapi Sheets gagal, recovery reservasi terputus, retry UUID tetap tanpa file ganda, ukuran/hash/versi yang salah ditolak, finalisasi tanpa foto dengan alasan valid ditandai review, gateway T3 lama menolak sebelum write, pemetaan kolom asli/baris lama tetap, dan route Next finalisasi dengan respons hilang. Review independen selesai setelah perbaikan penolakan master lokasi berubah: form dibuka kembali tanpa kehilangan foto/checklist bila server memastikan belum ada write; galat parsial/unknown tetap memakai retry immutable. Build produksi dan diff check lulus. Runtime tiruan tidak membuktikan T4 terhadap Google asli; rollout T4 masih menunggu dua file di atas.

**Bukti preview T4, source `ab95974`:** PR [#3](https://github.com/fanelix/dailyinspection/pull/3) draft bertumpuk di atas T3; deployment Vercel Ready. Preview terverifikasi https://dailyinspection-git-codex-t4-finalization-fanelixs-projects.vercel.app/. Cloud browser memilih dua JPEG sintetis sekaligus melalui file chooser asli, mengisi keterangan, menautkan keduanya ke satu temuan, menghapus foto pertama dan memastikan foto/keterangan/link kedua tetap, kemudian menambah satu foto lagi tanpa menghapus isian. UTM sintetis WGS84 50S dikonfirmasi. Kirim ditolak gateway T3 sebelum write: rentang Sheets Inspections A1:Y80 dan Photos A1:O80 tetap identik. Pesan galat jelas, dua pratinjau dan isian tetap tersedia/dikunci, tombol Kirim kembali aktif. Screenshot UI diperiksa. Belum ada finalisasi T4 pada Google asli; deploy dua file gateway sebelum uji tersebut. UI pemulihan master yang benar-benar diubah/concurrency/Android masih belum diuji langsung.

**Bukti T3 Google asli, 2026-10-10:** preview T3 berhasil mengirim satu inspeksi sintetis tanpa foto dengan UTM ID74 zona 50S (EPSG:23890), E=500000, N=9778935 dan operasi EPSG:1833. Snapshot UTM asli/WGS84 tersimpan pada `location_json` X, acknowledgment/checksum berhasil. Inspections berubah 28 → 29 baris termasuk header; kirim ulang identik tidak menambah/mengubah baris, Photos tetap 17 baris. Semua baris lama tetap utuh. GPS observer null sesuai input manual; master masih kosong dan tidak diisi contoh. GPS/perizinan Android dan byte unduhan GeoJSON aktual belum diverifikasi.


Dokumen ini untuk sesi baru. Baca bersama `AGENTS.md`, `CLAUDE.md`, `docs/plan.md` (v1.1, salinan apa adanya, tidak diubah) dan `README.md` (runbook staging, keputusan akses, daftar yang belum terbukti). Tidak ada rahasia, URL gateway, atau domain Vercel di sini; tanyakan ke pengguna bila perlu.

## Revisi UTM — 10 Oktober WIB

Pengguna meminta pemilihan zona dan datum UTM agar fleksibel. Revisi tetap T3 pada `codex/t3-locations`; dasar `3cad0b5`. Form UTM memakai zona/belahan kosong sampai dipilih, datum WGS84 default; DGN95 dan ID74 juga didukung dalam cakupan CRS Indonesia. Proj4js 2.22.0 dipin; PROJ 9.8.1/EPSG v12.029 memverifikasi definisi/kontrol. EPSG:15912 DGN95≈WGS84 akurasi operasi 1 m; EPSG:1833 ID74→WGS84 akurasi operasi 3 m. Tidak otomatis mendukung datum dinamis SRGI2013/epoch atau grid/RL.

Snapshot `object.utm` opsional mempertahankan input asli dan CRS/operasi; koordinat utama/GeoJSON tetap WGS84 `[lon,lat]`. Gateway memverifikasi ulang; JSON/retry T3 sebelumnya tetap sama bila tanpa UTM. Action `prepareUtmInspection` menolak gateway lama sebelum write. Zona/datum/belahan membatalkan konfirmasi; manual UTM perlu preview ulang, GPS/pin tetap titik fisik yang sama. Perubahan tampilan saja mempertahankan sumber UTM.

Runbook terbaru README: **enam file**, termasuk file vendor generated **projection**, deploy New version build **2026-10-09.6**; Spreadsheet/properties/manifest tetap. Koneksi tersedia belum menyediakan editor/deploy Apps Script. Lima check merah→hijau; **37/37** check dan build produksi lulus. Source produk remote `3616b33`, PR #2 diperbarui, Vercel success/preview terbuka. UI desktop menguji E/N kosong, tiga datum (WGS84 32N, DGN95/ID74 50S), snapshot asli dan GeoJSON [lon,lat], pergantian tampilan mempertahankan provenance, koreksi datum manual perlu preview ulang, serta pin DGN95→ID74 tetap titik fisik yang sama/akurasi null. Screenshot diperiksa. Tidak menekan Kirim, tidak menulis record UTM Google; uji Google/Android dan byte unduhan aktual belum diklaim. Tidak ada T4–T7, perubahan izin, merge/promosi Production.

## Pembaruan T3 — mengungguli instruksi scope historis T2

Pengguna: **“Abaikan izin fotonya, kerjakan selanjutnya”**. Lanjut T3 saja; izin foto tidak diubah, T4–T7 belum diminta. Branch `codex/t3-locations` dibuat dalam worktree terpisah dari T2 `9979a49`; branch T2/Production tidak diubah. Rencana: `docs/superpowers/plans/2026-10-09-t3-locations.md`.

- Lokasi objek wajib dikonfirmasi pada UI; GPS petugas terpisah, GPS hanya saat diminta, fallback manual/pin/lokasi tersimpan. Pin/koordinat manual tidak memiliki akurasi GPS. WGS84 eksplisit, tanpa CRS transform/RL/batas site karangan. Leaflet stable 1.9.4 dan OSM beratribusi; no offline tiles.
- `lib/location.ts` dibagi browser/gateway lewat generator `scripts/sync-location.mjs` → `apps-script/src/location.js`. Lokasi version 1 tidak mengubah checklist schema 2/template. Checksum lokasi wajib cocok sebelum sukses.
- `Inspections.location_json` di **X** skema asli (23→24), ditambahkan di kanan; header/record lama dan retry T2 dipertahankan. Action baru `prepareLocatedInspection` menolak pada gateway lama sebelum menulis; action lama tetap valid untuk T2.
- Header asli Locations 15 kolom diverifikasi; Areas/ObservationObjects/PhotoPoints/Locations masih header-only. `locations.js` membaca saja, join entity types `area`/`observation_object`/`photo_point`; nama area cocok tujuh label config. Kontrak pengisian admin ada README. Tidak membuat data master/koordinat contoh. Master diperiksa saat save pertama, snapshot historis dipertahankan saat retry.
- GeoJSON titik form memakai [longitude, latitude]; ekspor riwayat tetap T6. GPS asli/izin Android dan persistensi lokasi Google belum terbukti oleh runtime palsu.
- Baseline T2 22/22, check T3 31/31 dan build produksi lulus. Review menemukan tombol refresh master yang sudah diperbaiki dan diperiksa ulang; tidak ada temuan material tersisa. Source produk `aa8b0b9`, PR #2 draft bertumpuk di atas T2. Preview Vercel Ready. UI desktop menguji koordinat kosong, konfirmasi/edit, klik pin manual (akurasi null), refresh menjaga checklist, payload GeoJSON [lon,lat]. Unduhan browser timeout; byte file unduhan aktual belum diverifikasi.
- Kiriman T3 ditolak gateway lama sebelum write; rentang Sheets A1:X80/A1:N80 sebelum/sesudah identik, tetap 28/17 baris. Lokasi belum tersimpan Google dan API master lama belum mendukung. **Blocker konkret:** perlu salin **lima** file `gateway`, `storage`, `checklist`, `location`, `locations`, lalu deploy **New version**, build `2026-10-09.5`; properties/manifest/Spreadsheet ID tetap. Koneksi Drive/Sheets yang tersedia tidak mempunyai tool edit/deploy Apps Script. Setelah pembaruan, uji acknowledgment/checksum X, retry, master nyata dan GPS/perizinan Android. Jangan mulai T4 atau menyatakan T3 accepted sebelum bukti ini.

## Pembaruan T2 — catatan historis

Bagian ini mengungguli catatan historis T1 di bawah. Permintaan pengguna: **hanya T2**; area **Pit, Waste Dump, LGSP, Topsoil Stockpile, Sedimen Sump, DAM, Heap Leach**; checklist diminta sebagai **usulan**; nama petugas **diketik manual**, tidak perlu daftar dua nama. Revisi pengguna: setiap area mempunyai **sub-area/detail lokasi yang diisi manual**; kolom dibuat opsional. Keputusan berikutnya: **gunakan Geotech Inspection Staging DB yang sudah ada**, sesuaikan script, bukan mengganti database.

- Branch kerja **`codex/t2-checklists`**, mulai dari `claude/eager-carson-bqb25q` pada `50318a7`. Branch staging asal tidak diubah, karena Vercel staging melacaknya. Preview T2 sudah Ready dan diuji terhadap Google sungguhan; PR #1 masih draft. Tidak ada merge atau promosi Production.
- `config/checklists.json`: template `2026-10-09.draft1` (42 item, 6 per area; status usulan). `lib/inspection.ts`: tipe, jawaban awal null, validator, snapshot. `scripts/sync-checklist.mjs` menghasilkan `apps-script/src/checklist.js` agar browser/gateway memakai aturan dan katalog identik tanpa dependency baru. Jalankan `npm run sync:checklist` bila sumber berubah; `npm run check` memeriksa tidak ada drift.
- `app/page.tsx` dan `components/ChecklistFields.tsx`: nama manual, area wajib, jawaban kosong, empat pilihan terpisah, jenis/deskripsi temuan, tautan eksplisit ke foto tunggal T1 atau alasan tanpa foto, ukuran/satuan/metode opsional. Tanpa ukuran = null. Temuan tanpa foto → `reviewRequired=true`; tidak ada penilaian geoteknik otomatis.
- `storage.js`: validasi sebelum menulis; menambah lima kolom di akhir header T1 **yang tepat** (`schema_version`, `template_version`, `area_id`, `checklist_json`, `sub_area`). Header T2 awal (12 kolom) juga diperluas secara additif. Sub-area opsional, trim/maksimal 200 karakter, ikut snapshot/checksum/retry; nilai kosong tidak ditambahkan ke snapshot agar catatan T2 awal tetap kompatibel. Header diubah/tertukar ditolak; baris T1 tidak ditulis ulang. Snapshot/checklist kanonis dipakai untuk konflik retry dan checksum acknowledgment. Semua record tetap `uploading`; tidak mengimplementasikan finalisasi T4.
- Header database pengguna diverifikasi langsung melalui koneksi Sheets: `Inspections` mempunyai 17 kolom skema lama, `Photos` 10. `sheetLayout_` mengenali header ini selain T1/T2. Nama→`reporter_name`, waktu diterima→`created_at`, status→`workflow_status`, version→`revision`, SHA foto→`checksum`. Enam kolom ditambahkan di akhir Inspections (R:W: `device_id`, `observed_at`, `note`, `schema_version`, `checklist_json`, `sub_area`); empat di akhir Photos (K:N: `size`, `mime`, `reserved_at`, `stored_at`). Header/data lama tidak ditulis ulang. Baris self-test T1 yang sudah salah posisi tetap dipertahankan; tidak ada konversi/cleanup otomatis. Reservasi tanpa `reserved_at` ditolak supaya gateway T2 tidak menulis ulang foto skema lama. Tab master/riwayat lain tidak dikerjakan. `SPREADSHEET_ID` tetap.
- Data tanpa foto diizinkan agar pengecualian foto pada plan §6 dapat dipakai; semua temuan yang tidak dikaitkan ke foto wajib mempunyai alasan. Form tetap maksimal satu foto; foto tambahan/finalisasi/draft/peta/review/ekspor tidak dikerjakan.
- Gateway build **`2026-10-09.4`**, schema metadata 2; envelope HMAC tetap v1. UI memeriksa versi dan SHA-256 JSON checklist, sehingga gateway lama yang mengabaikan field T2 tidak bisa memberi sukses palsu.
- Bukti lokal: check merah (5 kasus pada T1) → hijau; `npm run check` 22 test lulus; build produksi lulus; mutation blank→no_finding terdeteksi (2 test gagal), lalu dikembalikan; review kode terpisah tidak menemukan masalah material.
- UI Chromium headless (360/1024 px) pada `next start` + gateway tiruan lulus: semua area awal kosong, item wajib, temuan tanpa foto/review, ukuran null, retry, penolakan gateway lama, kaitan foto/unggah/baca kembali, reset area; screenshot diperiksa tanpa overflow/overlap. Harness browser sesi ini sementara, bukan bagian npm check.
- Revisi sub-area juga diuji dengan dua check merah→hijau (penyimpanan/retry/checksum dan kompatibilitas T2 awal). Browser lokal 360/1024 px lulus untuk ketersediaan pada tujuh area, input manual/trim/penyimpanan, retry identik, lokasi berubah menjadi record baru, serta konfirmasi/reset saat mengganti area; screenshot diperiksa.
- Kompatibilitas staging: tiga check baru awalnya gagal dengan error header pengguna, lalu hijau. Empat check pada `checks/storage-layout.check.mjs` menguji dua jenis baris historis (skema lama dan self-test misaligned), pemetaan/appending header, retry/checksum, upload/baca/pemulihan, `adminSelfTest` tiruan, dan penolakan header tidak dikenal.
- Salinan XLSX pengguna dimuat ke runtime tiruan untuk `adminSelfTest`: lulus, semua sel/baris asli serta tab lain dipertahankan, header 23/14. Reviewer terpisah tidak menemukan masalah material pada perubahan storage. Berikutnya header 23/14 sudah terbaca pada database asli yang diperbarui pengguna; gateway menulis T2 dari preview ke database yang sama.
- **Bukti web T2 baru, source `22129f9`:** pengguna menyelesaikan login Vercel di cloud browser. Checklist kosong dan alasan foto kosong ditolak form. Dua catatan sintetis Pit tersimpan: satu tanpa foto/enam `not_inspected`; satu JPEG 8×8 dengan temuan berfoto dan temuan tanpa foto/alasan (`reviewRequired=true`). Empat kode jawaban tersimpan terpisah; ukuran yang tidak diukur null; sub-area trim/cocok snapshot dan teks `=…` tetap teks. Foto `stored` 802 byte; SHA-256 byte download dari endpoint cocok dengan Sheets. Kedua retry identik tidak mengubah/menambah baris; retry foto mengembalikan acknowledgment replay. Sel lama pada rentang yang dibaca tetap utuh. Data uji belum dihapus.
- **Temuan izin aktual:** metadata foto uji Drive mengembalikan `shared=true`, permission `anyone` dengan role `writer`. Jangan menyatakan file sumber privat sebelum izin/inheritance diperiksa dan dibatasi. Tidak ada perubahan izin. Pencarian exact-name tidak menemukan file, sehingga hitungan file fisik terpisah belum dibuktikan; reservasi Sheets tetap satu.
- **Belum terbukti:** hasil lengkap `adminSelfTest` pengguna, build gateway lewat `doGet`, seluruh live checks dan respons hilang setelah write pada T2, Android nyata untuk form baru, privasi foto sumber dan persetujuan engineer. Production proyek masih kode T1 (`397f46b` saat dashboard dibaca). Uji T1 historis tidak boleh disebut sebagai bukti T2. Rincian dan runbook ada di README.

### Langkah setelah review T2 (bukan perintah mengerjakan T3)

Lihat README bagian “Memperbarui staging untuk menguji T2” dan bukti web terbaru. Pertahankan `SPREADSHEET_ID` yang ada. Uji fungsi preview sudah berjalan; berikutnya periksa izin foto/folder Drive yang terdeteksi `anyone/writer`, hasil lengkap self-test/build gateway, Android, dan review checklist engineer. Jangan menghapus tab/data lama atau mengganti susunan headernya. Payload frontend T1 tanpa versi/checklist ditolak gateway T2, sehingga rollout Production perlu dikoordinasikan. Tidak ada rahasia atau URL gateway staging tersedia pada sesi T2 ini. T3–T7 tetap di luar lingkup.

---

Catatan berikut merekam sesi T0/T1 sebelumnya:

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

## 8. T2 — kebutuhan saat serah terima T1 (telah ditangani pada pembaruan di atas)
Acceptance (plan §13): form/checklist **berversi** dengan validasi, dan **bukti bahwa item kosong tidak menjadi "tidak ada temuan"**.
- **Masukan pengguna yang belum ada (jangan dikarang):** daftar area (usulan plan §6: pit/lereng, waste dump, heap leach pad, dam/pond), checklist awal per jenis area (untuk review engineer; draf dari plan §6 boleh sebagai *usulan*), nama dua inspector.
- Aturan dari plan §6: empat jawaban terpisah (**Tidak ada temuan / Ada temuan / Tidak diperiksa / Tidak berlaku**); semua jawaban awal **kosong**; "Ada temuan" → jenis temuan, deskripsi, foto, atau alasan tanpa foto + status perlu review; ukuran/satuan/metode opsional, nilai tidak diketahui **null bukan nol**; label tindak lanjut Rutin / Perlu review / Segera dilaporkan hanyalah usulan (definisi final engineer); aplikasi tidak menghitung kestabilan dan tidak menetapkan ambang geoteknik. Template berversi di `config/checklists.json` (plan §12); versi template disimpan pada inspeksi.
- **Jebakan skema Sheets:** `sheet_()` hanya menulis header saat tab dibuat. Menambah kolom ke `SHEET_COLUMNS` tidak memperbarui header tab staging yang sudah ada, dan baris lama lebih pendek. Tambahkan kolom **di akhir** (additif, plan §15), dan putuskan cara memperbarui header atau minta pengguna menghapus tab staging uji. Kontrak JSON final sebaiknya baru dibekukan setelah review (plan §12).
- Check minimum: logika validasi di Node tanpa framework (stdlib), merah dulu, plus mutation check; uji tampilan lewat inspeksi UI.

## 9. Prompt awal yang disarankan untuk sesi baru
> Baca AGENTS.md, CLAUDE.md, docs/plan.md, docs/handoff.md, dan README.md. Mulai dari branch `claude/eager-carson-bqb25q`. Kerjakan hanya T2. Masukan saya: area = …; checklist = …; inspector = …. Jangan mengarang ambang geoteknik atau isi checklist.
