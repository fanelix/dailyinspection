@AGENTS.md

# dailyinspection

Rencana: `docs/plan.md` (v1.1). Kerjakan hanya task yang ditunjuk (T0–T7, §13). Jangan lanjut ke task berikutnya bila acceptance criteria belum terpenuhi.

Baca `docs/handoff.md` lebih dulu. T0/T1 ada di `claude/eager-carson-bqb25q`; T2 di `codex/t2-checklists`; T3 di `codex/t3-locations` (turunan T2 `9979a49`). Branch staging tidak diubah; `main` masih kosong.

Status terbaru 2026-10-10 (sesi Codespace): T4/T5 terverifikasi Google (gateway build `2026-10-10.1` saat itu), lalu **T6 selesai dan terverifikasi** di `codex/t6-history` (produk `8c4d134`), PR #5 draft bertumpuk di atas PR #4. Gateway aktif kini **`build 2026-10-10.2`** (file `gateway` + `storage`). T6: aksi `listInspections`/`getInspection`/`reviewInspection`, kolom additif `Inspections!Z review_json` (26 kolom), halaman `/riwayat` + `/riwayat/[id]`, ekspor CSV (guard formula)/GeoJSON `[lon,lat]`; foto tetap lewat pasangan ID; foto penutupan ditunda. Verifikasi nyata 22/22 lulus: record T5 `Uji T5 verifikasi 20261010043340` direview → revisi 3 temuan ditutup, versi basi 409 `VERSION_CONFLICT`, replay idempoten, dua foto checksum = manifest, CSV/GeoJSON benar. Bug pemetaan staging di list/detail ditemukan verifikasi nyata dan diperbaiki (`recordFromRow_`); check regresi staging ada. `npm run check` 74/74 + build lulus (Node ≥22.18). Sisa: pengguna memeriksa `Inspections!Z` + data lama utuh; T7/Android/lapangan, backup/restore, foto penutupan, dan promosi Production belum. Jangan ubah izin foto/login/aktivasi atau merge/promote tanpa perintah. README/handoff bagian teratas memuat rekap terbaru.

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
