@AGENTS.md

# dailyinspection

Rencana: `docs/plan.md` (v1.1). Kerjakan hanya task yang ditunjuk (T0–T7, §13). Jangan lanjut ke task berikutnya bila acceptance criteria belum terpenuhi.

Baca `docs/handoff.md` lebih dulu. T0/T1 ada di `claude/eager-carson-bqb25q`; T2 di `codex/t2-checklists`; T3 di `codex/t3-locations` (turunan T2 `9979a49`). Branch staging tidak diubah; `main` masih kosong.

Status terbaru 2026-10-10: pekerjaan sampai T5 di `codex/t5-drafts`, turunan T4 `ae34c68`, PR #4 draft, source produk `495b33f`, preview terakhir Ready. Draft/byte foto/UTM mentah tersimpan IndexedDB; antrean immutable foreground memakai Web Locks dan CAS dua tab; shell/aset/template/master tujuh area disiapkan untuk pencatatan offline. Pemeriksaan terakhir source produk: 65/65 checks, typecheck dan build lulus; review independen diperbaiki. Native reload dua foto/keterangan/UTM parsial dan terkonfirmasi/tautan temuan/antrean setelah galat, konflik dua tab dan Muat versi tersimpan serta indikator offline siap terbukti. Proyek gateway aktif yang benar kini telah ditemukan: gateway T4 build `2026-10-10.1`, tetapi storage masih persis T3 tanpa `prepareCompleteInspection`; ini menjelaskan `RETRYABLE_ERROR` sebelum write. Pengguna pada 10 Oktober pukul 10:50 WIB melaporkan storage sudah diganti dan deployment terbaru sudah dibuat. Hasil pengiriman setelah pembaruan belum diverifikasi. Prioritas sesi pengganti: kirim ulang antrean sintetis pada origin preview T5 yang sama, periksa submitted revisi 2, dua foto stored/checksum/keterangan/manifest, baca foto dan retry tanpa duplikat. Baseline sebelum pembaruan: Inspections/Photos 29/17 baris termasuk header, 24/14 kolom. Completed doPost bukan bukti sukses; exception dapat ditangkap. Android/mode pesawat/eviction/upgrade cache nyata belum diuji. T5 tidak mengubah Apps Script. Jangan mengubah izin foto, login/aktivasi, merge/promote Production atau mulai T6/T7. README/handoff bagian teratas memuat rekap dan runbook terbaru; status rollout di bawah merupakan riwayat.

Perintah (sudah dijalankan nyata):

- `npm ci` — dependency sesuai lockfile
- `npm run check` — typecheck (Next + Apps Script), `checks/*.check.mjs` (termasuk T2), serta sinkronisasi validator gateway
- `npm run build` — build produksi Next

Catatan kerja:

- Kode `apps-script/` tidak bisa dijalankan lokal. `checks/fake-apps-script.mjs` hanya meniru; lulus di sana bukan bukti Drive/Sheets/Apps Script sungguhan benar. Bukti nyata = `checks/live.mjs` di staging.
- Jangan menyatakan upload berhasil sebelum server mengonfirmasi data dan foto (status `stored` + checksum sama).
- Setelah mengubah `config/checklists.json` atau `lib/inspection.ts`, jalankan `npm run sync:checklist`; `apps-script/src/checklist.js` adalah keluaran otomatis dan harus ikut deployment. Naikkan versi template bila maknanya berubah.
- Setelah mengubah `lib/location.ts`, jalankan `npm run sync:location`; deploy keenam file Apps Script sesuai README. Action T3 `prepareLocatedInspection` memastikan gateway lama menolak sebelum write; retry T2 tetap memakai `prepareInspection`. Jangan memberi sukses sebelum checksum lokasi cocok.
- Jangan mengarang ambang geoteknik, checklist final, koordinat, folder ID, atau hasil uji. Angka usulan diberi komentar "usulan" di kode.
- Rahasia hanya di environment server dan Script Properties; tidak di git atau `NEXT_PUBLIC_*`.
- Akses: **tanpa aktivasi perangkat** atas keputusan pengguna 2026-10-09 (menyimpang dari `docs/plan.md` §3/§10/§14; lihat README, bagian "Keputusan akses"). Jangan memulihkan login/aktivasi atau menambah gerbang akses tanpa diminta; foto hanya terjaga oleh pasangan ID inspeksi+foto, jadi jangan menampilkan atau mencatat ID itu. Batas laju belum ada dan menunggu keputusan pengguna.
