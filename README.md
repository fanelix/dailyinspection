# dailyinspection

**Status terakhir, 10 Oktober 2026:** pekerjaan sudah sampai **T6** di `codex/t6-history` (produk `8c4d134`), PR [#5](https://github.com/fanelix/dailyinspection/pull/5) draft bertumpuk di atas PR #4 (T5, `5d65e0d`). Gateway aktif sudah **`build 2026-10-10.2`** (dua file: `gateway`, `storage`). Verifikasi nyata T4/T5 dan T6 terhadap Google sudah dijalankan dari Codespace: riwayat menampilkan record T5 sintetis (revisi 2, 2 foto), review menyimpan **revisi 3** dengan temuan ditutup, versi basi ditolak `VERSION_CONFLICT` 409, replay `reviewId` sama idempoten, kedua foto dibaca ulang dengan checksum = manifest, ekspor CSV/GeoJSON benar (`[117.000261105488, -1.9999997634890758]`). Sisa pemeriksaan manual pengguna: kolom **`Inspections!Z review_json`** pada baris `Uji T5 verifikasi 20261010043340` (lihat `docs/handoff.md`). Foto penutupan ditunda atas keputusan pengguna. Android/lapangan, T7, dan promosi Production belum; semua PR tetap draft.

## T7 — uji browser nyata, runbook, dan rollout (2026-10-10)

Status: **sebagian**. `checks/t7-browser.mjs` menjalankan Chromium headless nyata terhadap `next start` dengan gateway Apps Script tiruan. Ia **tidak** masuk `npm run check`. Jalankan setelah `npm run build`:

```
PLAYWRIGHT_MODULE=<path modul playwright> node checks/t7-browser.mjs
```

Hasil terakhir: **20/20 pemeriksaan lulus**. Mencakup mode pesawat (simpan, reload, kirim gagal lalu sukses tepat sekali), dua tab dengan Web Locks, jalur galat kuota, dan eviksi IndexedDB (antrean hilang tanpa klaim terkirim, tanpa crash).

- **Batas kuota:** batas kuota CDP tidak memicu galat tulis IndexedDB di Chromium ini, walau `navigator.storage.estimate()` melapor kuota 1 byte. Jalur galat diuji dengan **suntikan** `QuotaExceededError`, bukan kuota OS nyata.
- **Belum terbukti:** Android nyata, mode pesawat OS, eviksi dan kuota OS, GPS/kamera, Sheets/Drive/Apps Script nyata, backup/restore, dan volume pilot.
- **Rollback:** gateway T5 menolak header Inspections 26 kolom (`review_json`). Jangan rollback gateway ke sebelum T6 setelah kolom Z ada. Frontend T5 dengan gateway T6 kompatibel dari kode, belum diuji Google.

**Android (2026-10-10):** pengguna melaporkan skenario 1–15 lulus di Oppo Find X8 dengan Chrome, pada preview T6. Sheets staging mengonfirmasi satu kiriman end-to-end: satu inspeksi `submitted`, satu foto dengan checksum sama dengan manifest, tanpa duplikat. Browser tidak memberi penyimpanan persisten.

Checklist uji Android, prosedur backup/restore, gerbang Production G1–G7, dan rollback ada di [`docs/runbook.md`](docs/runbook.md). Tidak ada merge atau promosi Production; semua PR tetap draft.

## T6 — riwayat, review dan ekspor (2026-10-10)

Dikerjakan di `codex/t6-history` bertumpuk di atas T5 (`5d65e0d`); PR [#5](https://github.com/fanelix/dailyinspection/pull/5) draft. Foto penutupan **ditunda** atas keputusan pengguna (10 Oktober); invarian manifest T4 tidak diubah. Rencana: [`docs/superpowers/plans/2026-10-10-t6-history.md`](docs/superpowers/plans/2026-10-10-t6-history.md).

- Tiga aksi gateway baru (build **`2026-10-10.2`**): `listInspections` (filter area/status/rentang tanggal observasi + paginasi limit 1–50, tanpa blob), `getInspection` (snapshot checklist, lokasi, manifest, metadata foto, review; tanpa byte/ID Drive), `reviewInspection` (revisi baru dengan `expectedVersion`; `VERSION_CONFLICT` 409 untuk versi basi; replay idempoten per `reviewId`).
- Kolom additif **`review_json`** di kanan `Inspections` (**Z**; staging 25 → 26, sederhana 15 → 16) menyimpan riwayat review sebagai array JSON, dibatasi 20 entri per sel (`ponytail:` pindah ke tab Audit bila riwayat penuh diperlukan). Header/baris lama tidak ditulis ulang. Review hanya untuk record `submitted`.
- Layar **`/riwayat`** (filter, kartu status/temuan/review, unduh CSV/GeoJSON dari baris yang tampil, “Muat lagi”) dan **`/riwayat/[id]`** (checklist/temuan, peta baca-saja, foto lewat pasangan ID, form review per temuan, riwayat review, tombol “Muat versi terbaru” saat konflik). Tautan “Riwayat inspeksi” di beranda.
- Ekspor dibangun di browser (`lib/history.ts`): CSV RFC4180 dengan pengaman formula injection (teks berawalan `= + - @`/tab diberi kutip depan; angka negatif tidak) dan GeoJSON WGS84 `[longitude, latitude]` dengan `geometry: null` untuk record tanpa lokasi. Foto tetap hanya lewat pasangan ID inspeksi+foto.
- **Bug nyata yang ditemukan saat verifikasi dan diperbaiki (`8c4d134`):** `listInspections`/`getInspection` awalnya membaca kolom mentah sehingga pemetaan staging (`reporter_name`, `workflow_status`, `revision`, `checksum`) tidak diterapkan — nama/status/versi/checksum tampak kosong di data nyata. Check regresi dengan header staging ditambahkan; runtime tiruan berskema sederhana tidak menangkapnya.
- **Bukti lokal:** 74/74 checks (9 check T6: filter/paginasi/skip baris rusak read-only, detail tanpa byte, validasi/konflik/replay/cap review, mapping staging, CSV guard, GeoJSON, pasangan foto, rute Next), typecheck Next + Apps Script, build produksi lulus; smoke UI Chromium 12/12 dengan JPEG asli terhadap gateway tiruan.
- **Bukti Google nyata, 10 Oktober (verifikasi 22/22 lulus):** riwayat memuat 12 record UUID (`skipped` 17 baris lama non-UUID, tidak diubah); record `Uji T5 verifikasi 20261010043340` tampil Terkirim revisi 2 dengan 2 foto yang didekode; review “Reviewer verifikasi T6” menyimpan revisi 3 dengan temuan `cracks` ditutup; versi basi → 409 `VERSION_CONFLICT`; replay `reviewId` sama → acknowledgment sama tanpa revisi kedua; detail tidak membocorkan byte/ID Drive; CSV/GeoJSON memuat record dengan koordinat benar. Tidak ada baris baru (matched tetap 12).
- **Belum terbukti:** pemeriksaan manual kolom `Inspections!Z` oleh pengguna, Android nyata, serta perilaku dua reviewer bersamaan di lapangan. T7 (uji lapangan, backup/restore, rollout) belum dimulai.

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

**Verifikasi T4 Google asli sebelum perbaikan gateway, 2026-10-10:** Kirim ulang attempt dua JPEG sintetis mendapat `RETRYABLE_ERROR`. Rentang staging `Inspections!A1:Y80` dan `Photos!A1:O80` sebelum/sesudah identik: 29/17 baris termasuk header, header belum bertambah Y/O. Diagnosis berikutnya pada proyek gateway yang benar membuktikan storage masih source T3 sementara gateway sudah T4. Pengguna kini melaporkan telah mengganti storage dan deploy terbaru; belum ada pembacaan setelahnya yang membuktikan finalisasi/foto berhasil. URL gateway di Vercel bertipe Secret/write-only, tidak diubah atau dirotasi. Ikuti verifikasi terbaru di bagian atas handoff, bukan meminta failed doPost lagi: exception yang ditangkap dapat berstatus Completed.


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

## T3: lokasi objek dan GPS petugas (2026-10-09)

Pengguna meminta melanjutkan tahap berikutnya dan mengabaikan pekerjaan izin foto. T3 dikerjakan pada `codex/t3-locations`, turunan dari T2 `9979a49`. T4 dikerjakan setelah pembaruan gateway (lihat status terbaru di atas); T5–T7 belum dikerjakan. Rencana implementasi: [`docs/superpowers/plans/2026-10-09-t3-locations.md`](docs/superpowers/plans/2026-10-09-t3-locations.md).

- Form memerlukan **konfirmasi lokasi objek**: GPS petugas yang dipilih secara eksplisit sebagai objek, pin peta yang dapat digeser, lokasi tersimpan, atau latitude/longitude manual. GPS diambil hanya saat tombol ditekan; izin ditolak/tidak tersedia/timeout tetap memungkinkan pilihan lain. Perubahan lokasi/area membatalkan konfirmasi. Respons GPS lama dibatalkan ketika pengguna mengedit pilihan atau mengganti area.
- GPS petugas menyimpan latitude, longitude, akurasi meter dan waktu perangkat. Objek disimpan terpisah dengan metode dan waktu pemilihan. Pin/koordinat/lokasi tersimpan **tidak mewarisi akurasi GPS petugas**. Metadata sumber lokasi tersimpan ada di snapshotnya. Tidak ada batas akurasi wajib, grid tambang, nilai RL, koordinat site, atau batas area yang dikarang. Pilihan UTM dijelaskan di bawah.
- Leaflet **1.9.4 stable** dimuat hanya di browser. Latar OpenStreetMap adalah konteks umum, memakai atribusi terlihat dan tile standar tanpa prefetch/offline. Belum ada layer batas site yang terverifikasi. Tampilan awal dunia tidak memiliki pin objek; angka nol tetap valid jika dipilih manual.
- `location_json` ditambahkan **setelah `sub_area`**: skema staging `Inspections` 23 → 24 kolom (**X**); skema sederhana 13 → 14. Header/baris lama dipertahankan. Lokasi berversi 1 memakai `EPSG:4326`. SHA-256 lokasi dikonfirmasi sebelum UI memberi sukses; perubahan lokasi dengan ID inspeksi sama ditolak. Retry T2 tanpa lokasi tetap valid dan tidak menulis ulang baris lama.
- Frontend T3 memakai action **`prepareLocatedInspection`**. Gateway T2 menolak action ini sebelum menulis, sehingga rollout yang belum lengkap tidak menghasilkan catatan T3 tanpa lokasi. Action `prepareInspection` tetap melayani T2.
- Tautan **Unduh titik objek (GeoJSON)** mengekspor titik yang dikonfirmasi pada form dengan urutan **[longitude, latitude]**. Ini bukan ekspor riwayat inspeksi T6 dan bukan bukti titik sudah tersimpan server.

### UTM dengan datum/zona yang dipilih — revisi pengguna 10 Oktober WIB

Form mulai dalam mode UTM, datum WGS84; zona dan belahan bumi **kosong** sampai dipilih. Pilih datum, zona, N (utara) / S (selatan), lalu isi Easting/Northing dalam meter dan **Pratinjau → Konfirmasi**. Mode WGS84 latitude/longitude tetap tersedia. GPS/pin/master dapat ditampilkan sebagai UTM; lokasi objek tetap terpisah dari GPS petugas.

| Datum | CRS dan transformasi yang didukung |
| --- | --- |
| WGS84 | Zona 1–60 N/S, EPSG:32601–32660 / 32701–32760; tanpa pergeseran datum |
| DGN95 | CRS UTM Indonesia dalam `config/utm-crs.json`; EPSG:15912, pendekatan DGN95→WGS84 dengan akurasi transformasi 1 m |
| ID74 | CRS UTM Indonesia dalam katalog yang sama; EPSG:1833, pendekatan ID74→WGS84 dengan akurasi transformasi 3 m |

- Cakupan zona/belahan bumi/datum diperiksa sebagai irisan area CRS dengan N/S dan batas latitude UTM −80° hingga 84°. Kombinasi regional yang tidak mempunyai CRS tidak bisa dipilih. SRGI2013/epoch dan grid site belum didukung; parameter survey tidak diasumsikan dari nama tempat.
- Mengubah datum/zona/belahan membatalkan konfirmasi. Untuk **input UTM manual**, pasangan E/N dipertahankan tetapi titik dikosongkan; preview ulang mengartikan input dengan CRS baru. Untuk GPS/pin/master, pilihan baru memproyeksikan titik fisik yang sama; CRS di luar cakupan ditolak. Mengganti mode tampilan saja mempertahankan sumber UTM yang sudah dipreview.
- Snapshot opsional `object.utm` menyimpan angka E/N asli, datum, zona, belahan bumi, kode CRS, operasi transformasi, dan akurasi operasi. WGS84 tetap koordinat utama; gateway menghitung konversi ulang dan menolak snapshot/metadata yang berbeda. Akurasi operasi datum bukan akurasi GPS, bukan RL, dan bukan jaminan survey. Angka tampilan tiga desimal bukan ketelitian milimeter.
- GeoJSON tetap memakai `[longitude, latitude]` WGS84; sumber UTM ada pada `properties.utm`. Checklist/header tidak berubah dari T3, tetap memakai `location_json` di X. Snapshot T3 lama tanpa UTM tetap byte-kompatibel dan dapat di-retry.
- Payload UTM memakai action **`prepareUtmInspection`**, sehingga gateway T3 lama menolak **sebelum write**. Gateway terbaru build **`2026-10-09.6`** memerlukan file tambahan **`projection.js`**. File itu memuat distribusi resmi Proj4js **2.22.0** dengan lisensi MIT; dipin bersama npm lockfile dan diperiksa generator, tidak memakai CDN/runtime fetch. `location.js` tetap diperiksa checkJs; file vendor saja dikecualikan dari pemeriksaan source pihak ketiga.
- Dependency proyeksi ditambahkan karena browser/stdlib tidak menyediakan UTM atau transformasi datum. Definisi/area/parameter dan kontrol diperiksa pada PROJ **9.8.1**, database EPSG **v12.029 (2025-10-02)**. ID74 EPSG:1833 memakai konvensi coordinate-frame; tanda rotasi dibalik untuk `+towgs84` position-vector. Transformasi 2D tidak memakai altitude sebagai RL.

Sumber primer: [API/axis order/transformasi Proj4js](https://proj4js.org/), [UTM PROJ](https://proj.org/en/stable/operations/projections/utm.html), [basis definisi PROJ/EPSG](https://github.com/OSGeo/PROJ/tree/master/data/sql), dan [BIG: datum/epoch/UTM](https://srgi.big.go.id/page/transformasi-koordinat). Untuk operasional, pilih referensi yang sesuai dokumen survey site.

**Bukti lokal revisi UTM:** lima check baru merah karena fungsi belum tersedia, lalu hijau; seluruh **37/37** check dan build produksi lulus. Kontrol independen utara/selatan/DGN95/ID74, batas zona/datum, blank≠nol, payload palsu, checksum/retry, GeoJSON dan penolakan gateway T3 lama diuji. Review ulang selesai setelah perbaikan sumber UTM saat pergantian tampilan, enum belahan bumi tanpa coercion, dan batas N/S yang konsisten.

**Bukti preview UTM, source `3616b33`:** deployment Vercel sukses/preview terbuka. Cloud browser memeriksa zona/belahan awal kosong, penolakan E/N kosong, input dan konfirmasi kontrol WGS84 32N, DGN95 50S dan ID74 50S, serta GeoJSON WGS84 dengan snapshot angka UTM asli/akurasi objek null. Mengganti mode ke WGS84 membatalkan konfirmasi lalu konfirmasi ulang mempertahankan sumber UTM; mengganti datum input manual mempertahankan E/N dan menonaktifkan konfirmasi sampai preview ulang. Klik pin menghasilkan `manual_pin`; mengganti datum DGN95→ID74 mempertahankan koordinat pin fisik dan akurasi objek null. Screenshot pilihan/konfirmasi diperiksa. Pengujian ini tidak menekan Kirim dan tidak menulis inspeksi UTM ke Google; byte file GeoJSON download aktual dan Android tetap belum diuji. Gateway build 2026-10-09.6 masih perlu di-deploy lewat runbook enam file.

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

1. Pakai proyek dan `SPREADSHEET_ID` staging yang sama. Salin **enam** file dari `apps-script/src`: `gateway.js`, `storage.js`, `checklist.js`, **`location.js`**, **`locations.js`**, dan **`projection.js`** ke editor (nama tanpa `.js`). `location.js` dihasilkan `npm run sync:location`; `checklist.js` dihasilkan `npm run sync:checklist`.
2. Script Properties dan manifest tidak perlu diganti. **Deploy → Manage deployments → Edit → New version → Deploy** pada deployment yang sama. Mengganti isi editor saja tidak memperbarui web app. Build health `doGet` yang diharapkan: **`2026-10-09.6`**, schema checklist tetap 2.
3. Gunakan preview branch T3. Uji nama/sub-area manual, titik sintetis, konfirmasi, kirim, retry; periksa `Inspections!X` dan checksum acknowledgment. Master nyata hanya diisi dengan koordinat terverifikasi milik site.
4. Di Android nyata, uji izin GPS ditolak, timeout/tidak tersedia, lalu koordinat manual; uji GPS petugas dan pin objek berbeda. Pengujian GPS/perizinan perangkat belum terbukti oleh pemeriksaan Node.

**Bukti lokal T3:** baseline T2 22/22 lulus; `npm run check` T3 31/31 lulus (termasuk typecheck Next/Apps Script dan drift generator), `npm run build` lulus. Pengujian lokasi mencakup pin/GPS terpisah, batas WGS84/blank vs nol, akurasi pin null, checksum/retry/konflik, migrasi T2, master snapshot dan GeoJSON. Review selesai setelah perbaikan refresh master tanpa kehilangan checklist. Runtime tiruan tidak membuktikan penulisan Google nyata.

**Bukti preview T3, source `aa8b0b9`:** Vercel Ready; PR [#2](https://github.com/fanelix/dailyinspection/pull/2) draft bertumpuk di atas T2. Cloud browser menguji nama/sub-area manual, enam `not_inspected`, penolakan koordinat kosong/lokasi belum dikonfirmasi, preview/konfirmasi koordinat sintetis, perubahan membatalkan konfirmasi serta tautan ekspor, klik pin menghasilkan metode `manual_pin` dengan akurasi null, dan konfirmasi ulang. Refresh master mempertahankan nama/sub-area/semua jawaban. Payload tautan GeoJSON diamati [longitude, latitude]; penangkapan unduhan browser timeout, sehingga file unduhan aktual belum diverifikasi. Screenshot diperiksa.

**Rollout masih menunggu Apps Script:** kiriman T3 ke gateway yang terpasang ditolak dengan pesan layanan lokasi belum diperbarui. Pembacaan sebelum/sesudah pada `Inspections!A1:X80` dan `Photos!A1:N80` identik (28/17 baris terisi termasuk header); tidak ada penulisan T3 pada rentang tersebut. API master juga belum didukung gateway lama. Penyimpanan lokasi Google, daftar master nyata, GPS/izin Android dan drag pin Android belum terbukti. T3 belum dinyatakan memenuhi seluruh acceptance; ikuti runbook enam file di atas, lalu uji ulang.

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
