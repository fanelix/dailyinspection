# Runbook T7: uji lapangan, backup/restore, rollout dan rollback

**Status: draf, 2026-10-10.** Belum ada rollout Production. Tidak ada merge, promosi, atau perubahan Apps Script/Vercel yang dijalankan oleh tahap ini. Dokumen ini berlaku setelah setiap gerbang di bagian 1 terpenuhi dan dicatat oleh pengguna.

## 1. Gerbang sebelum Production

Keputusan ini milik pengguna. Agent tidak mengisi kolom status dengan asumsi.

| # | Gerbang | Status 2026-10-10 |
|---|---|---|
| G1 | Pemeriksaan manual Sheets T6 (`Inspections!Z`, data lama utuh) dilaporkan lulus | Menunggu pengguna |
| G2 | Uji Android nyata (bagian 3) lulus untuk semua butir kritis | Belum; butuh perangkat dan pengguna |
| G3 | Kapasitas dan batas laju diputuskan (plan §16; README "Batas laju belum ada") | Menunggu angka pengguna |
| G4 | Keputusan merge PR #1–#5 (semua draft, bertumpuk) dan branch Production | Belum diputuskan |
| G5 | Proyek Apps Script, Spreadsheet, folder Drive, dan secret Production dipisah dari staging | Tidak tercatat di handoff |
| G6 | Backup metadata dan foto aktif sebelum rollout (bagian 4) | Belum |
| G7 | Pemilik operasional menerima hasil pilot (plan §13 tahap 7) | Belum |

## 2. Bukti T7 yang sudah ada

Perintah: `PLAYWRIGHT_MODULE=<path modul playwright> node checks/t7-browser.mjs` setelah `npm run build`. Skrip ini **tidak** masuk `npm run check`. Ia memakai Chromium headless nyata dan runtime Apps Script palsu (`checks/fake-apps-script.mjs`).

Hasil terakhir: **semua pemeriksaan lulus** (exit 0).

| Area | Yang dibuktikan | Batas |
|---|---|---|
| Mode pesawat | Simpan untuk dikirim nanti tanpa menulis Sheets; reload saat offline memulihkan antrean; Kirim yang tertunda saat offline menampilkan galat final dan tidak mengubah Sheets; setelah online terkirim tepat sekali, foto stored sekali | Offline diemulasi Playwright, bukan radio perangkat |
| Dua tab (Web Locks) | Tab kedua ditolak dengan "Pengiriman berjalan di tab lain"; hanya satu inspeksi untuk antrean yang sama | Lock nyata di Chromium; belum di Chrome Android |
| Kuota IndexedDB | Batas kuota CDP (`Storage.overrideQuotaForOrigin`) **tidak** memicu galat tulis di Chromium ini, walau `navigator.storage.estimate()` melapor kuota 1 byte. Jalur galat diuji dengan **suntikan** `QuotaExceededError` pada `IDBObjectStore.put`: UI tidak mengklaim tersimpan, tombol "Muat versi tersimpan" muncul, dan simpan berhasil lagi setelah suntikan dilepas | Bukan kuota OS/browser nyata |
| Eviksi IndexedDB | Penghapusan IndexedDB oleh CDP: antrean tidak muncul kembali, tidak ada kiriman otomatis, halaman tidak crash | Bukti batas: data yang dihapus browser tidak bisa dipulihkan aplikasi. Eviksi OS tidak diuji |

Yang **tidak** tercakup oleh bukti ini: Android, Chrome Android, GPS dan izin, kamera, mode pesawat OS, Sheets/Drive/Apps Script nyata, dan volume pilot.

## 3. Uji lapangan Android

Dilakukan oleh pengguna dengan perangkat nyata. Gunakan origin **preview/staging**, bukan Production. Beri nama data uji `Uji lapangan T7 <tanggal>`. Koordinat uji tidak dipakai untuk observasi operasional.

Catat per perangkat: model HP, versi Android, versi Chrome. Jangan catat ID UUID inspeksi atau foto (aturan handoff: pasangan ID adalah kunci akses ke foto).

