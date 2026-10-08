# dailyinspection

Aplikasi web inspeksi geoteknik harian (HP/tablet Android). Rencana dan keputusan: [`docs/plan.md`](docs/plan.md). Pedoman kerja agent: [`AGENTS.md`](AGENTS.md).

## Status: T1 — bukti integrasi (belum terbukti di staging)

Satu inspeksi + satu foto privat: aktivasi perangkat → simpan metadata (Sheets) → unggah foto (Drive) → baca kembali, dengan retry yang tidak menggandakan file. Ada kode, pemeriksaan lokal, dan skrip pembuktian staging. **Acceptance T1 baru terpenuhi setelah `checks/live.mjs` lulus di staging dan uji Android dilakukan.**

Belum ada (task berikutnya): checklist (T2), lokasi/peta (T3), kompresi foto dan finalisasi (T4), draft offline (T5), riwayat/review/ekspor (T6).

## Perintah

```
npm ci
npm run check    # typecheck Next + Apps Script, lalu checks/gateway.check.mjs (tanpa jaringan)
npm run build
npm run dev      # perlu .env.local (lihat .env.example) dan gateway sungguhan
```

`npm run check` memakai runtime Apps Script palsu (`checks/fake-apps-script.mjs`). Itu menguji logika kita, bukan Google.

## Struktur

| Path | Isi |
|---|---|
| `app/page.tsx` | Aktivasi + form minimal (nama, catatan, satu foto JPEG) |
| `app/api/*` | `activate`, `session`, `inspections` (prepare), `inspections/[id]/photos/[photoId]` (PUT unggah, GET baca) |
| `lib/gateway.ts` | Klien server ke gateway: pesan bertanda HMAC, redirect Apps Script, timeout = hasil belum diketahui |
| `lib/auth.ts` | Cookie sesi perangkat (HttpOnly, SameSite=Lax) dan cek origin |
| `lib/photos.ts` | Batas ukuran foto dan SHA-256 (dipakai browser dan server) |
| `apps-script/src/gateway.js` | `doGet`/`doPost`: verifikasi tanda tangan, timestamp, nonce; allowlist action; registri perangkat; fungsi admin |
| `apps-script/src/storage.js` | Sheets + Drive: reservasi ID file, unggah idempoten, pemulihan |
| `checks/` | `gateway.check.mjs` (lokal), `live.mjs` (staging), fake runtime |

## Memasang staging (untuk membuktikan T1)

Gunakan folder Drive dan Spreadsheet **staging** yang terpisah dari produksi.

1. **Siapkan** satu folder Drive (catat ID-nya) dan satu Spreadsheet kosong (catat ID-nya) di akun perusahaan.
2. **Apps Script**: buat proyek standalone. Salin `apps-script/appsscript.json` (Project Settings → tampilkan manifest) dan isi `apps-script/src/gateway.js`, `storage.js` ke file bernama `gateway` dan `storage`. (`clasp` juga bisa, belum diuji di sesi ini.) Manifest mengaktifkan Drive advanced service v3 dan meminta scope `spreadsheets` + `drive`.
3. **Script Properties**: `GATEWAY_HMAC_SECRET` (acak ≥ 32 karakter, mis. `openssl rand -hex 32`), `SPREADSHEET_ID`, `PHOTO_ROOT_FOLDER_ID`.
4. **Kode aktivasi**: jalankan `adminCreateActivationCode('Nama perangkat')` dari editor (setujui otorisasi pertama), baca kode di Execution log. Kode sekali pakai, berlaku 24 jam.
5. **Deploy** → Web app: *Execute as: Me*, *Who has access: Anyone*. Salin URL `/exec`. Kebijakan Workspace bisa melarang "Anyone"; bila ya, itu temuan T1 yang harus diputuskan admin, bukan dilonggarkan diam-diam.
6. **Vercel** (project staging; paket sesuai penggunaan perusahaan): isi `GATEWAY_URL`, `GATEWAY_HMAC_SECRET` (sama dengan Script Property), `SESSION_SECRET` (berbeda, ≥ 32 karakter). Deploy preview.
7. **Uji otomatis** dengan kode aktivasi baru:
   ```
   BASE_URL=https://<staging> ACTIVATION_CODE=XXXXX-XXXXX-XXXXX-XXXXX \
   GATEWAY_URL=<url /exec> node checks/live.mjs
   ```
   Opsional: `ACTIVATION_CODE_2` (uji lintas perangkat), `PHOTO_PATH` (JPEG ≤ 2 MB).
8. **Periksa manual** (tidak bisa dibuktikan skrip): tepat satu file foto di folder staging, satu baris `Photos` berstatus `stored`, foto tidak terbuka lewat tautan Drive tanpa izin.
9. **Uji Android**: buka URL staging, aktivasi, isi form, pilih JPEG ≤ 2 MB, Kirim. Kompresi otomatis belum ada, jadi foto kamera beresolusi penuh akan ditolak dengan pesan jelas.

Mencabut perangkat: jalankan `adminListDevices()` lalu `adminRevokeDevice('<deviceId>')`; penolakan berlaku pada operasi data berikutnya.

## Yang belum terbukti dan asumsi (T1)

- **Belum diuji pada Google sungguhan**: `Drive.Files.generateIds` + `create` dengan ID cadangan (tanda tangan dicocokkan dengan typings dan dokumen discovery REST, perilaku belum), body POST ±2,7 MB ke `doPost`, format sel Sheets, latensi/cold start, kebijakan akses deployment.
- Scope `drive` (luas) dipakai karena folder induk bukan dibuat oleh aplikasi sehingga `drive.file` tidak cukup.
- Kode aktivasi memakai `Utilities.getUuid()` sebagai sumber acak (80 bit); Google tidak mendokumentasikannya sebagai CSPRNG. Tidak ada pembatasan laju percobaan aktivasi.
- Nilai usulan, belum ditetapkan pengguna atau diukur: sesi 30 hari, kode aktivasi 24 jam, toleransi jam 5 menit, TTL replay 10 menit, timeout gateway 30 dtk, `maxDuration` 60 dtk, 3 percobaan ulang (jeda 1 dtk, 2 dtk), foto JPEG ≤ 2 MB dan ≤ 5 per inspeksi (rencana §8).
- Foto disimpan langsung di folder root staging, tanpa struktur `YYYY/MM/AREA/INSPECTION_ID`; belum ada tab `Audit`, peran reviewer/admin, atau waktu aktivitas terakhir perangkat.
- Pemindaian linear Sheets dan satu lock skrip cukup untuk dua petugas; evaluasi pindah backend mengikuti rencana §16.
- Nama petugas masih teks bebas karena daftar dua inspector belum ditetapkan.
