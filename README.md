# dailyinspection

Aplikasi web inspeksi geoteknik harian (HP/tablet Android). Rencana dan keputusan: [`docs/plan.md`](docs/plan.md). Pedoman kerja agent: [`AGENTS.md`](AGENTS.md).

## Status: T1 — bukti integrasi (belum terbukti di staging)

Satu inspeksi + satu foto privat: aktivasi perangkat → simpan metadata (Sheets) → unggah foto (Drive) → baca kembali, dengan retry yang tidak menggandakan file. Ada kode, pemeriksaan lokal, dan skrip pembuktian staging. **Acceptance T1 baru terpenuhi setelah `checks/live.mjs` lulus di staging dan uji Android dilakukan.**

Kompresi foto (orientasi, batas ukuran) **ditarik maju dari T4 atas keputusan pengguna**, agar uji Android memakai foto kamera asli. `docs/plan.md` tetap salinan apa adanya, jadi urutan task di sana belum diperbarui.

Belum ada (task berikutnya): checklist (T2), lokasi/peta (T3), finalisasi (T4), draft offline (T5), riwayat/review/ekspor (T6).

## Perintah

```
npm ci
npm run check    # typecheck Next + Apps Script, lalu checks/gateway.check.mjs dan checks/photos.check.mjs (tanpa jaringan)
npm run build
npm run dev      # perlu .env.local (lihat .env.example) dan gateway sungguhan
```

`npm run check` memakai runtime Apps Script palsu (`checks/fake-apps-script.mjs`). Itu menguji logika kita, bukan Google.

## Struktur

| Path | Isi |
|---|---|
| `app/page.tsx` | Aktivasi + form minimal (nama, catatan, satu foto); foto dikompres saat dipilih |
| `app/api/*` | `activate`, `session`, `inspections` (prepare), `inspections/[id]/photos/[photoId]` (PUT unggah, GET baca) |
| `lib/gateway.ts` | Klien server ke gateway: pesan bertanda HMAC, redirect Apps Script, timeout = hasil belum diketahui |
| `lib/auth.ts` | Cookie sesi perangkat (HttpOnly, SameSite=Lax) dan cek origin |
| `lib/photos.ts` | Batas ukuran, kompresi native (`createImageBitmap` + canvas; orientasi EXIF dibakar ke piksel), SHA-256 (dipakai browser dan server) |
| `apps-script/src/gateway.js` | `doGet`/`doPost`: verifikasi tanda tangan, timestamp, nonce; allowlist action; registri perangkat; fungsi admin |
| `apps-script/src/storage.js` | Sheets + Drive: reservasi ID file, unggah idempoten, pemulihan |
| `checks/` | `gateway.check.mjs` dan `photos.check.mjs` (lokal), `live.mjs` (staging), fake runtime |

## Memasang staging (untuk membuktikan T1)

Gunakan folder Drive dan Spreadsheet **staging** yang terpisah dari produksi.

1. **Siapkan** satu folder Drive (catat ID-nya) dan satu Spreadsheet kosong (catat ID-nya) di akun perusahaan.
2. **Apps Script**: buat proyek standalone. Salin `apps-script/appsscript.json` (Project Settings → tampilkan manifest) dan isi `apps-script/src/gateway.js`, `storage.js` ke file bernama `gateway` dan `storage`. (`clasp` juga bisa, belum diuji di sesi ini.) Manifest mengaktifkan Drive advanced service v3 dan meminta scope `spreadsheets` + `drive`.
3. **Script Properties**: `GATEWAY_HMAC_SECRET` (acak ≥ 32 karakter, mis. `openssl rand -hex 32`), `SPREADSHEET_ID`, `PHOTO_ROOT_FOLDER_ID`.
4. **Kode aktivasi**: di editor pilih fungsi `adminCreateActivationCode` pada dropdown lalu klik **Run** (setujui otorisasi pertama), dan baca kode di *Execution log*. Tombol Run tidak bisa memberi argumen, jadi nama perangkat otomatis berisi waktu penerbitan. Kode sekali pakai, berlaku 24 jam; satu kode per perangkat.
5. **Deploy** → Web app: *Execute as: Me*, *Who has access: Anyone*. Salin URL `/exec`. Kebijakan Workspace bisa melarang "Anyone"; bila ya, itu temuan T1 yang harus diputuskan admin, bukan dilonggarkan diam-diam.
   **Tahap A, uji Apps Script saja (belum perlu Vercel).** Butuh Node 20+, tanpa `npm install`:
   ```
   GATEWAY_URL=<url /exec> node checks/live.mjs
   ```
   Harus keluar 2 baris `LULUS` (gateway menjawab JSON, dan menolak pesan tanpa tanda tangan). URL `/exec` bukan rahasia, jadi boleh dibagikan untuk dicek dari luar jaringan perusahaan.
   **Tahap A+, uji Drive dan Sheets dari editor (tanpa Vercel, tanpa terminal).** Tempel `storage.js` terbaru ke editor, pilih fungsi `adminSelfTest`, klik **Run**, dan baca *Execution log*. Semua baris harus `LULUS`, diakhiri `SELF-TEST LULUS`. Fungsi ini memakai kode storage yang sama dengan jalur produksi dan meninggalkan 1 baris di tiap tab serta 1 file yang dibuang ke tempat sampah. Fungsi yang dijalankan dari editor memakai kode terbaru tanpa deploy ulang; sebelum Tahap B buat versi baru deployment (Deploy → Manage deployments → ✏ → New version) supaya web app memakai kode yang sama.
