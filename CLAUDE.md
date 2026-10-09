@AGENTS.md

# dailyinspection

Rencana: `docs/plan.md` (v1.1). Kerjakan hanya task yang ditunjuk (T0–T7, §13). Jangan lanjut ke task berikutnya bila acceptance criteria belum terpenuhi.

Baca `docs/handoff.md` lebih dulu. T0/T1 ada di `claude/eager-carson-bqb25q`; T2 di `codex/t2-checklists`; T3 di `codex/t3-locations` (turunan T2 `9979a49`). Branch staging tidak diubah; `main` masih kosong.

Status: revisi UTM T3 diminta pengguna (zona/belahan/datum WGS84, DGN95, ID74). Snapshot opsional `object.utm` dan action `prepareUtmInspection`; generator juga menghasilkan `projection.js` resmi Proj4js. Tidak mengasumsikan SRGI2013/epoch/grid site. T2 diuji terhadap Google asli; pengguna meminta tahap berikutnya (T3) dan mengabaikan pekerjaan izin foto. Jangan mengubah izin foto atau menyebut sumber privat tanpa bukti. T3 mengimplementasikan lokasi objek terpisah dari GPS, master read-only, konfirmasi dan GeoJSON titik. PR #2 draft/preview Ready, check 31/31 dan build lulus; UI desktop serta penolakan gateway lama tanpa perubahan Sheets diperiksa. Google nyata masih menunggu deployment gateway build `2026-10-09.6`; T3 belum accepted, jangan lanjut T4. PR T2 masih draft, Production masih T1 pada observasi terakhir. Checklist tetap usulan; tujuh area sesuai config, nama/sub-area manual. Gunakan database staging yang ada; tambahkan `location_json` setelah `sub_area`, jangan mengganti header/baris lama. Jangan mengerjakan T4–T7 tanpa diminta.

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
