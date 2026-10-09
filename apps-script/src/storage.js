// Penyimpanan: Sheets (metadata) + Drive (foto privat). Hanya dipanggil dari gateway.js setelah pesan terverifikasi.
// Sheets dan Drive tidak punya transaksi bersama, jadi urutan tulis dipilih agar kegagalan di tengah pulih dengan mengulang:
//   prepare : reservasi ID file Drive (generateIds) dan simpan petanya SEBELUM byte apa pun diunggah
//   upload  : byte ke Drive dengan ID cadangan -> baru baris Photos ditandai 'stored'
// Lock hanya membungkus operasi Sheets singkat, tidak pernah transfer byte.

const SHEET_COLUMNS = {
  Inspections: ['inspection_id', 'device_id', 'inspector_name', 'observed_at', 'received_at', 'note', 'status', 'version', 'schema_version', 'template_version', 'area_id', 'checklist_json', 'sub_area'],
  Photos: ['photo_id', 'inspection_id', 'drive_file_id', 'status', 'size', 'mime', 'sha256', 'reserved_at', 'stored_at'],
};
const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // sama dengan lib/photos.ts; usulan rencana §8, belum diuji dengan foto nyata
const MAX_PHOTOS_PER_INSPECTION = 5; // usulan rencana §8
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function prepareInspection(payload) {
  const v = parsePrepare_(payload);
  return withLock_(function () {
    const insp = sheet_('Inspections');
    const photos = sheet_('Photos');
    const now = new Date().toISOString();

    const inspRow = findRow_(insp, v.inspectionId);
    let rec = inspRow ? readRecord_(insp, 'Inspections', inspRow) : null;
    if (rec) {
      if (rec.inspector_name !== v.inspectorName || rec.note !== v.note || rec.observed_at !== v.observedAt || rec.checklist_json !== v.checklistJson) {
        throw new GatewayError('CONFLICT', 'ID inspeksi sudah dipakai dengan isi berbeda');
      }
    }

    // Rencanakan foto lebih dulu (tanpa menulis apa pun) agar penolakan tidak meninggalkan setengah data.
    const statuses = {};
    const missing = [];
    v.photoIds.forEach(function (photoId) {
      const row = findRow_(photos, photoId);
      if (!row) return missing.push(photoId);
      const existing = readRecord_(photos, 'Photos', row);
      if (existing.inspection_id !== v.inspectionId) throw new GatewayError('CONFLICT', 'photoId sudah dipakai inspeksi lain');
      statuses[photoId] = existing.status;
    });
    if (countPhotosOf_(photos, v.inspectionId) + missing.length > MAX_PHOTOS_PER_INSPECTION) {
      throw bad_('Maksimal ' + MAX_PHOTOS_PER_INSPECTION + ' foto per inspeksi');
    }

    if (!rec) {
      rec = {
        inspection_id: v.inspectionId,
        device_id: '', // kolom dipertahankan agar sheet staging yang sudah ada tetap cocok; tidak lagi diisi (tanpa aktivasi)
        inspector_name: v.inspectorName,
        observed_at: v.observedAt,
        received_at: now,
        note: v.note,
        status: 'uploading',
        version: '1',
        schema_version: String(v.checklist.schemaVersion),
        template_version: v.checklist.templateVersion,
        area_id: v.checklist.areaId,
        checklist_json: v.checklistJson,
        sub_area: v.checklist.subArea || '',
      };
      writeRow_(insp, insp.getLastRow() + 1, recordValues_('Inspections', rec));
    }

    if (missing.length) {
      const ids = Drive.Files.generateIds({ count: missing.length, space: 'drive' }).ids;
      if (!ids || ids.length !== missing.length) throw new GatewayError('RETRYABLE_ERROR', 'Reservasi ID Drive gagal');
      // ID cadangan yang tidak terpakai (mis. Sheets gagal setelah ini) boleh yatim; tidak berbahaya.
      missing.forEach(function (photoId, i) {
        const photo = { photo_id: photoId, inspection_id: v.inspectionId, drive_file_id: ids[i], status: 'reserved', reserved_at: now };
        writeRow_(photos, photos.getLastRow() + 1, recordValues_('Photos', photo));
        statuses[photoId] = 'reserved';
      });
    }

    return {
      inspectionId: v.inspectionId,
      status: rec.status,
      version: Number(rec.version),
      schemaVersion: v.checklist.schemaVersion,
      templateVersion: v.checklist.templateVersion,
      subArea: rec.sub_area || null,
      checklistSha256: sha256Hex_(rec.checklist_json),
      reviewRequired: v.checklist.reviewRequired,
      photos: v.photoIds.map(function (photoId) {
        return { photoId: photoId, status: statuses[photoId] };
      }),
    };
  });
}

