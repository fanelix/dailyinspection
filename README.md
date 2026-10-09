# dailyinspection

Aplikasi web inspeksi geoteknik harian (HP/tablet Android). Rencana dan keputusan: [`docs/plan.md`](docs/plan.md). Pedoman kerja agent: [`AGENTS.md`](AGENTS.md).

## Keputusan akses: tanpa aktivasi perangkat (2026-10-09)

Atas keputusan pengguna, aktivasi perangkat **dihapus** karena menyusahkan. Ini menggantikan keputusan 8 Oktober ("akses dikelola per perangkat") dan menyimpang dari `docs/plan.md` §3 (Akses tim), §10 (sesi, CSRF, pencabutan perangkat), dan §14 ("Meminta foto inspeksi tanpa izin → ditolak meski ID diketahui"). `docs/plan.md` tetap salinan apa adanya, jadi bagian itu di sana belum diperbarui.

Yang berlaku sekarang:

- Aplikasi **tidak punya login, cookie, atau kode**. Siapa pun yang tahu URL-nya dapat membuat inspeksi dan mengunggah foto.
- Gateway Apps Script tetap tidak bisa dipanggil langsung: server Next menandatangani setiap pesan (HMAC, timestamp, nonce).
- Kode tidak membuat tautan Drive publik. Endpoint foto memakai **pasangan ID inspeksi + ID foto** yang harus berpasangan; keduanya UUID acak 122 bit yang dibuat browser. ID itu berfungsi seperti kunci: jangan ditampilkan, dicatat, atau dibagikan di tempat umum. Privasi file sumber juga bergantung pada izin Drive; temuan izin foto uji T2 dicatat di bawah.

Risiko yang diterima pengguna (sudah disampaikan sebelum keputusan):

- Orang asing yang menemukan URL dapat mengunggah foto sampah ke Drive perusahaan (≤ 2 MB per foto, ≤ 5 foto per inspeksi, tanpa batas jumlah inspeksi), menulis catatan palsu yang tampak sama dengan yang asli, dan membuat antrean di lock gateway sehingga petugas sungguhan tidak bisa mengirim.
- Tidak ada pencabutan akses per perangkat. Nama petugas adalah teks bebas dan tidak terbukti; kolom `device_id` di tab `Inspections` dibiarkan kosong (kolom dipertahankan agar sheet staging yang sudah ada tetap cocok).
- Kebocoran sepasang ID (log, riwayat browser, tangkapan layar) memberi akses baca ke foto itu.

Perlindungan yang masih ada: HMAC gateway, validasi payload, batas 2 MB dan 5 foto per inspeksi, idempotensi (ID sama dengan isi berbeda = 409), teks tidak pernah dievaluasi sebagai rumus Sheets, dan batas body Vercel.

**Belum ada dan perlu keputusan pengguna:** batas laju atau kuota harian. Angkanya bergantung pada kapasitas yang belum ditetapkan (rencana §16), jadi tidak saya karang. Pengaman tanpa friksi yang bisa dipertimbangkan: aturan pembatasan laju di Vercel (Firewall; ingatan saya, belum diverifikasi), dan tidak menyebarkan URL. Alternatif ringan yang pernah ditawarkan dan ditolak: tautan aktivasi sekali ketuk, dan kode tim.

## T3: lokasi objek dan GPS petugas (2026-10-09)

Pengguna meminta melanjutkan tahap berikutnya dan mengabaikan pekerjaan izin foto. T3 dikerjakan pada `codex/t3-locations`, turunan dari T2 `9979a49`. T4–T7 belum dikerjakan. Rencana implementasi: [`docs/superpowers/plans/2026-10-09-t3-locations.md`](docs/superpowers/plans/2026-10-09-t3-locations.md).

- Form memerlukan **konfirmasi lokasi objek**: GPS petugas yang dipilih secara eksplisit sebagai objek, pin peta yang dapat digeser, lokasi tersimpan, atau latitude/longitude manual. GPS diambil hanya saat tombol ditekan; izin ditolak/tidak tersedia/timeout tetap memungkinkan pilihan lain. Perubahan lokasi/area membatalkan konfirmasi. Respons GPS lama dibatalkan ketika pengguna mengedit pilihan atau mengganti area.
- GPS petugas menyimpan latitude, longitude, akurasi meter dan waktu perangkat. Objek disimpan terpisah dengan metode dan waktu pemilihan. Pin/koordinat/lokasi tersimpan **tidak mewarisi akurasi GPS petugas**. Metadata sumber lokasi tersimpan ada di snapshotnya. Tidak ada batas akurasi wajib, konversi UTM/grid tambang, nilai RL, koordinat site, atau batas area yang dikarang.
- Leaflet **1.9.4 stable** dimuat hanya di browser. Latar OpenStreetMap adalah konteks umum, memakai atribusi terlihat dan tile standar tanpa prefetch/offline. Belum ada layer batas site yang terverifikasi. Tampilan awal dunia tidak memiliki pin objek; angka nol tetap valid jika dipilih manual.
- `location_json` ditambahkan **setelah `sub_area`**: skema staging `Inspections` 23 → 24 kolom (**X**); skema sederhana 13 → 14. Header/baris lama dipertahankan. Lokasi berversi 1 memakai `EPSG:4326`. SHA-256 lokasi dikonfirmasi sebelum UI memberi sukses; perubahan lokasi dengan ID inspeksi sama ditolak. Retry T2 tanpa lokasi tetap valid dan tidak menulis ulang baris lama.
- Frontend T3 memakai action **`prepareLocatedInspection`**. Gateway T2 menolak action ini sebelum menulis, sehingga rollout yang belum lengkap tidak menghasilkan catatan T3 tanpa lokasi. Action `prepareInspection` tetap melayani T2.
- Tautan **Unduh titik objek (GeoJSON)** mengekspor titik yang dikonfirmasi pada form dengan urutan **[longitude, latitude]**. Ini bukan ekspor riwayat inspeksi T6 dan bukan bukti titik sudah tersimpan server.