| No | Skenario | Langkah | Hasil yang harus terlihat | Kritis |
|---|---|---|---|---|
| 1 | Siap offline | Saat online, tekan Siapkan pencatatan offline | Indikator "Siap untuk pencatatan offline" muncul | Ya |
| 2 | Foto kamera dan galeri | Satu foto dari kamera (potret), satu dari galeri; Kirim saat online | Pratinjau tegak; di Sheets dua baris `Photos` berstatus stored; manifest cocok | Ya |
| 3 | Simpan saat pesawat | Aktifkan mode pesawat; isi form; Simpan untuk dikirim nanti | "Kiriman disimpan dalam antrean"; baris Sheets tidak bertambah | Ya |
| 4 | Tutup dan buka Chrome | Masih mode pesawat: tutup Chrome sepenuhnya, buka lagi | Draft "Menunggu kirim" dan kedua foto pulih | Ya |
| 5 | Kirim saat masih offline | Tekan Kirim yang tertunda | Galat final "memakai ID yang sama"; mungkin butuh beberapa detik karena percobaan ulang; Sheets tidak berubah | Ya |
| 6 | Kirim saat online | Matikan pesawat; Kirim yang tertunda | "Inspeksi terkirim"; satu inspeksi `submitted` revisi 2; dua foto stored; menekan lagi tidak menambah baris | Ya |
| 7 | Putus saat unggah | Mulai kirim dengan foto besar; matikan data saat "Mengunggah foto 2 dari 2…" | Tidak ada "terkirim"; nyalakan data, Kirim yang tertunda → satu inspeksi, tanpa duplikat | Ya |
| 8 | Dua tab | Buka dua tab dengan antrean sama; tekan Kirim yang tertunda di keduanya | Satu tab menolak dengan pesan tab lain; satu inspeksi | Ya |
| 9 | Tutup saat unggah | Tutup Chrome saat kiriman berjalan | Tidak ada klaim terkirim; buka lagi → antrean pulih; kirim ulang tanpa duplikat (plan: upload tidak dijanjikan saat app ditutup) | Ya |
| 10 | GPS ditolak | Tolak izin lokasi; pakai koordinat manual | Form tetap dapat dikonfirmasi | Ya |
| 11 | Tata letak | 360 px (HP) dan 768–1024 px (tablet), portrait dan landscape | Tidak ada scroll horizontal; tombol sentuh cukup besar | Ya |
| 12 | Foto khusus | Foto ≥ 48 MP; foto HEIC | Pesan jelas bila ditolak; tab tidak mati | Ya |
| 13 | Penyimpanan persisten | Catat apakah pesan "Penyimpanan persisten belum diberikan browser" muncul; cek draft masih ada setelah satu hari | Dicatat apa adanya | Catatan |
| 14 | Eviksi (data uji saja) | Hapus data situs origin uji saat ada draft uji | Draft hilang; tidak ada klaim terkirim; Sheets tidak berubah | Catatan (merusak data uji) |
| 15 | Peta tanpa jaringan | Mode pesawat tanpa basemap | Koordinat manual dan lokasi tersimpan tetap bisa dipakai | Ya |

Kolom laporan: nomor, lulus/gagal/catatan, perangkat dan versi, jumlah baris `Inspections` dan `Photos` sebelum dan sesudah, dan tangkapan layar tanpa ID.

**Volume pilot (plan §16):** rumus kapasitas `inspeksi/hari × foto/inspeksi × ukuran rata-rata foto`. Angka inspeksi per hari dan ukuran foto nyata harus dari pengguna. Agent tidak mengarang angka. Ukur waktu kirim per inspeksi di Android selama pilot.

## 4. Backup dan restore

| Komponen | Lokasi | Cara cadangkan | Catatan |
|---|---|---|---|
| Metadata | Spreadsheet staging/production (`Inspections`, `Photos`, tab lain) | Salinan berkala (File → Make a copy); frekuensi diputuskan pengguna | Salinan di Drive yang sama bukan backup terhadap penghapusan atau kehilangan akses akun (plan §15) |
| Foto | Folder Drive `PHOTO_ROOT_FOLDER_ID` | Keputusan pengguna: Shared Drive, Takeout, atau salinan independen | Sheets hanya menyimpan file ID. Foto tidak bisa dipulihkan dari Sheets |
| Konfigurasi | Script Properties (`GATEWAY_HMAC_SECRET`, `SPREADSHEET_ID`, `PHOTO_ROOT_FOLDER_ID`) dan env Vercel | Simpan di password manager perusahaan | Jangan masuk git, log, atau `NEXT_PUBLIC_*` |
| Kode | Git | Tag pada setiap commit yang dideploy | Rollback memerlukan pasangan frontend dan gateway yang cocok |

