@AGENTS.md

# dailyinspection

Rencana: `docs/plan.md` (v1.1). Kerjakan hanya task yang ditunjuk (T0–T7, §13). Jangan lanjut ke task berikutnya bila acceptance criteria belum terpenuhi.

Baca `docs/handoff.md` lebih dulu. T0/T1 ada di `claude/eager-carson-bqb25q`; T2 di `codex/t2-checklists`; T3 di `codex/t3-locations` (turunan T2 `9979a49`). Branch staging tidak diubah; `main` masih kosong.

Status terbaru 2026-10-10 (sesi Codespace): pekerjaan sampai T5 di `codex/t5-drafts` (`2ad2153`), PR #4 draft, source produk `495b33f`. Verifikasi T4/T5 terhadap Google **sesudah pengguna mengganti `storage.gs` dan deploy ulang** sudah dijalankan lewat uji sintetis baru dari app lokal + Chromium headless (antrean lama di browser lain tidak tersentuh): tahap A gateway `build 2026-10-10.1`, sidik jari app→gateway `400 VALIDATION_ERROR`; `prepareCompleteInspection` 200 `uploading` revisi 1 + dua reservasi; dua foto `stored` (ukuran 130.610/134.591, checksum sesuai manifest); `finalizeInspection` → `submitted` revisi 2; baca ulang dua foto byte-identik; retry prepare/upload/finalize `replayed=true` tanpa revisi atau file kedua. `npm run check` 65/65 dan build lulus dengan Node ≥22.18 (22.16 gagal type stripping). Jebakan lokal: secret ber-`#` di `.env.local` harus dikutip. Sisa: pengguna memeriksa `Inspections!Y photo_manifest_json`, `Photos!O caption`, data lama utuh (harapan 30/19 baris termasuk header). Android/mode pesawat/eviction/two-tab nyata belum diuji. Jangan mengubah izin foto, login/aktivasi, merge/promote Production, atau mulai T6/T7. README/handoff bagian teratas memuat rekap terbaru.

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