### Lokasi tersimpan memakai tab yang sudah ada

Header asli `Locations` (15 kolom) dan tabel pendukung telah dibaca langsung; seluruh tabel master tersebut masih berisi header saja saat audit. Daftar kosong tidak diisi koordinat contoh. API `/api/locations?areaId=…` membaca tanpa membuat atau mengubah tab. Pengelolaan master untuk T3 dapat dilakukan admin di Sheet; UI admin bukan bagian task ini.

| Kolom / tabel | Aturan pembacaan T3 |
| --- | --- |
| `Areas` | `area_id` asli, `name` cocok salah satu tujuh nama area (abaikan besar/kecil huruf), `active` bernilai true/1 |
| `Locations.entity_type` | `area`, `observation_object`, atau `photo_point` |
| `Locations.entity_id` | Cocok `Areas.area_id`, `ObservationObjects.object_id`, atau `PhotoPoints.photo_point_id`; objek/titik mempunyai `area_id` yang cocok Areas |
| Nama pilihan | `Areas.name` untuk area; `label` objek/titik untuk jenis lainnya |
| `location_id`, `revision` | ID unik, revisi bilangan bulat positif; revisi dipakai dalam snapshot |
| `latitude`, `longitude`, `source_crs` | Angka WGS84 dalam rentang; CRS eksplisit `EPSG:4326` atau `WGS84` |
| `source`, `accuracy_m`, `captured_at` | Sumber wajib; akurasi kosong → null; waktu kosong → null, bila diisi gunakan ISO UTC `YYYY-MM-DDTHH:mm:ss.sssZ` |

Kolom proyeksi (`source_x/y`) dan layer tetap dipertahankan, tidak ditransformasikan. Header/relasi/koordinat tidak valid ditolak. Master diperiksa lagi pada penyimpanan pertama; perubahan setelah catatan tersimpan tidak mengubah snapshot maupun retry historis.

### Memperbarui Apps Script untuk T3

1. Pakai proyek dan `SPREADSHEET_ID` staging yang sama. Salin **lima** file dari `apps-script/src`: `gateway.js`, `storage.js`, `checklist.js`, **`location.js`**, **`locations.js`** ke editor (nama tanpa `.js`). `location.js` dihasilkan `npm run sync:location`; `checklist.js` dihasilkan `npm run sync:checklist`.
2. Script Properties dan manifest tidak perlu diganti. **Deploy → Manage deployments → Edit → New version → Deploy** pada deployment yang sama. Mengganti isi editor saja tidak memperbarui web app. Build health `doGet` yang diharapkan: **`2026-10-09.5`**, schema checklist tetap 2.
3. Gunakan preview branch T3. Uji nama/sub-area manual, titik sintetis, konfirmasi, kirim, retry; periksa `Inspections!X` dan checksum acknowledgment. Master nyata hanya diisi dengan koordinat terverifikasi milik site.
4. Di Android nyata, uji izin GPS ditolak, timeout/tidak tersedia, lalu koordinat manual; uji GPS petugas dan pin objek berbeda. Pengujian GPS/perizinan perangkat belum terbukti oleh pemeriksaan Node.

**Bukti lokal T3:** baseline T2 22/22 lulus; `npm run check` T3 31/31 lulus (termasuk typecheck Next/Apps Script dan drift generator), `npm run build` lulus. Pengujian lokasi mencakup pin/GPS terpisah, batas WGS84/blank vs nol, akurasi pin null, checksum/retry/konflik, migrasi T2, master snapshot dan GeoJSON. Review selesai setelah perbaikan refresh master tanpa kehilangan checklist. Runtime tiruan tidak membuktikan penulisan Google nyata.

