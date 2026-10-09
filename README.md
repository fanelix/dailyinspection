# dailyinspection

Aplikasi web inspeksi geoteknik harian (HP/tablet Android). Rencana dan keputusan: [`docs/plan.md`](docs/plan.md). Pedoman kerja agent: [`AGENTS.md`](AGENTS.md).

## Keputusan akses: tanpa aktivasi perangkat (2026-10-09)

Atas keputusan pengguna, aktivasi perangkat **dihapus** karena menyusahkan. Ini menggantikan keputusan 8 Oktober ("akses dikelola per perangkat") dan menyimpang dari `docs/plan.md` §3 (Akses tim), §10 (sesi, CSRF, pencabutan perangkat), dan §14 ("Meminta foto inspeksi tanpa izin → ditolak meski ID diketahui"). `docs/plan.md` tetap salinan apa adanya, jadi bagian itu di sana belum diperbarui.

Yang berlaku sekarang:

- Aplikasi **tidak punya login, cookie, atau kode**. Siapa pun yang tahu URL-nya dapat membuat inspeksi dan mengunggah foto.
- Gateway Apps Script tetap tidak bisa dipanggil langsung: server Next menandatangani setiap pesan (HMAC, timestamp, nonce).
- Foto tetap privat (bukan tautan Drive publik). Foto yang sudah ada hanya terbaca lewat **pasangan ID inspeksi + ID foto** yang harus berpasangan; keduanya UUID acak 122 bit yang dibuat browser. ID itu berfungsi seperti kunci: jangan ditampilkan, dicatat, atau dibagikan di tempat umum.

Risiko yang diterima pengguna (sudah disampaikan sebelum keputusan):

- Orang asing yang menemukan URL dapat mengunggah foto sampah ke Drive perusahaan (≤ 2 MB per foto, ≤ 5 foto per inspeksi, tanpa batas jumlah inspeksi), menulis catatan palsu yang tampak sama dengan yang asli, dan membuat antrean di lock gateway sehingga petugas sungguhan tidak bisa mengirim.
- Tidak ada pencabutan akses per perangkat. Nama petugas adalah teks bebas dan tidak terbukti; kolom `device_id` di tab `Inspections` dibiarkan kosong (kolom dipertahankan agar sheet staging yang sudah ada tetap cocok).
- Kebocoran sepasang ID (log, riwayat browser, tangkapan layar) memberi akses baca ke foto itu.

Perlindungan yang masih ada: HMAC gateway, validasi payload, batas 2 MB dan 5 foto per inspeksi, idempotensi (ID sama dengan isi berbeda = 409), teks tidak pernah dievaluasi sebagai rumus Sheets, dan batas body Vercel.

**Belum ada dan perlu keputusan pengguna:** batas laju atau kuota harian. Angkanya bergantung pada kapasitas yang belum ditetapkan (rencana §16), jadi tidak saya karang. Pengaman tanpa friksi yang bisa dipertimbangkan: aturan pembatasan laju di Vercel (Firewall; ingatan saya, belum diverifikasi), dan tidak menyebarkan URL. Alternatif ringan yang pernah ditawarkan dan ditolak: tautan aktivasi sekali ketuk, dan kode tim.

## Status: T1 — bukti integrasi (belum terbukti di Vercel dan Android)

Satu inspeksi + satu foto privat: simpan metadata (Sheets) → unggah foto (Drive) → baca kembali, dengan retry yang tidak menggandakan file. Ada kode, pemeriksaan lokal, dan skrip pembuktian staging. **Acceptance T1 baru terpenuhi setelah `checks/live.mjs` tahap B lulus di staging dan uji Android dilakukan.**

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
| `app/page.tsx` | Form minimal (nama, catatan, satu foto); foto dikompres saat dipilih |
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
- **Belum teruji di Google sungguhan**: body POST ±2,7 MB ke `doPost`, latensi/cold start, seluruh jalur Vercel (route dan `checks/live.mjs` tahap B) dan Android. Kode tanpa aktivasi baru teruji di runtime Apps Script palsu, Chromium headless (UI dan kompresi), dan `live.mjs` terhadap `next start` lokal.
- Scope `drive` (luas) dipakai karena folder induk bukan dibuat oleh aplikasi sehingga `drive.file` tidak cukup.
- Nilai usulan, belum ditetapkan pengguna atau diukur: toleransi jam 5 menit, TTL replay 10 menit, timeout gateway 30 dtk, `maxDuration` 60 dtk, 3 percobaan ulang (jeda 1 dtk, 2 dtk), foto JPEG ≤ 2 MB dan ≤ 5 per inspeksi, sisi panjang 2048 px, kualitas awal 0,8 (rencana §8).
- Kompresi: kualitas turun 0,8 → 0,7 → 0,6 dan penjaga sumber 32 MB adalah **usulan** (lantai kualitas belum ditetapkan). Foto yang tetap > 2 MB ditolak dengan pesan, tidak diunggah diam-diam; dengan foto nyata cabang ini praktis tidak tercapai (derau seragam 2048×2048, kasus terburuk yang dicoba, berakhir 1,91 MiB).
- Hasil kompresi **tidak membawa EXIF** (termasuk GPS dan jam kamera); orientasi sudah dibakar ke piksel. Foto asli di galeri tidak disentuh. Lokasi inspeksi akan diambil terpisah (T3).
- Memori puncak kompresi ≈ resolusi asli yang didekode (12 MP ≈ 48 MB); belum diukur di Android. Bukti kompresi baru dari Chromium headless desktop (orientasi EXIF 1/3/6/8 cocok dengan oracle PIL, PNG transparan → latar putih), bukan dari kamera atau browser Android.
- Foto disimpan langsung di folder root staging, tanpa struktur `YYYY/MM/AREA/INSPECTION_ID`; belum ada tab `Audit` atau peran reviewer/admin.
- Pemindaian linear Sheets dan satu lock skrip cukup untuk dua petugas; evaluasi pindah backend mengikuti rencana §16.
- Nama petugas masih teks bebas karena daftar dua inspector belum ditetapkan.
