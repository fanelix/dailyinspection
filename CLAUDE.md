@AGENTS.md

# dailyinspection

Rencana: `docs/plan.md` (v1.1). Kerjakan hanya task yang ditunjuk (T0–T7, §13). Jangan lanjut ke task berikutnya bila acceptance criteria belum terpenuhi.

Baca `docs/handoff.md` lebih dulu: konteks sesi sebelumnya (keputusan, jebakan, apa yang terbukti, cara memulai T2). Semua kerja ada di branch `claude/eager-carson-bqb25q`; `main` masih kosong.

Status: T0 dan T1 selesai (2026-10-09, lihat README). T2 menunggu masukan pengguna (daftar area, checklist awal untuk review engineer, nama dua inspector); jangan mengarang isinya.

Perintah (sudah dijalankan nyata):

- `npm ci` — dependency sesuai lockfile
- `npm run check` — typecheck (Next + Apps Script), `checks/gateway.check.mjs`, dan `checks/photos.check.mjs`
- `npm run build` — build produksi Next

Catatan kerja:

- Kode `apps-script/` tidak bisa dijalankan lokal. `checks/fake-apps-script.mjs` hanya meniru; lulus di sana bukan bukti Drive/Sheets/Apps Script sungguhan benar. Bukti nyata = `checks/live.mjs` di staging.
- Jangan menyatakan upload berhasil sebelum server mengonfirmasi data dan foto (status `stored` + checksum sama).
- Jangan mengarang ambang geoteknik, checklist final, koordinat, folder ID, atau hasil uji. Angka usulan diberi komentar "usulan" di kode.
- Rahasia hanya di environment server dan Script Properties; tidak di git atau `NEXT_PUBLIC_*`.
- Akses: **tanpa aktivasi perangkat** atas keputusan pengguna 2026-10-09 (menyimpang dari `docs/plan.md` §3/§10/§14; lihat README, bagian "Keputusan akses"). Jangan memulihkan login/aktivasi atau menambah gerbang akses tanpa diminta; foto hanya terjaga oleh pasangan ID inspeksi+foto, jadi jangan menampilkan atau mencatat ID itu. Batas laju belum ada dan menunggu keputusan pengguna.