6. **Vercel** (project staging; paket sesuai penggunaan perusahaan): isi `GATEWAY_URL`, `GATEWAY_HMAC_SECRET` (sama dengan Script Property), `SESSION_SECRET` (berbeda, ≥ 32 karakter). Deploy.
   Awas **Deployment Protection**: URL preview Vercel biasanya dikunci login Vercel (ingatan saya, belum saya verifikasi; Vercel tidak terjangkau dari sandbox). Telepon dan skrip akan melihat halaman login, bukan aplikasi. Pakai domain production dari project staging khusus ini, atau matikan proteksi untuk project ini saja, sesuai keputusan Anda.
7. **Tahap B, seluruh alur**, dengan kode aktivasi baru (sekali pakai):
   ```
   BASE_URL=https://<staging> ACTIVATION_CODE=XXXXX-XXXXX-XXXXX-XXXXX \
   GATEWAY_URL=<url /exec> node checks/live.mjs
   ```
   Opsional: `ACTIVATION_CODE_2` (uji lintas perangkat), `PHOTO_PATH` (JPEG ≤ 2 MB; skrip ini mengirim byte apa adanya, tanpa kompresi). Di PowerShell: `$env:BASE_URL="..."; $env:ACTIVATION_CODE="..."; $env:GATEWAY_URL="..."; node checks/live.mjs`.
   Jika gagal: baris `INFO` di bawah `GAGAL` menyebut penyebab umum (halaman login Vercel, `GATEWAY_URL`/`GATEWAY_HMAC_SECRET` tidak cocok, kode aktivasi sudah terpakai atau lewat 24 jam).
8. **Periksa manual** (tidak bisa dibuktikan skrip): tepat satu file foto di folder staging, satu baris `Photos` berstatus `stored`, foto tidak terbuka lewat tautan Drive tanpa izin.
9. **Uji Android**: buka URL staging, aktivasi, isi form, lalu pilih foto dari kamera dan dari galeri, Kirim. Periksa di perangkat nyata:
   - foto **potret** tampil tegak (pratinjau, hasil baca-kembali, dan file di Drive);
   - waktu "Menyiapkan foto…" dan apakah form tetap responsif;
   - foto beresolusi sangat tinggi (≥ 48 MP) tidak membuat tab mati; bila gagal harus muncul pesan, bukan crash;
   - foto HEIC/format lain yang tidak bisa didekode perangkat ditolak dengan pesan jelas.

Mencabut perangkat: jalankan `adminListDevices` (Run) untuk melihat `deviceId`, lalu tambahkan fungsi sementara di editor, mis. `function cabut() { adminRevokeDevice('<deviceId>'); }`, dan jalankan `cabut`. Penolakan berlaku pada operasi data berikutnya.

## Yang belum terbukti dan asumsi (T1)

- **Belum diuji pada Google sungguhan**: `Drive.Files.generateIds` + `create` dengan ID cadangan (tanda tangan dicocokkan dengan typings dan dokumen discovery REST, perilaku belum), body POST ±2,7 MB ke `doPost`, format sel Sheets, latensi/cold start, kebijakan akses deployment.
- Scope `drive` (luas) dipakai karena folder induk bukan dibuat oleh aplikasi sehingga `drive.file` tidak cukup.
- Kode aktivasi memakai `Utilities.getUuid()` sebagai sumber acak (80 bit); Google tidak mendokumentasikannya sebagai CSPRNG. Tidak ada pembatasan laju percobaan aktivasi.
- Nilai usulan, belum ditetapkan pengguna atau diukur: sesi 30 hari, kode aktivasi 24 jam, toleransi jam 5 menit, TTL replay 10 menit, timeout gateway 30 dtk, `maxDuration` 60 dtk, 3 percobaan ulang (jeda 1 dtk, 2 dtk), foto JPEG ≤ 2 MB dan ≤ 5 per inspeksi, sisi panjang 2048 px, kualitas awal 0,8 (rencana §8).
- Kompresi: kualitas turun 0,8 → 0,7 → 0,6 dan penjaga sumber 32 MB adalah **usulan** (lantai kualitas belum ditetapkan). Foto yang tetap > 2 MB ditolak dengan pesan, tidak diunggah diam-diam; dengan foto nyata cabang ini praktis tidak tercapai (derau seragam 2048×2048, kasus terburuk yang dicoba, berakhir 1,91 MiB).
- Hasil kompresi **tidak membawa EXIF** (termasuk GPS dan jam kamera); orientasi sudah dibakar ke piksel. Foto asli di galeri tidak disentuh. Lokasi inspeksi akan diambil terpisah (T3).
- Memori puncak kompresi ≈ resolusi asli yang didekode (12 MP ≈ 48 MB); belum diukur di Android. Bukti kompresi baru dari Chromium headless desktop (orientasi EXIF 1/3/6/8 cocok dengan oracle PIL, PNG transparan → latar putih), bukan dari kamera atau browser Android.
- Foto disimpan langsung di folder root staging, tanpa struktur `YYYY/MM/AREA/INSPECTION_ID`; belum ada tab `Audit`, peran reviewer/admin, atau waktu aktivitas terakhir perangkat.
- Pemindaian linear Sheets dan satu lock skrip cukup untuk dua petugas; evaluasi pindah backend mengikuti rencana §16.
- Nama petugas masih teks bebas karena daftar dua inspector belum ditetapkan.