**Bukti preview T3, source `aa8b0b9`:** Vercel Ready; PR [#2](https://github.com/fanelix/dailyinspection/pull/2) draft bertumpuk di atas T2. Cloud browser menguji nama/sub-area manual, enam `not_inspected`, penolakan koordinat kosong/lokasi belum dikonfirmasi, preview/konfirmasi koordinat sintetis, perubahan membatalkan konfirmasi serta tautan ekspor, klik pin menghasilkan metode `manual_pin` dengan akurasi null, dan konfirmasi ulang. Refresh master mempertahankan nama/sub-area/semua jawaban. Payload tautan GeoJSON diamati [longitude, latitude]; penangkapan unduhan browser timeout, sehingga file unduhan aktual belum diverifikasi. Screenshot diperiksa.

**Rollout masih menunggu Apps Script:** kiriman T3 ke gateway yang terpasang ditolak dengan pesan layanan lokasi belum diperbarui. Pembacaan sebelum/sesudah pada `Inspections!A1:X80` dan `Photos!A1:N80` identik (28/17 baris terisi termasuk header); tidak ada penulisan T3 pada rentang tersebut. API master juga belum didukung gateway lama. Penyimpanan lokasi Google, daftar master nyata, GPS/izin Android dan drag pin Android belum terbukti. T3 belum dinyatakan memenuhi seluruh acceptance; ikuti runbook lima file di atas, lalu uji ulang.

## Status historis: implementasi dan uji fungsi T2 di preview (2026-10-09)

Satu inspeksi + satu foto: simpan metadata (Sheets) → unggah foto (Drive) → baca kembali, dengan retry memakai reservasi yang sama.

**Terbukti 2026-10-09 di staging pengguna** (Vercel + Apps Script + Drive + Sheets sungguhan): gateway menolak pesan tanpa tanda tangan (Tahap A, build `2026-10-09.1`); `adminSelfTest` lulus; alur penuh lewat Vercel dari browser (`checks/live-browser.js`, 14 pemeriksaan otomatis lulus, termasuk upload yang diputus klien lalu diulang → `replayed=true` tanpa file kedua); dan pemeriksaan manual pengguna di Drive dan Sheets lulus (satu file, baris `stored`, catatan `=…` tetap teks, foto tidak terbuka tanpa izin).

**Android (dilaporkan pengguna, 2026-10-09):** uji di Chrome Android dengan foto sungguhan, dari kamera dan galeri, lalu Kirim: foto tersimpan di Drive dan keterangan tersimpan di Sheets; pengguna melaporkan "semuanya berjalan". Yang **tidak tercatat**: model HP, versi Chrome, lama unggah, dan hasil per poin (foto potret tegak, resolusi sangat tinggi, HEIC).

**Acceptance T1 (rencana §13) terpenuhi**: Android mengirim dan membaca foto privat, retry tidak menggandakan, dan gateway tanpa otorisasi ditolak. Masukan T2 telah diterima: tujuh area di bawah; checklist diminta sebagai usulan; nama petugas diisi manual. Tidak perlu menyediakan daftar nama inspector.

Kompresi foto (orientasi, batas ukuran) **ditarik maju dari T4 atas keputusan pengguna**, agar uji Android memakai foto kamera asli. `docs/plan.md` tetap salinan apa adanya, jadi urutan task di sana belum diperbarui.

Belum ada setelah T3: finalisasi (T4), draft offline (T5), riwayat/review/ekspor (T6).

## T2: checklist usulan dan penyimpanan

Branch `codex/t2-checklists` berasal dari `claude/eager-carson-bqb25q` pada commit `50318a7`. Perubahan T2 disiapkan pada branch terpisah karena branch awal terhubung langsung ke staging Vercel. Preview T2 sudah Ready dan diuji lewat cloud browser pada 9 Oktober; gateway menulis T2 ke database staging yang sama. PR #1 masih draft dan belum digabung. Deployment Production proyek masih memakai kode T1; jangan memakai domain Production untuk uji form T2.

| Area | Enam item usulan |
|---|---|
| Pit | Retakan; rockfall/material lepas; perubahan lereng/crest/toe; rembesan; drainase; akses/pembatas |
| Waste Dump | Retakan/penurunan; lereng/toe; erosi; rembesan; drainase; penempatan material/akses |
| LGSP | Retakan/penurunan; lereng/toe; pengambilan/penempatan; rembesan/genangan; drainase/erosi; akses |
| Topsoil Stockpile | Retakan/penurunan; lereng/toe; erosi/pelindung permukaan; rembesan/genangan; drainase/sedimen; akses/aktivitas |
| Sedimen Sump | Lereng/tanggul; muka air; inlet/outlet; akumulasi sedimen; rembesan/gerusan; akses |
| DAM | Retakan/penurunan crest; lereng/toe; erosi/proteksi; rembesan/drain; muka air/jejak limpasan; spillway/outlet/akses |
| Heap Leach | Retakan/penurunan; lereng/toe; genangan; rembesan; drainase/koleksi; liner/proteksi yang terlihat |

- Template `2026-10-09.draft1`, schema metadata `2`, status **usulan untuk review engineer site**. Ini tidak menetapkan ambang atau menyatakan area aman. Definisi TARP/tindak lanjut final tidak dikarang.
- Area dan semua jawaban mulai **kosong**. Enam jawaban wajib dipilih; `no_finding`, `finding`, `not_inspected`, dan `not_applicable` disimpan berbeda. Mengganti area meminta konfirmasi jika ada jawaban, kemudian mengosongkan checklist area baru.
- `Ada temuan` membutuhkan jenis dan deskripsi, serta foto yang secara eksplisit ditandai menunjukkan temuan itu **atau** alasan tanpa foto. Tanpa foto → `reviewRequired=true` (**Perlu review**). Foto umum tidak otomatis menjadi bukti semua temuan.
- Pengukuran opsional: nilai, satuan, dan metode harus lengkap bila diaktifkan. Tidak diukur disimpan `null`; angka nol hanya tersimpan bila benar-benar diisi. Tidak ada batas geoteknik numerik.
- Form masih memakai maksimal satu foto T1. Data boleh dikirim tanpa foto; semua temuan tanpa foto wajib beralasan. Upload multi-foto/finalisasi tetap T4. Status record tetap `uploading`, tidak pernah `submitted` pada T2.
- Nama petugas teks manual (1–100 karakter setelah trim), bukan pilihan nama tetap maupun identitas login.
- **Sub-area / detail lokasi** adalah teks manual opsional untuk semua area (maksimal 200 karakter setelah trim), misalnya nama blok, bench, sektor atau bagian fasilitas. Kosong tidak diberi nama otomatis. Disimpan pada kolom `sub_area` dan snapshot; isi ini ikut checksum dan konflik retry. Saat area diganti, sub-area dikosongkan setelah konfirmasi. Header T2 awal 12 kolom diperluas menjadi 13 tanpa mengubah baris lama; payload lama tanpa sub-area tetap valid. Ini adalah detail nama lokasi; koordinat/peta tetap T3.
- Header T1 (8 kolom), T2 awal (12 kolom), T2 lengkap (13 kolom), serta skema staging pengguna (`Inspections` 17 kolom / `Photos` 10 kolom) dikenali secara tepat. Kolom yang kurang ditambahkan di kanan, tanpa mengubah header atau baris lama. Header diubah/tertukar ditolak agar data tidak salah kolom.
- `checklist_json` menyimpan snapshot item/label/petunjuk, jawaban, rincian temuan, relasi photo ID, dan flag review. ID bukan untuk ditampilkan/dibagikan. ID inspeksi sama dengan checklist berbeda menghasilkan konflik; retry identik tidak membuat baris baru.
- Gateway mengembalikan versi serta SHA-256 JSON checklist. UI hanya melanjutkan/sukses setelah checksum sesuai; gateway T1 yang mengabaikan kolom baru tidak boleh menghasilkan sukses palsu. Konfirmasi itu hanya metadata; foto tetap harus mendapat `stored` + checksum foto.

### Memakai database staging yang sudah ada

Keputusan pengguna 9 Oktober: gunakan **Geotech Inspection Staging DB** yang sama. Header aslinya diperiksa melalui koneksi Google Sheets; `SPREADSHEET_ID` tetap. Gateway mengenali dua susunan kolom lewat `sheetLayout_`, lalu semua pembacaan/penulisan record memakai pemetaan yang sama:

| Data gateway | Kolom staging yang dipakai |
|---|---|
| Nama petugas (`inspector_name`) | `reporter_name` |
| Waktu diterima (`received_at`) | `created_at` |
| Status (`status`) | `workflow_status` |
| Versi record (`version`) | `revision` |
| SHA-256 foto (`sha256`) | `checksum` |

- `Inspections`: enam kolom baru **R:W** = `device_id`, `observed_at`, `note`, `schema_version`, `checklist_json`, `sub_area` (17 → 23). `area_id` dan `template_version` dipakai di posisi lama. Record baru memiliki `updated_at` sama dengan waktu dibuat, identitas/submission tetap `unverified`, dan status `uploading`.
- `Photos`: empat kolom baru **K:N** = `size`, `mime`, `reserved_at`, `stored_at` (10 → 14). Foto T2 memakai revision inspeksinya; byte disimpan di Drive. Izin file sumber perlu mengikuti kebutuhan privat (lihat temuan uji web di bawah).
- Kolom lama seperti `operation_id`, `operational_date`, `shift`, `template_id`, relasi item/finding foto, dan tab lain tidak diisi otomatis oleh T2. Waktu observasi lengkap ada di `observed_at`; hubungan temuan/foto ada pada snapshot `checklist_json`. T2 memakai template repo, bukan mengubah tab master `ChecklistTemplates`.
- Catatan lama, termasuk baris self-test T1 yang dahulu masuk dengan posisi salah, dipertahankan apa adanya. ID inspeksi lama tidak dipakai ulang. Foto skema lama yang tidak memiliki reservasi gateway tidak diterima sebagai foto T2 dan tidak ditulis ulang; pemulihan riwayat lama bukan bagian T2.
- Pengujian lokal mereproduksi kedua jenis baris lama dan memeriksa prepare/retry, upload/baca foto, pemulihan tanpa file ganda, serta penolakan header yang tidak dikenal. Header 23/14 kolom sudah terbaca di Sheets sungguhan; penulisan melalui web T2 terbukti sesuai pemetaan. Hasil lengkap `adminSelfTest` pengguna tidak diamati pada sesi ini.

### Memperbarui staging untuk menguji T2

Runbook pembaruan dan pengujian ulang berikut tetap berlaku. Uji fungsi web T2 terhadap Google sungguhan sudah dijalankan; hasil dan batas buktinya ada di bawah. Simpan salinan Spreadsheet staging sebelum pembaruan. Tidak perlu menghapus tab atau data T1.

1. Salin **tiga** file `apps-script/src/gateway.js`, `storage.js`, dan **`checklist.js`** ke editor Apps Script (nama file `gateway`, `storage`, `checklist`). Isi `checklist.js` dihasilkan oleh `npm run sync:checklist`; jangan diedit terpisah.
2. Pertahankan `SPREADSHEET_ID` database yang sama. Jalankan `adminSelfTest` di editor staging. Selain uji foto T1, fungsi ini memeriksa versi/checklist/checksum pada Sheets. Periksa header tambahan sesuai susunan tab yang dikenali dan bahwa baris lama tetap utuh. Uji ini meninggalkan baris uji dan membuang foto uji ke trash.
3. Buat **New version** untuk deployment web app. Jalankan Tahap A; `build` harus **`2026-10-09.4`**, `schemaVersion` **2**. Envelope HMAC tetap `v:1`.
4. Deploy frontend branch T2 ke preview/staging yang disetujui, lalu jalankan `checks/live.mjs` atau `checks/live-browser.js` terbaru. Skrip kini mengirim checklist sintetis `Tidak diperiksa`, memeriksa penolakan jawaban kosong dan konfirmasi versi/checksum, lalu menguji upload/retry/baca foto.
5. Uji Android nyata: pilih area, periksa jawaban awal kosong, isi nama dan sub-area manual, buat temuan berfoto serta tanpa foto/alasan, lalu periksa `checklist_json` dan kolom `sub_area`. Checklist isi operasional tetap perlu review engineer.

Gateway T2 menolak payload lama tanpa versi/checklist (tidak diisi default). Karena itu pembaruan gateway dan frontend staging perlu dikoordinasikan; frontend T1 tidak dapat mengirim inspeksi baru setelah gateway diganti. Data/foto T1 lama tetap dipertahankan. Jangan mengembalikan gateway T1 untuk menulis baris T2; pemulihan kode harus memakai pasangan frontend/gateway yang cocok dan menjaga kolom tambahan.

### Bukti web T2 dan batasnya — 9 Oktober 2026

Uji melalui preview `codex/t2-checklists`, source `22129f9`, setelah pengguna menyelesaikan login Vercel di cloud browser. Login tersebut adalah Deployment Protection preview, bukan aktivasi perangkat aplikasi. Proteksi tidak diubah. Database tetap **Geotech Inspection Staging DB** yang sama.

- Checklist kosong ditolak oleh validasi form; sel database yang diperiksa tidak berubah. Temuan tanpa foto dan tanpa alasan juga ditolak form.
- Satu catatan sintetis Pit tanpa foto tersimpan: schema 2, template `2026-10-09.draft1`, enam `not_inspected`, sub-area di-trim dan cocok dengan snapshot. Sub-area dan catatan berawalan `=` kembali sebagai teks, bukan rumus. Pengiriman ulang identik tidak menambah atau mengubah sel record.
- Catatan sintetis kedua memakai satu JPEG 8×8: temuan pertama dikaitkan secara eksplisit ke foto; temuan kedua tanpa foto mempunyai alasan. Snapshot menyimpan empat kode jawaban terpisah dan `reviewRequired=true`; pengukuran kedua temuan tetap null. Foto berstatus `stored`, 802 byte, dibaca kembali lewat endpoint; SHA-256 byte hasil download cocok dengan kolom `checksum`.
- Retry kedua menampilkan acknowledgment replay dan baca foto berhasil; baris `Inspections`/`Photos`, reservasi file dan checksum tidak berubah. Uji meninggalkan **dua catatan sintetis dan satu reservasi foto stored**. Tidak ada penghapusan data uji atau perubahan data lama pada rentang yang diperiksa (baris 1–80, kolom nama, observasi, catatan, snapshot, sub-area dan metadata foto).
- **Izin Drive belum memenuhi kebutuhan privat:** metadata foto uji menunjukkan `shared=true`, permission `anyone` berperan `writer`. Izin sumber/inheritance perlu diperiksa dan dibatasi sebelum foto lapangan dipakai. Tidak ada perubahan izin pada sesi ini. Pencarian exact-name Drive tidak mengembalikan hasil, sehingga jumlah file fisik di folder belum dibuktikan secara terpisah; bukti retry terbatas pada acknowledgment dan reservasi Sheets yang sama.
- Ini uji UI desktop cloud browser dan jalur web → gateway → Sheets/Drive, bukan eksekusi seluruh `checks/live.mjs`/`live-browser.js`. Build `doGet` gateway belum dibaca langsung; kegagalan jaringan setelah write tidak disimulasikan pada sesi ini. Android nyata untuk form T2 dan persetujuan checklist engineer masih belum terbukti. Tidak ada merge/promosi Production atau pekerjaan T3–T7.

### Bukti lokal T2

- Check merah pada T1: 5 kasus gagal karena jawaban kosong/versi tidak diperiksa dan kolom belum tersedia. Setelah implementasi dan penyesuaian skema staging, `npm run check` lulus **22 test**, termasuk regresi T1; `npm run build` lulus.
- Mutation check: sengaja mengganti jawaban kosong menjadi `no_finding` membuat dua test gagal; perubahan mutasi dibatalkan, validator dihasilkan ulang.
- Chromium headless pada `next start` lokal + gateway tiruan: UI 360 px dan 1024 px diperiksa; 7 area mulai kosong, item wajib, temuan tanpa foto/review, ukuran null, retry tanpa duplikasi, gateway lama ditolak, kaitan foto + unggah/baca kembali, dan reset area lulus. Ini bukan uji Chrome Android nyata.
- Revisi sub-area: dua check baru gagal sebelum implementasi lalu lulus, termasuk kompatibilitas snapshot/header T2 awal. Uji browser lokal 360/1024 px lulus: sub-area tersedia untuk ketujuh area, trim dan penyimpanan, retry identik, lokasi berubah menjadi record baru, serta konfirmasi/reset saat mengganti area. Screenshot diperiksa tanpa overflow/overlap.
- Kompatibilitas staging: tiga check baru awalnya gagal dengan error header yang sama seperti screenshot pengguna, lalu lulus setelah pemetaan. Empat check pada `checks/storage-layout.check.mjs` memeriksa tambahan kolom, pelestarian baris lama/misaligned, checksum, prepare/retry/upload/baca/pemulihan dan `adminSelfTest` tiruan, serta header rusak tetap ditolak.
- Salinan XLSX database yang diberikan pengguna juga dimuat seluruhnya ke runtime tiruan: `adminSelfTest` lulus, semua sel/baris asli dipertahankan, tab lain tidak berubah, header Inspections/Photos bertambah menjadi 23/14 kolom. Ini tetap bukan penulisan ke Sheets sungguhan. Review terpisah atas pemetaan storage tidak menemukan masalah material.
- Review kode terpisah tidak menemukan masalah material. Tiruan Apps Script tetap tidak membuktikan perilaku Google.

## Perintah

```
npm ci
npm run check    # cek sinkronisasi, typecheck Next + Apps Script, lalu checks/*.check.mjs (tanpa jaringan)
npm run build
npm run dev      # perlu .env.local (lihat .env.example) dan gateway sungguhan
```

`npm run check` memakai runtime Apps Script palsu (`checks/fake-apps-script.mjs`). Itu menguji logika kita, bukan Google.

## Struktur

| Path | Isi |
|---|---|
| `app/page.tsx`, `components/ChecklistFields.tsx` | Nama manual, area, checklist, rincian temuan, catatan, dan maksimal satu foto (alur T1) |
| `config/checklists.json`, `lib/inspection.ts` | Template usulan berversi, empat jawaban terpisah, validasi bersama, snapshot |
| `scripts/sync-checklist.mjs`, `apps-script/src/checklist.js` | Menghasilkan validator/template yang sama untuk Apps Script; file hasil ikut di-deploy |
| `app/api/*` | `inspections` (prepare), `inspections/[id]/photos/[photoId]` (PUT unggah, GET baca) |
| `lib/gateway.ts` | Klien server ke gateway: pesan bertanda HMAC, redirect Apps Script, timeout = hasil belum diketahui |
| `lib/photos.ts` | Batas ukuran, kompresi native (`createImageBitmap` + canvas; orientasi EXIF dibakar ke piksel), SHA-256 (dipakai browser dan server) |
| `apps-script/src/gateway.js` | `doGet`/`doPost`: verifikasi tanda tangan, timestamp, nonce; allowlist action; build marker |
| `apps-script/src/storage.js` | Sheets + Drive: reservasi ID file, unggah idempoten, pemulihan, `adminSelfTest` |
| `checks/` | `gateway.check.mjs` dan `photos.check.mjs` (lokal), `live.mjs` (staging, Node), `live-browser.js` (staging, tempel di Console), fake runtime |

## Memasang staging (untuk membuktikan T1)

Gunakan folder Drive dan Spreadsheet **staging** yang terpisah dari produksi.

1. **Siapkan** satu folder Drive (catat ID-nya) dan satu Spreadsheet kosong (catat ID-nya) di akun perusahaan.
2. **Apps Script**: buat proyek standalone. Salin `apps-script/appsscript.json` (Project Settings → tampilkan manifest) dan isi `apps-script/src/gateway.js`, `storage.js` ke file bernama `gateway` dan `storage`. (`clasp` juga bisa, belum diuji di sesi ini.) Manifest mengaktifkan Drive advanced service v3 dan meminta scope `spreadsheets` + `drive`.
3. **Script Properties**: `GATEWAY_HMAC_SECRET` (acak ≥ 32 karakter, mis. `openssl rand -hex 32`), `SPREADSHEET_ID`, `PHOTO_ROOT_FOLDER_ID`. Properti `dev:*` dan `act:*` dari versi lama dengan aktivasi sudah tidak dipakai dan boleh dibiarkan atau dihapus.
4. **Deploy** → Web app: *Execute as: Me*, *Who has access: Anyone*. Salin URL `/exec`. Kebijakan Workspace bisa melarang "Anyone"; bila ya, itu temuan T1 yang harus diputuskan admin, bukan dilonggarkan diam-diam.
   **Tahap A, uji Apps Script saja (belum perlu Vercel).** Butuh Node 20+, tanpa `npm install`:
   ```
   GATEWAY_URL=<url /exec> node checks/live.mjs
   ```
   Harus keluar 2 baris `LULUS` (gateway menjawab JSON, dan menolak pesan tanpa tanda tangan) dan `build gateway:` yang sama dengan `GATEWAY_BUILD` di `gateway.js`. URL `/exec` bukan rahasia, jadi boleh dibagikan untuk dicek dari luar jaringan perusahaan.
   **Tahap A+, uji Drive dan Sheets dari editor (tanpa Vercel, tanpa terminal).** Tempel `storage.js` terbaru ke editor, pilih fungsi `adminSelfTest`, klik **Run**, dan baca *Execution log*. Semua baris harus `LULUS`, diakhiri `SELF-TEST LULUS`. Fungsi ini memakai kode storage yang sama dengan jalur produksi, termasuk langkah pemulihan (Drive harus menolak `create` dengan ID yang sudah ada, lalu isi file diverifikasi lewat MD5), dan meninggalkan 1 baris di tiap tab serta 1 file yang dibuang ke tempat sampah.
   Mengganti kode di editor **tidak** mengubah deployment web app: buat versi baru (*Deploy → Manage deployments → ✏ → New version*), lalu ulangi Tahap A dan pastikan `build gateway:` cocok. Build kosong atau lama berarti kode lama masih berjalan.
5. **Vercel** (project staging; paket sesuai penggunaan perusahaan): isi `GATEWAY_URL` dan `GATEWAY_HMAC_SECRET` (sama dengan Script Property). `SESSION_SECRET` dari versi lama sudah tidak dipakai. Deploy.
   Dua jebakan yang sudah terjadi pada pemasangan pertama (menu dari ingatan, bisa sedikit berbeda):
   - Layar impor repo **tidak punya pilihan branch**: Production Branch selalu branch default repo (`main`). Selama `main` kosong, Vercel memilih Framework Preset **"Other"** dan build gagal dengan `No Output Directory named "public"`. Atur **Framework Preset = Next.js** (*Settings → Build and Deployment*, tanpa *Override*), lalu **Production Branch = branch aplikasi** (*Settings → Environments → Production → Branch Tracking*; tampilan lama *Settings → Git*).
   - Pastikan deployment yang dibangun memang dari branch aplikasi: halaman deployment menampilkan *Source* (branch dan commit). Log `up to date in …ms` lalu `No Next.js version detected` berarti yang dibangun `main` yang kosong. Redeploy deployment lama membangun ulang commit lamanya; commit baru di branch memicu build otomatis pada commit terbaru.
   Awas **Deployment Protection**: URL preview Vercel biasanya dikunci login Vercel (ingatan saya, belum saya verifikasi; Vercel tidak terjangkau dari sandbox). Telepon dan skrip akan melihat halaman login, bukan aplikasi. Pakai domain production dari project staging khusus ini, atau matikan proteksi untuk project ini saja, sesuai keputusan Anda.
6. **Tahap B, seluruh alur** (tanpa kode atau login):
   ```
   BASE_URL=https://<staging> GATEWAY_URL=<url /exec> node checks/live.mjs
   ```
   Opsional: `PHOTO_PATH` (JPEG ≤ 2 MB; skrip ini mengirim byte apa adanya, tanpa kompresi). Di PowerShell: `$env:BASE_URL="..."; $env:GATEWAY_URL="..."; node checks/live.mjs`.
   **Laptop terkunci (tanpa hak admin untuk memasang Node):** buka halaman aplikasi, tekan F12 → *Console*, ketik `allow pasting` bila Chrome meminta, lalu tempel seluruh isi `checks/live-browser.js` dan Enter. Itu setara Tahap B (tanpa pemeriksaan gateway-langsung, karena browser tidak boleh memanggil `script.google.com`; Tahap A tetap dijalankan dari terminal oleh siapa pun yang punya Node). Kodenya hanya memanggil origin yang sama. Jika DevTools dilarang kebijakan perusahaan: GitHub Codespaces (terminal di browser, Node sudah ada) atau Node versi ZIP portabel dari nodejs.org.
   Pemeriksaan pertamanya (`POST /api/inspections` dengan body kosong harus dijawab `400 VALIDATION_ERROR`) sekaligus membuktikan aplikasi, `GATEWAY_URL`, dan HMAC bekerja. Jika gagal, baris `INFO` di bawah `GAGAL` menyebut penyebab umum (halaman login Vercel, `GATEWAY_URL`/`GATEWAY_HMAC_SECRET` tidak cocok atau belum deploy ulang).
7. **Periksa manual** (tidak bisa dibuktikan skrip): tepat satu file foto di folder staging, satu baris `Photos` berstatus `stored`, kolom `note` di `Inspections` berisi teks `=Data uji …` apa adanya (bukan `#ERROR!`), foto tidak terbuka lewat tautan Drive tanpa izin.
8. **Uji Android**: buka URL staging, isi form, lalu pilih foto dari kamera dan dari galeri, Kirim. Periksa di perangkat nyata:
   - foto **potret** tampil tegak (pratinjau, hasil baca-kembali, dan file di Drive);
   - waktu "Menyiapkan foto…" dan apakah form tetap responsif;
   - foto beresolusi sangat tinggi (≥ 48 MP) tidak membuat tab mati; bila gagal harus muncul pesan, bukan crash;
   - foto HEIC/format lain yang tidak bisa didekode perangkat ditolak dengan pesan jelas.

## Yang belum terbukti dan asumsi (T1)

- **Terbukti di Google sungguhan** (staging pengguna, 2026-10-08): akses deployment "Anyone" dari luar jaringan, HMAC dan redirect `doPost`, `Drive.Files.generateIds` + `create` dengan ID cadangan, penolakan `create` untuk ID ganda lalu verifikasi MD5 (tepat satu file), pembacaan kembali dari Drive.
- **Sheets, diukur**: format `@` saja menahan konversi tanggal/angka tetapi **tidak** mencegah teks berawalan `=` menjadi rumus (injeksi rumus lewat nama/catatan). `writeRow_` memakai `@` + apostrof di depan setiap nilai tidak kosong; semua 13 nilai uji kembali apa adanya, dan `adminSelfTest` penuh lulus di Sheets sungguhan (termasuk teks `=…`, nama berawalan apostrof, dan sel kosong yang dibiarkan kosong).
- **Versi gateway**: `doGet` menyebut `build`. Setelah penghapusan aktivasi, build berubah menjadi `2026-10-09.1`; deployment yang masih menampilkan `2026-10-08.1` atau kosong masih memakai kode dengan aktivasi.
- **Terbukti lewat Vercel dan Google sungguhan** (2026-10-09): jalur aplikasi → gateway → Drive/Sheets dengan foto kecil, termasuk respons hilang lalu diulang, baca kembali dengan bytes identik, dan pasangan ID. Uji lain (UI, kompresi, orientasi) baru dijalankan di Chromium headless terhadap `next start` lokal dan gateway tiruan.
- **Tidak terukur**: lama unggah foto sungguhan. Pengguna melaporkan unggahan dari Android berhasil, tetapi tanpa angka; upload foto kecil sudah melampaui batas klien 1,5 dtk pada uji respons-hilang. Timeout gateway 30 dtk dan `maxDuration` 60 dtk tetap angka usulan, belum diukur. Sebaiknya diukur di T4/T5 sebelum pilot, bersama kuota Apps Script untuk dua petugas.
- **Tidak tercatat dari uji Android**: model HP, versi Chrome, dan hasil per poin (foto potret tegak, resolusi sangat tinggi, HEIC). Bukti kompresi per poin hanya dari Chromium headless desktop.
- Scope `drive` (luas) dipakai karena folder induk bukan dibuat oleh aplikasi sehingga `drive.file` tidak cukup.
- Nilai usulan, belum ditetapkan pengguna atau diukur: toleransi jam 5 menit, TTL replay 10 menit, timeout gateway 30 dtk, `maxDuration` 60 dtk, 3 percobaan ulang (jeda 1 dtk, 2 dtk), foto JPEG ≤ 2 MB dan ≤ 5 per inspeksi, sisi panjang 2048 px, kualitas awal 0,8 (rencana §8).
- Kompresi: kualitas turun 0,8 → 0,7 → 0,6 dan penjaga sumber 32 MB adalah **usulan** (lantai kualitas belum ditetapkan). Foto yang tetap > 2 MB ditolak dengan pesan, tidak diunggah diam-diam; dengan foto nyata cabang ini praktis tidak tercapai (derau seragam 2048×2048, kasus terburuk yang dicoba, berakhir 1,91 MiB).
- Hasil kompresi **tidak membawa EXIF** (termasuk GPS dan jam kamera); orientasi sudah dibakar ke piksel. Foto asli di galeri tidak disentuh. Lokasi inspeksi akan diambil terpisah (T3).
- Memori puncak kompresi ≈ resolusi asli yang didekode (12 MP ≈ 48 MB); belum diukur di Android. Bukti kompresi baru dari Chromium headless desktop (orientasi EXIF 1/3/6/8 cocok dengan oracle PIL, PNG transparan → latar putih), bukan dari kamera atau browser Android.
- Foto disimpan langsung di folder root staging, tanpa struktur `YYYY/MM/AREA/INSPECTION_ID`; belum ada tab `Audit` atau peran reviewer/admin.
- Pemindaian linear Sheets dan satu lock skrip cukup untuk dua petugas; evaluasi pindah backend mengikuti rencana §16.
- Nama petugas diisi manual sesuai keputusan pengguna 9 Oktober; tidak ada daftar nama tetap.