function uploadPhoto(payload) {
  const v = parseUpload_(payload);
  const bytes = decodeJpeg_(v);

  const start = withLock_(function () {
    return loadPhoto_(v.inspectionId, v.photoId).rec;
  });
  if (start.status === 'stored') {
    if (start.sha256 !== v.sha256) throw new GatewayError('CONFLICT', 'photoId sudah berisi foto lain');
    return photoResult_(start, true); // retry setelah respons hilang: kembalikan hasil yang sama
  }

  const outcome = putToDrive_(start.drive_file_id, bytes, v.inspectionId + '_' + v.photoId + '.jpg');

  const stored = withLock_(function () {
    const loaded = loadPhoto_(v.inspectionId, v.photoId);
    const rec = loaded.rec;
    if (rec.status === 'stored' && rec.sha256 !== v.sha256) throw new GatewayError('CONFLICT', 'photoId sudah berisi foto lain');
    rec.status = 'stored';
    rec.size = String(bytes.length);
    rec.mime = 'image/jpeg';
    rec.sha256 = v.sha256;
    rec.stored_at = rec.stored_at || new Date().toISOString();
    writeRow_(loaded.sheet, loaded.row, recordValues_('Photos', rec));
    return rec;
  });
  return photoResult_(stored, outcome === 'existing');
}

function getPhoto(payload) {
  if (!isObject_(payload)) throw bad_('Payload harus objek');
  const inspectionId = requireUuid_(payload.inspectionId, 'inspectionId');
  const photoId = requireUuid_(payload.photoId, 'photoId');
  const rec = withLock_(function () {
    return loadPhoto_(inspectionId, photoId).rec;
  });
  if (rec.status !== 'stored') throw new GatewayError('NOT_FOUND', 'Foto belum tersimpan');
  const bytes = DriveApp.getFileById(rec.drive_file_id).getBlob().getBytes();
  if (sha256Hex_(bytes) !== rec.sha256) throw new GatewayError('INTERNAL_ERROR', 'Integritas foto gagal diverifikasi');
  return { photoId: photoId, mime: rec.mime, sha256: rec.sha256, bytesBase64: Utilities.base64Encode(bytes) };
}

// ---- Drive ----

function putToDrive_(fileId, bytes, name) {
  const rootId = props_().getProperty('PHOTO_ROOT_FOLDER_ID');
  if (!rootId) throw new GatewayError('INTERNAL_ERROR', 'PHOTO_ROOT_FOLDER_ID belum diatur');
  // ponytail: file langsung di folder root staging, tanpa YYYY/MM/AREA/INSPECTION_ID (rencana §8); membuat folder
  // secara idempoten butuh penanganan tersendiri dan bukan bagian pembuktian T1.
  try {
    Drive.Files.create({ id: fileId, name: name, mimeType: 'image/jpeg', parents: [rootId] }, Utilities.newBlob(bytes, 'image/jpeg', name), {
      supportsAllDrives: true,
    });
    return 'created';
  } catch (err) {
    // Percobaan sebelumnya mungkin sudah menyimpan file (respons hilang, atau Sheets gagal sesudahnya).
    // Apa pun penyebab galatnya, anggap sukses hanya bila file ber-ID itu ada dan isinya terbukti sama.
    const meta = tryGetMeta_(fileId);
    if (!meta) {
      console.error('Drive create gagal: ' + String(err && err.message));
      throw new GatewayError('RETRYABLE_ERROR', 'Penyimpanan Drive gagal; ulangi');
    }
    if (!meta.trashed && Number(meta.size) === bytes.length && meta.md5Checksum === md5Hex_(bytes)) return 'existing';
    throw new GatewayError('CONFLICT', 'ID file Drive sudah berisi data lain');
  }
}

function tryGetMeta_(fileId) {
  try {
    return Drive.Files.get(fileId, { fields: 'id,size,md5Checksum,trashed', supportsAllDrives: true });
  } catch (err) {
    return null;
  }
}

// ---- Sheets ----

