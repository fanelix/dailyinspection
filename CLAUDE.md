@AGENTS.md

# dailyinspection

Rencana: `docs/plan.md` (v1.1). Kerjakan hanya task yang ditunjuk (T0–T7, §13). Jangan lanjut ke task berikutnya bila acceptance criteria belum terpenuhi.

Baca `docs/handoff.md` lebih dulu: konteks sesi sebelumnya (keputusan, jebakan, apa yang terbukti, cara memulai T2). T0/T1 ada di branch `claude/eager-carson-bqb25q`; perubahan T2 ada di `codex/t2-checklists` (turunan dari `50318a7`). Branch staging tidak diubah; `main` masih kosong.

Status: T0/T1 selesai; implementasi T2 selesai dengan bukti lokal (lihat README). Checklist T2 adalah usulan untuk review engineer, bukan final. Keputusan 9 Oktober: tujuh area sesuai `config/checklists.json`; nama petugas diketik manual, tanpa daftar inspector. Sub-area/detail lokasi adalah teks manual opsional untuk setiap area. Jangan mengerjakan T3–T7 tanpa diminta.

Perintah (sudah dijalankan nyata):

- `npm ci` — dependency sesuai lockfile
- `npm run check` — typecheck (Next + Apps Script), `checks/*.check.mjs` (termasuk T2), serta sinkronisasi validator gateway
- `npm run build` — build produksi Next

Catatan kerja:

- Kode `apps-script/` tidak bisa dijalankan lokal. `checks/fake-apps-script.mjs` hanya meniru; lulus di sana bukan bukti Drive/Sheets/Apps Script sungguhan benar. Bukti nyata = `checks/live.mjs` di staging.
- Jangan menyatakan upload berhasil sebelum server mengonfirmasi data dan foto (status `stored` + checksum sama).
- Setelah mengubah `config/checklists.json` atau `lib/inspection.ts`, jalankan `npm run sync:checklist`; `apps-script/src/checklist.js` adalah keluaran otomatis dan harus ikut deployment. Naikkan versi template bila maknanya berubah.
- Jangan mengarang ambang geoteknik, checklist final, koordinat, folder ID, atau hasil uji. Angka usulan diberi komentar "usulan" di kode.
- Rahasia hanya di environment server dan Script Properties; tidak di git atau `NEXT_PUBLIC_*`.
- Akses: **tanpa aktivasi perangkat** atas keputusan pengguna 2026-10-09 (menyimpang dari `docs/plan.md` §3/§10/§14; lihat README, bagian "Keputusan akses"). Jangan memulihkan login/aktivasi atau menambah gerbang akses tanpa diminta; foto hanya terjaga oleh pasangan ID inspeksi+foto, jadi jangan menampilkan atau mencatat ID itu. Batas laju belum ada dan menunggu keputusan pengguna.
