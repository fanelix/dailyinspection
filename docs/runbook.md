# Runbook T7: uji lapangan, backup/restore, rollout dan rollback

**Status: draf, 2026-10-10.** Belum ada rollout Production. Tidak ada merge, promosi, atau perubahan Apps Script/Vercel yang dijalankan oleh tahap ini. Dokumen ini berlaku setelah setiap gerbang di bagian 1 terpenuhi dan dicatat oleh pengguna.

## 1. Gerbang sebelum Production

Keputusan ini milik pengguna. Agent tidak mengisi kolom status dengan asumsi.

| # | Gerbang | Status 2026-10-10 |
|---|---|---|
| G1 | Pemeriksaan manual Sheets T6 (`Inspections!Z`, data lama utuh) dilaporkan lulus | **Lulus menurut laporan pengguna** (2026-10-10) |
| G2 | Uji Android nyata (bagian 3) lulus untuk semua butir kritis | **Lulus menurut laporan pengguna** (2026-10-10); lihat "Hasil uji Android" di bagian 3 |
| G3 | Kapasitas dan batas laju diputuskan (plan §16; README "Batas laju belum ada") | **Kapasitas diputuskan: rata-rata 3 inspeksi per hari.** Batas laju belum diputuskan |
| G4 | Keputusan merge PR #1–#5 (semua draft, bertumpuk) dan branch Production | **Diputuskan** (didelegasikan ke agent): satu PR rilis `claude/zen-heisenberg-kcgjpu` → `main`, merge commit, Vercel Production Branch = `main` |
| G5 | Sumber daya Production (Apps Script, Spreadsheet, folder Drive, secret) | **Diputuskan: pakai yang sudah ada** (staging menjadi Production). Lihat akibatnya di bagian 1a |
| G6 | Backup metadata dan foto aktif sebelum rollout (bagian 4) | **Metadata: selesai** 2026-10-10. Salinan Spreadsheet "BACKUP 2026-10-10 sebelum Production" berisi Inspections 31 / Photos 20 baris, identik dengan sumber, di akun pribadi pengguna. **Foto: belum dicadangkan** |
| G7 | Pemilik operasional menerima hasil pilot (plan §13 tahap 7); pilot berjalan setelah rollout | Belum |

## 1a. Keputusan 2026-10-10 dan akibatnya

**Kapasitas (G3).** Rata-rata 3 inspeksi per hari.
- Foto Android nyata yang tercatat berukuran 632 KB.
- Bila 1–3 foto per inspeksi: kira-kira 2–6 MB per hari, atau 0,7–2 GB per tahun.
- Batas atas (5 foto × 2 MB): 30 MB per hari.
- Sheets bertambah sekitar 1.100 baris per tahun.
- Setiap inspeksi memanggil gateway untuk prepare, satu kali per foto, dan finalisasi. Volume ini kecil. Kuota Apps Script belum diukur.
- Batas laju masih terbuka. Usulan, bukan keputusan: batas harian di gateway, misalnya 30 inspeksi per hari (10× rata-rata). Ini butuh perubahan dan deploy Apps Script, jadi hanya dikerjakan bila pengguna meminta.

**Branch (G4).** Satu PR rilis dari `claude/zen-heisenberg-kcgjpu` ke `main`.
- Menurut handoff, Vercel Production melacak `claude/eager-carson-bqb25q`, yaitu base PR #1. Merge tumpukan bertahap akan mengirim versi antara (T2, T3, dan seterusnya) ke Production satu per satu.
- Satu PR ke `main` memberi satu titik peralihan, dan `main` menjadi branch stabil (plan §15).
- Setelah merge, PR #1–#5 ditutup sebagai *superseded*; commit-nya sudah ada di `main`.

**Sumber daya (G5): pakai yang ada.** Akibatnya:
1. **Tidak ada lagi staging terpisah.** Preview Vercel dan uji berikutnya menulis ke Spreadsheet dan folder yang sama dengan data Production. Uji harus diberi label jelas.
2. **Data uji lama tetap tampil di riwayat.** Contohnya smoke test, baris uji T1–T6, dan baris `#ERROR!`. Pembersihan memerlukan keputusan pengguna. Agent tidak menghapus.
3. **Izin foto: `anyone` sebagai writer.** Diperiksa 2026-10-10 (baca saja) pada foto Android terbaru. Siapa pun yang memegang tautan file dapat melihat dan mengubahnya. Aplikasi tidak membocorkan ID Drive. **Keputusan pengguna 2026-10-10: izin dibiarkan apa adanya.** Risikonya diterima pengguna.
4. **Rotasi `GATEWAY_HMAC_SECRET` disarankan.** Handoff mencatat nilainya sempat tampil di log sesi sebelumnya. Rotasi berarti mengganti Script Property lalu env Vercel (Production dan Preview) dengan nilai yang sama. Lakukan berurutan, karena antara dua langkah itu kiriman gagal `UNAUTHORIZED`. Antrean di perangkat tetap aman dan bisa dikirim ulang.
5. **Gateway sudah build `2026-10-10.2`.** Rollout tidak memerlukan perubahan Apps Script.

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

### Hasil uji Android — 2026-10-10

