@AGENTS.md

# dailyinspection

Rencana: `docs/plan.md` (v1.1). Kerjakan hanya task yang ditunjuk (T0–T7, §13). Jangan lanjut ke task berikutnya bila acceptance criteria belum terpenuhi.

Baca `docs/handoff.md` lebih dulu. T0/T1 ada di `claude/eager-carson-bqb25q`; T2 di `codex/t2-checklists`; T3 di `codex/t3-locations` (turunan T2 `9979a49`). Branch staging tidak diubah; `main` masih kosong.

Status terbaru 2026-10-10: pengguna melaporkan pembaruan enam file gateway T3 selesai dan meminta tahap berikutnya. Penyimpanan/retry snapshot UTM ID74/50S diuji terhadap Sheets asli: satu baris baru, retry identik tanpa duplikasi, baris lama utuh. GPS/Android dan byte unduhan aktual belum diuji. T4 dikerjakan pada `codex/t4-finalization`, turunan T3 `efe3c18`. Multi-foto/keterangan/relasi temuan dan finalisasi setelah semua foto stored + hash/versi valid, immutable retry. Build gateway T4 `2026-10-10.1`: hanya `gateway.js` dan `storage.js` berubah; deploy New version terpisah masih diperlukan. Header staging ditambah di kanan (Y photo_manifest_json dan O caption); database dan data lama dipertahankan. Checklist usulan, nama/sub-area manual, tanpa login/aktivasi sesuai keputusan pengguna. Jangan mengubah izin foto, merge/promote Production, atau memulai T5–T7 tanpa diminta. PR T2/T3 masih draft, Production terakhir T1. Lihat bagian teratas README/handoff untuk bukti dan runbook terbaru; status T3 diblokir di bawah merupakan catatan historis.

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
