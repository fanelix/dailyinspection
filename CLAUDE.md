@AGENTS.md

# dailyinspection

Rencana: `docs/plan.md` (v1.1). Kerjakan hanya task yang ditunjuk (T0–T7, §13). Jangan lanjut ke task berikutnya bila acceptance criteria belum terpenuhi.

Perintah (sudah dijalankan nyata):

- `npm ci` — dependency sesuai lockfile
- `npm run check` — typecheck (Next + Apps Script) dan `checks/gateway.check.mjs`
- `npm run build` — build produksi Next

Catatan kerja:

- Kode `apps-script/` tidak bisa dijalankan lokal. `checks/fake-apps-script.mjs` hanya meniru; lulus di sana bukan bukti Drive/Sheets/Apps Script sungguhan benar. Bukti nyata = `checks/live.mjs` di staging.
- Jangan menyatakan upload berhasil sebelum server mengonfirmasi data dan foto (status `stored` + checksum sama).
- Jangan mengarang ambang geoteknik, checklist final, koordinat, folder ID, atau hasil uji. Angka usulan diberi komentar "usulan" di kode.
- Rahasia hanya di environment server dan Script Properties; tidak di git atau `NEXT_PUBLIC_*`.
