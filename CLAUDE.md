@AGENTS.md

# dailyinspection

Rencana: `docs/plan.md` (v1.1). Kerjakan hanya task yang ditunjuk (T0–T7, §13). Jangan lanjut ke task berikutnya bila acceptance criteria belum terpenuhi.

Baca `docs/handoff.md` lebih dulu (bagian "Rekap pindah sesi" paling atas). Mulai dari `main` terbaru; branch lama T0–T6 dan PR #1–#5 sudah digantikan oleh rilis di `main`.

Status terbaru 2026-10-10: **rilis T0–T7 aktif di Production.** Kode rilis `main` `40ff92c` (PR #6, release `v2026.10.10`); docs `b808b4f` (PR #7). Gateway Apps Script aktif **`build 2026-10-10.2`**, schema 2, dan tidak berubah sejak T6. Production memakai Apps Script, Spreadsheet, dan folder Drive yang sama dengan staging (keputusan G5). Promosi Vercel manual: deployment dari `main` berstatus "Production Staged" sampai di-Promote. Sisa T7 hanya **pilot 3–5 hari (G7)**. Tampilan baru (design system "Inspeksi Lapangan", PR #9) sudah di-merge ke `main` `0e8116c` tetapi **belum di-Promote**; sampai di-Promote, Production masih menjalankan `40ff92c`. PR #9 hanya mengubah UI: logika draft/antrean/kirim/lokasi, gateway, dan data tidak berubah. Gerbang, keputusan, backup, dan rollback ada di `docs/runbook.md`. Jangan ubah izin foto (keputusan pengguna: dibiarkan `anyone`/writer), login/aktivasi, atau merge/promote tanpa perintah. Jangan rollback gateway ke sebelum T6 (header Inspections 26 kolom).

Perintah (sudah dijalankan nyata):

- `npm ci` — dependency sesuai lockfile
- `npm run check` — typecheck (Next + Apps Script), `checks/*.check.mjs` (termasuk T2), serta sinkronisasi validator gateway
- `npm run build` — build produksi Next

Catatan kerja:

- Kode `apps-script/` tidak bisa dijalankan lokal. `checks/fake-apps-script.mjs` hanya meniru; lulus di sana bukan bukti Drive/Sheets/Apps Script sungguhan benar. Bukti nyata = `checks/live.mjs` di staging.
- Gaya UI mengikuti design system "Inspeksi Lapangan" (token di `app/globals.css`, nama token sama dengan sistem sumber). Pakai token, sudut siku, area sentuh ≥ 48 px, dan status selalu dengan kata + ikon. Jawaban checklist, sistem koordinat, belahan bumi, dan status review berupa radio; `checks/t7-browser.mjs` memilihnya dengan `getByRole('radio', …)`.
- Jangan menyatakan upload berhasil sebelum server mengonfirmasi data dan foto (status `stored` + checksum sama).
- Setelah mengubah `config/checklists.json` atau `lib/inspection.ts`, jalankan `npm run sync:checklist`; `apps-script/src/checklist.js` adalah keluaran otomatis dan harus ikut deployment. Naikkan versi template bila maknanya berubah.
- Setelah mengubah `lib/location.ts`, jalankan `npm run sync:location`; deploy keenam file Apps Script sesuai README. Action T3 `prepareLocatedInspection` memastikan gateway lama menolak sebelum write; retry T2 tetap memakai `prepareInspection`. Jangan memberi sukses sebelum checksum lokasi cocok.
- Jangan mengarang ambang geoteknik, checklist final, koordinat, folder ID, atau hasil uji. Angka usulan diberi komentar "usulan" di kode.
- Rahasia hanya di environment server dan Script Properties; tidak di git atau `NEXT_PUBLIC_*`.
- Akses: **tanpa aktivasi perangkat** atas keputusan pengguna 2026-10-09 (menyimpang dari `docs/plan.md` §3/§10/§14; lihat README, bagian "Keputusan akses"). Jangan memulihkan login/aktivasi atau menambah gerbang akses tanpa diminta; foto hanya terjaga oleh pasangan ID inspeksi+foto, jadi jangan menampilkan atau mencatat ID itu. Batas laju belum ada dan menunggu keputusan pengguna.