**Uji restore (belum dijalankan; memerlukan izin pengguna karena membuat salinan di Drive):**
1. Salin Spreadsheet terbaru ke file uji baru.
2. Buat proyek Apps Script uji (bukan Production) dari enam file pada tag yang sama. `SPREADSHEET_ID` menunjuk salinan. `PHOTO_ROOT_FOLDER_ID` menunjuk folder yang memuat file foto yang direferensikan.
3. Deploy, lalu jalankan Tahap A (`GATEWAY_URL=<url uji> node checks/live.mjs`). Build harus cocok dengan tag.
4. Buka riwayat staging uji. Cocokkan jumlah inspeksi dan checksum manifest dengan sumber.
5. Baca dua foto lewat detail riwayat; byte dan SHA-256 harus sama dengan manifest.
6. Hapus proyek uji dan salinan setelah pengguna menyetujui.

Lulus bila satu inspeksi dengan dua foto terbaca kembali dengan checksum yang sama, dan file sumber tidak berubah.

## 5. Rollback

Aturan dasar: rollback mengembalikan **pasangan** frontend dan gateway yang kompatibel. Yang terbukti dari kode, bukan dari uji Google:

- **Frontend T5 dengan gateway T6: kompatibel.** Semua aksi yang dipakai frontend T5 (`prepareInspection`, `prepareLocatedInspection`, `prepareUtmInspection`, `prepareCompleteInspection`, `uploadPhoto`, `getPhoto`, `finalizeInspection`, `listLocations`) ada di allowlist gateway T6. Header Inspections 25 kolom diterima gateway T6. **Belum diuji di Google.**
- **Gateway T5 dengan header 26 kolom: tidak kompatibel.** `sheetLayout_` di gateway T5 hanya menerima panjang 17–25 kolom untuk Inspections. Setelah kolom `review_json` (Z) ada, gateway T5 menolak semua baca dan tulis Inspections dengan `Header Inspections tidak sesuai`. Ini gagal-tertutup (data tidak rusak), tetapi layanan berhenti. Menghapus kolom Z untuk memulihkan gateway lama tidak disarankan karena menghapus riwayat review.
- **Frontend T1 (kode yang masih ada di Production menurut handoff) tidak kompatibel dengan gateway T2 ke atas.** Payload T1 tidak punya versi atau checklist dan ditolak. Rollback ke T1 bukan pilihan.

Prosedur rollback (dipakai setelah rollout):
1. **Frontend:** Vercel → Deployments → pilih deployment terakhir yang pasangan gateway-nya masih kompatibel → Promote/Instant Rollback. Pastikan halaman deployment menunjukkan commit yang benar.
2. **Gateway:** Apps Script → Deploy → Manage deployments → ✏ → pilih Version yang kompatibel → Deploy. Mengganti kode di editor **tidak** mengubah web app. Verifikasi dengan Tahap A.
3. **Data:** tidak ada perintah destruktif. Kolom tambahan dibiarkan.
4. Bila gateway tidak bisa menulis, antrean di perangkat tetap utuh karena attempt dan ID tersimpan lokal. Kiriman tertahan sampai pasangan pulih. Tidak ada salinan ID baru.

Drill rollback di staging (frontend T6 → T5, lalu kembali) **belum dijalankan**. Drill memerlukan pengguna men-deploy versi Apps Script dan Vercel.

## 6. Rollout Production (hanya setelah gerbang G1–G7)

1. Beri tag pada commit yang dirilis. Catat commit frontend, build gateway, dan schema version.
2. Buat sumber daya Production (G5): Spreadsheet, folder Drive, proyek Apps Script, dan secret baru. Jangan pakai ulang secret staging.
3. Deploy gateway: enam file dari tag (`gateway`, `storage`, `checklist`, `location`, `locations`, `projection`). Deploy → Manage deployments → Edit → New version → Deploy.
4. Tahap A: `GATEWAY_URL=<url prod> node checks/live.mjs`. Build harus cocok. Pesan tanpa tanda tangan harus ditolak `UNAUTHORIZED`.
5. Vercel Production: `GATEWAY_URL` dan `GATEWAY_HMAC_SECRET`. Branch Production sesuai keputusan G4. Pastikan sumber deployment adalah tag.
6. Smoke test dengan data berlabel jelas. Membuat data uji di Production adalah tindakan keluar yang memerlukan persetujuan pengguna pada saat itu.
7. Pilot 3–5 hari operasional. Pemilik menilai hasil sebelum dianggap selesai.

## 7. Keputusan terbuka untuk pengguna

- Angka kapasitas dan batas laju (plan §16; README).
- Frekuensi dan pemilik backup; lokasi salinan foto yang independen.
- Branch Production dan urutan merge PR #1–#5.
- Apakah Production memakai Apps Script dan Spreadsheet baru (disarankan) atau yang sudah ada.
- Izin menjalankan uji restore dan drill rollback di staging.
- Keputusan akses tanpa aktivasi perangkat (2026-10-09) tetap berlaku; risikonya diterima pengguna.