function sheet_(name) {
  const id = props_().getProperty('SPREADSHEET_ID');
  if (!id) throw new GatewayError('INTERNAL_ERROR', 'SPREADSHEET_ID belum diatur');
  const ss = SpreadsheetApp.openById(id);
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    writeRow_(sh, 1, SHEET_COLUMNS[name]);
  } else {
    const expected = SHEET_COLUMNS[name];
    const actual = sh.getRange(1, 1, 1, expected.length).getValues()[0];
    // Only append to known T1 (8 columns) / initial T2 (12 columns) headers.
    const legacyLengths = name === 'Inspections' ? [8, 12] : [];
    if (actual.every(function (value, i) { return value === expected[i]; })) return sh;
    if (legacyLengths.some(function (length) {
      return actual.slice(0, length).every(function (value, i) { return value === expected[i]; }) &&
        actual.slice(length).every(function (value) { return value === ''; });
    })) {
      writeRow_(sh, 1, expected); // additive header migration; existing data rows are untouched
    } else {
      throw new GatewayError('INTERNAL_ERROR', 'Header ' + name + ' tidak sesuai; periksa struktur tab sebelum menulis');
    }
  }
  return sh;
}

function writeRow_(sh, row, values) {
  const range = sh.getRange(row, 1, 1, values.length);
  // Diukur di Sheets sungguhan (probe 2026-10-08): format '@' saja menahan konversi tanggal/angka tetapi TIDAK menahan
  // "=..." menjadi rumus (nama/catatan petugas berawalan "=" = injeksi rumus). Format '@' + apostrof di depan menyimpan
  // semua nilai uji apa adanya; apostrofnya tidak ikut tersimpan sebagai isi. Sel kosong dibiarkan kosong.
  range.setNumberFormat('@');
  range.setValues([
    values.map(function (v) {
      const s = String(v);
      return s === '' ? '' : "'" + s;
    }),
  ]);
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  // ponytail: pemindaian linear kolom ID; cukup untuk ratusan baris, ganti ke indeks/DB bila pencarian melambat (rencana §16).
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return 0;
}

function countPhotosOf_(photosSheet, inspectionId) {
  const last = photosSheet.getLastRow();
  if (last < 2) return 0;
  return photosSheet
    .getRange(2, 2, last - 1, 1)
    .getValues()
    .filter(function (r) {
      return r[0] === inspectionId;
    }).length;
}

function readRecord_(sh, name, row) {
  const cols = SHEET_COLUMNS[name];
  const values = sh.getRange(row, 1, 1, cols.length).getValues()[0];
  const rec = {};
  cols.forEach(function (c, i) {
    rec[c] = String(values[i]);
  });
  return rec;
}

function recordValues_(name, rec) {
  return SHEET_COLUMNS[name].map(function (c) {
    return rec[c] === undefined ? '' : rec[c];
  });
}

// Memuat foto lewat PASANGAN (inspeksi, foto) yang harus berpasangan. Tanpa aktivasi (keputusan 2026-10-09), pasangan
// ID acak 122 bit inilah satu-satunya penjaga akses baca/tulis ke data yang sudah ada. Panggil di dalam withLock_.
function loadPhoto_(inspectionId, photoId) {
  const sh = sheet_('Photos');
  const row = findRow_(sh, photoId);
  const rec = row ? readRecord_(sh, 'Photos', row) : null;
  if (!rec || rec.inspection_id !== inspectionId) throw new GatewayError('NOT_FOUND', 'Foto tidak ditemukan');
  return { sheet: sh, row: row, rec: rec };
}

function photoResult_(rec, replayed) {
  return {
    photoId: rec.photo_id,
    inspectionId: rec.inspection_id,
    status: rec.status,
    size: Number(rec.size),
    sha256: rec.sha256,
    replayed: replayed,
  };
}

// ---- Validasi payload (batas kepercayaan: server Next tidak dianggap sudah memvalidasi) ----

function bad_(message) {
  return new GatewayError('VALIDATION_ERROR', message);
}