**Laporan pengguna:** skenario 1–15 berjalan sesuai rencana. Perangkat Oppo Find X8, Android dan Chrome versi terbaru (nomor versi tidak dicatat). URL preview T6: `https://dailyinspection-git-codex-t6-history-fanelixs-projects.vercel.app/`. Pesan "Penyimpanan persisten belum diberikan browser" muncul (skenario 13).

**Diperiksa agent di Sheets staging (baca saja):** `Inspections` 30 → 31 dan `Photos` 19 → 20 baris termasuk header. Isi baris baru:
- satu inspeksi `submitted` revisi 2;
- GPS petugas Android tercatat (akurasi sekitar 12,7 m);
- lokasi objek terkonfirmasi beserta UTM WGS84 50S;
- satu temuan dengan satu foto 632 KB berstatus `stored`, checksum sama dengan manifest;
- prepare sampai finalisasi sekitar 15 detik;
- tanpa baris ganda, dan baris lama utuh.

**Batas bukti:**
- Sheets hanya mengonfirmasi **satu** kiriman Android end-to-end.
- Skenario 2 (dua foto) dan skenario 6–9 tidak bisa dibedakan dari satu record itu. Skenario 3–5, 13, dan 14 memang tidak menulis ke Sheets.
- Pengguna memilih menerima laporannya apa adanya, bukan mengulang skenario yang meninggalkan jejak.
- Record ini memakai nama dan GPS nyata, bukan label uji. Statusnya (observasi nyata atau uji) belum ditetapkan, jadi jangan dihapus tanpa keputusan pengguna.

**Penyimpanan persisten tidak diberikan.** Ini bukan galat. Akibatnya browser dapat menghapus draft saat penyimpanan perangkat penuh atau data situs dibersihkan. Aturan operasional: kirim antrean sebelum meninggalkan perangkat, dan jangan bersihkan data situs saat masih ada draft.

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

## 6. Rollout Production (memakai sumber daya yang ada, G5)

1. **Backup (G6).** Salin Spreadsheet (File → Make a copy) dan catat folder foto. Ini titik pulih data sebelum Production.
2. **Rotasi secret** (bagian 1a butir 4), bila pengguna setuju.
3. **Merge PR rilis ke `main`** atas perintah pengguna. Beri tag pada commit merge.
4. **Vercel:** Settings → Environments → Production → Branch Tracking = `main`. Pastikan env Production `GATEWAY_URL` menunjuk gateway yang ada. Pastikan halaman deployment menampilkan commit merge.
5. **Smoke test.** Buka domain Production, kirim satu inspeksi berlabel `Uji produksi <tanggal>`. Sheets harus bertambah tepat satu inspeksi, dan foto `stored` dengan checksum sama dengan manifest.
6. **Pilot 3–5 hari** (G7). Pemilik menilai hasil sebelum dianggap selesai.

**Status rollout 2026-10-10:**
- Langkah 1 (backup metadata) selesai.
- Langkah 2 (rotasi secret) belum diputuskan.
- Langkah 3: PR #6 di-merge (`40ff92c`). Tag `v2026.10.10` belum ada di GitHub, karena push tag dari sesi agent terputus; pengguna membuatnya lewat halaman Releases.
- Langkah 4: deployment `main` `40ff92c` dipromosikan pengguna dari "Production Staged" ke Production. Halaman riwayat T6 tampil di domain Production.
- Langkah 5: **smoke test lulus.** Kiriman "Uji produksi 2026-10-10" (Sedimen Sump) dibaca agent di Sheets: `Inspections` 31 → 32, `Photos` 20 → 21, `submitted` revisi 2, satu foto 622 KB `stored` dengan checksum sama dengan manifest, tanpa duplikat, sekitar 13 detik dari prepare sampai finalisasi.
- Langkah 6: pilot (G7) belum.

Promosi Production di project ini manual: deployment dari `main` berstatus "Production Staged" sampai dipromosikan.

**Rollback setelah rollout.** Kode Production yang lama (T1) tidak kompatibel dengan gateway sekarang (bagian 5). Jadi target rollback adalah deployment rilis yang sudah teruji:
- Vercel Instant Rollback ke deployment Production sebelumnya dari rilis ini; atau
- promosikan deployment preview T6 yang sudah diuji di Android (Promote to Production), bila tersedia di paket Vercel.

Gateway tidak di-rollback (bagian 5).

## 7. Keputusan terbuka untuk pengguna

- Batas laju (usulan di bagian 1a).
- Pencadangan foto (G6 baru mencakup metadata). Salinan metadata berada di akun pribadi pengguna; pastikan sesuai kebijakan perusahaan.
- Rotasi `GATEWAY_HMAC_SECRET` sebelum Production.
- Status data uji lama dan record Android "Alfan / Pit C" (observasi nyata atau uji).
- Pengaturan Vercel Production Branch = `main` (PR rilis #6 di-merge atas perintah pengguna 2026-10-10).
- Frekuensi dan pemilik backup, serta lokasi salinan foto yang independen.
- Keputusan akses tanpa aktivasi perangkat (2026-10-09) tetap berlaku; risikonya diterima pengguna.