function isObject_(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function requireUuid_(v, label) {
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw bad_(label + ' harus UUID huruf kecil');
  return v;
}

function parsePrepare_(p) {
  if (!isObject_(p)) throw bad_('Payload harus objek');
  const inspectionId = requireUuid_(p.inspectionId, 'inspectionId');
  const inspectorName = typeof p.inspectorName === 'string' ? p.inspectorName.trim() : '';
  if (inspectorName.length < 1 || inspectorName.length > 100) throw bad_('inspectorName harus 1-100 karakter');
  const note = typeof p.note === 'string' ? p.note : '';
  if (note.length > 2000) throw bad_('note maksimal 2000 karakter');
  const observedAt = p.observedAt;
  if (typeof observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(observedAt) || isNaN(Date.parse(observedAt))) {
    throw bad_('observedAt harus ISO 8601 UTC');
  }
  if (!Array.isArray(p.photoIds) || p.photoIds.length > MAX_PHOTOS_PER_INSPECTION) {
    throw bad_('photoIds harus 0-' + MAX_PHOTOS_PER_INSPECTION + ' UUID');
  }
  const photoIds = p.photoIds.map(function (id) {
    return requireUuid_(id, 'photoId');
  });
  if (new Set(photoIds).size !== photoIds.length) throw bad_('photoIds tidak boleh ganda');
  let checklist;
  try { checklist = parseChecklist(p); } catch (err) { throw bad_(err.message); }
  return { inspectionId: inspectionId, inspectorName: inspectorName, note: note, observedAt: observedAt, photoIds: photoIds,
    checklist: checklist, checklistJson: JSON.stringify(checklist) };
}

function parseUpload_(p) {
  if (!isObject_(p)) throw bad_('Payload harus objek');
  const v = {
    inspectionId: requireUuid_(p.inspectionId, 'inspectionId'),
    photoId: requireUuid_(p.photoId, 'photoId'),
    sha256: p.sha256,
    bytesBase64: p.bytesBase64,
  };
  if (p.mime !== 'image/jpeg') throw bad_('Hanya image/jpeg yang didukung');
  if (typeof v.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(v.sha256)) throw bad_('sha256 harus 64 hex huruf kecil');
  if (typeof v.bytesBase64 !== 'string' || v.bytesBase64.length === 0 || v.bytesBase64.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4) {
    throw bad_('Ukuran foto di luar batas');
  }
  return v;
}

// ---- Diagnostik (dijalankan manual dari editor; tidak ada di allowlist doPost) ----

// Menguji Drive + Sheets sungguhan lewat kode storage yang sama dengan jalur produksi, tanpa Vercel dan tanpa HMAC.
// Meninggalkan 1 baris Inspections dan 1 baris Photos serta 1 file yang dibuang ke tempat sampah. Pakai hanya di staging. Hasil tiap langkah ada di Execution log.
function adminSelfTest() {
  const inspectionId = Utilities.getUuid();
  const photoId = Utilities.getUuid();
  const observedAt = new Date().toISOString();
  const note = '=uji teks, bukan rumus';
  const inspectorName = "'kutip depan"; // apostrof di depan nilai asli harus ikut kembali (kasus yang belum pernah diukur)
  const bytes = [-1, -40, -1, -32, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, -1, -39]; // kerangka JFIF, bukan gambar yang bisa dibuka
  const sha256 = sha256Hex_(bytes);
  const upload = { inspectionId: inspectionId, photoId: photoId, mime: 'image/jpeg', sha256: sha256, bytesBase64: Utilities.base64Encode(bytes) };

  function step(label, fn) {
    try {
      const result = fn();
      console.log('LULUS  ' + label);
      return result;
    } catch (err) {
      console.error('GAGAL  ' + label + ': ' + String(err && err.message));
      throw err;
    }
  }
  function expect(cond, message) {
    if (!cond) throw new Error(message);
  }

  const prepared = step('prepareInspection: baris dibuat dan ID file Drive dicadangkan (generateIds)', function () {
    return prepareInspection({ inspectionId: inspectionId, inspectorName: inspectorName, note: note, observedAt: observedAt, photoIds: [photoId],
      schemaVersion: CHECKLISTS.schemaVersion, templateVersion: CHECKLISTS.templateVersion, areaId: 'pit', subArea: '=uji sub-area, bukan rumus',
      answers: emptyAnswers('pit').map(function (a) { return { itemId: a.itemId, answer: 'not_inspected', finding: null }; }) });
  });
  expect(prepared.photos[0].status === 'reserved', 'status foto seharusnya reserved');

  const first = step('uploadPhoto: file dibuat di Drive dengan ID cadangan', function () {
    return uploadPhoto(upload);
  });
  expect(first.status === 'stored' && first.replayed === false, 'upload pertama seharusnya stored dan bukan replay');

  const second = step('uploadPhoto diulang: replay, tidak ada file kedua', function () {
    return uploadPhoto(upload);
  });
  expect(second.status === 'stored' && second.replayed === true, 'upload kedua seharusnya replay');

  // Jalur pemulihan inti T1: file sudah ada di Drive tetapi barisnya belum 'stored' (mis. Sheets gagal sesudah Drive
  // berhasil, atau respons hilang). Drive harus menolak create dengan ID yang sama, lalu kode memverifikasi isi file.
  step('pemulihan: baris dikembalikan ke reserved; upload ulang mengenali file yang sama (MD5) dan tidak membuat file kedua', function () {
    withLock_(function () {
      const loaded = loadPhoto_(inspectionId, photoId);
      loaded.rec.status = 'reserved';
      writeRow_(loaded.sheet, loaded.row, recordValues_('Photos', loaded.rec));
    });
    const healed = uploadPhoto(upload);
    expect(healed.status === 'stored' && healed.replayed === true, 'pemulihan seharusnya menandai stored lewat verifikasi file yang ada');
    const files = DriveApp.getFolderById(props_().getProperty('PHOTO_ROOT_FOLDER_ID')).getFilesByName(inspectionId + '_' + photoId + '.jpg');
    let count = 0;
    while (files.hasNext()) {
      files.next();
      count++;
    }
    expect(count === 1, 'seharusnya tepat 1 file di folder, ditemukan ' + count);
  });

  step('getPhoto: byte dibaca kembali dari Drive dan checksum cocok', function () {
    const read = getPhoto({ inspectionId: inspectionId, photoId: photoId });
    expect(read.sha256 === sha256 && read.bytesBase64 === upload.bytesBase64, 'byte yang dibaca berbeda dari yang diunggah');
  });

  step('Sheets: tanggal tetap string dan teks berawalan "=" tidak menjadi rumus', function () {
    const stored = withLock_(function () {
      const insp = sheet_('Inspections');
      return readRecord_(insp, 'Inspections', findRow_(insp, inspectionId));
    });
    expect(stored.observed_at === observedAt, 'observed_at berubah bentuk: ' + stored.observed_at);
    expect(stored.note === note, 'note berubah bentuk: ' + stored.note);
    expect(stored.inspector_name === inspectorName, 'inspector_name berubah bentuk: ' + stored.inspector_name);
    expect(stored.sub_area === '=uji sub-area, bukan rumus', 'sub_area berubah bentuk: ' + stored.sub_area);
    expect(stored.template_version === CHECKLISTS.templateVersion && stored.schema_version === '2', 'versi checklist tidak tersimpan');
    const checklist = JSON.parse(stored.checklist_json);
    expect(checklist.answers.every(function (a) { return a.answer === 'not_inspected'; }), 'jawaban checklist berubah');
    expect(sha256Hex_(stored.checklist_json) === prepared.checklistSha256, 'checksum checklist berubah');
  });

  try {
    const driveId = withLock_(function () {
      return loadPhoto_(inspectionId, photoId).rec.drive_file_id;
    });
    DriveApp.getFileById(driveId).setTrashed(true);
    console.log('LULUS  bersih-bersih: file uji dibuang ke tempat sampah');
  } catch (err) {
    console.log('PERINGATAN  file uji tidak bisa dibuang otomatis; hapus manual file selftest di folder: ' + String(err && err.message));
  }
  console.log('SELF-TEST LULUS: Drive (generateIds + create + get) dan Sheets bekerja dengan kode produksi.');
  return 'LULUS';
}

function decodeJpeg_(v) {
  let bytes;
  try {
    bytes = Utilities.base64Decode(v.bytesBase64);
  } catch (err) {
    throw bad_('bytesBase64 bukan base64 yang valid');
  }
  if (bytes.length < 3 || bytes.length > MAX_PHOTO_BYTES) throw bad_('Ukuran foto di luar batas');
  // Byte Apps Script bertanda: 0xFF = -1, 0xD8 = -40. Tanda tangan JPEG: FF D8 FF.
  if (bytes[0] !== -1 || bytes[1] !== -40 || bytes[2] !== -1) throw bad_('Berkas bukan JPEG');
  if (sha256Hex_(bytes) !== v.sha256) throw bad_('Checksum tidak cocok dengan isi foto');
  return bytes;
}
