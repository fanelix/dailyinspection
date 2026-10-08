// Penyimpanan: Sheets (metadata) + Drive (foto privat). Hanya dipanggil dari gateway.js setelah pesan terverifikasi
// dan perangkat terbukti aktif.
// Sheets dan Drive tidak punya transaksi bersama, jadi urutan tulis dipilih agar kegagalan di tengah pulih dengan mengulang:
//   prepare : reservasi ID file Drive (generateIds) dan simpan petanya SEBELUM byte apa pun diunggah
//   upload  : byte ke Drive dengan ID cadangan -> baru baris Photos ditandai 'stored'
// Lock hanya membungkus operasi Sheets singkat, tidak pernah transfer byte.

const SHEET_COLUMNS = {
  Inspections: ['inspection_id', 'device_id', 'inspector_name', 'observed_at', 'received_at', 'note', 'status', 'version'],
  Photos: ['photo_id', 'inspection_id', 'drive_file_id', 'status', 'size', 'mime', 'sha256', 'reserved_at', 'stored_at'],
};
const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // sama dengan lib/photos.ts; usulan rencana §8, belum diuji dengan foto nyata
const MAX_PHOTOS_PER_INSPECTION = 5; // usulan rencana §8
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function prepareInspection(deviceId, payload) {
  const v = parsePrepare_(payload);
  return withLock_(function () {
    const insp = sheet_('Inspections');
    const photos = sheet_('Photos');
    const now = new Date().toISOString();

    const inspRow = findRow_(insp, v.inspectionId);
    let rec = inspRow ? readRecord_(insp, 'Inspections', inspRow) : null;
    if (rec) {
      if (rec.device_id !== deviceId) throw new GatewayError('FORBIDDEN', 'Inspeksi milik perangkat lain');
      if (rec.inspector_name !== v.inspectorName || rec.note !== v.note || rec.observed_at !== v.observedAt) {
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
        device_id: deviceId,
        inspector_name: v.inspectorName,
        observed_at: v.observedAt,
        received_at: now,
        note: v.note,
        status: 'uploading',
        version: '1',
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
      photos: v.photoIds.map(function (photoId) {
        return { photoId: photoId, status: statuses[photoId] };
      }),
    };
  });
}

function uploadPhoto(deviceId, payload) {
  const v = parseUpload_(payload);
  const bytes = decodeJpeg_(v);

  const start = withLock_(function () {
    return loadOwnedPhoto_(deviceId, v.inspectionId, v.photoId).rec;
  });
  if (start.status === 'stored') {
    if (start.sha256 !== v.sha256) throw new GatewayError('CONFLICT', 'photoId sudah berisi foto lain');
    return photoResult_(start, true); // retry setelah respons hilang: kembalikan hasil yang sama
  }

  const outcome = putToDrive_(start.drive_file_id, bytes, v.inspectionId + '_' + v.photoId + '.jpg');

  const stored = withLock_(function () {
    const loaded = loadOwnedPhoto_(deviceId, v.inspectionId, v.photoId);
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

function getPhoto(deviceId, payload) {
  if (!isObject_(payload)) throw bad_('Payload harus objek');
  const inspectionId = requireUuid_(payload.inspectionId, 'inspectionId');
  const photoId = requireUuid_(payload.photoId, 'photoId');
  const rec = withLock_(function () {
    return loadOwnedPhoto_(deviceId, inspectionId, photoId).rec;
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
  }
  return sh;
}

function writeRow_(sh, row, values) {
  const range = sh.getRange(row, 1, 1, values.length);
  range.setNumberFormat('@'); // teks biasa: cegah Sheets mengubah tanggal/angka dan menafsirkan "=..." sebagai rumus
  range.setValues([values.map(String)]);
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

// Memuat foto sekaligus memastikan perangkat adalah pemilik inspeksinya. Harus dipanggil di dalam withLock_.
function loadOwnedPhoto_(deviceId, inspectionId, photoId) {
  const insp = sheet_('Inspections');
  const inspRow = findRow_(insp, inspectionId);
  if (!inspRow) throw new GatewayError('NOT_FOUND', 'Inspeksi tidak ditemukan');
  if (readRecord_(insp, 'Inspections', inspRow).device_id !== deviceId) throw new GatewayError('FORBIDDEN', 'Bukan milik perangkat ini');
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
  if (!Array.isArray(p.photoIds) || p.photoIds.length < 1 || p.photoIds.length > MAX_PHOTOS_PER_INSPECTION) {
    throw bad_('photoIds harus 1-' + MAX_PHOTOS_PER_INSPECTION + ' UUID');
  }
  const photoIds = p.photoIds.map(function (id) {
    return requireUuid_(id, 'photoId');
  });
  if (new Set(photoIds).size !== photoIds.length) throw bad_('photoIds tidak boleh ganda');
  return { inspectionId: inspectionId, inspectorName: inspectorName, note: note, observedAt: observedAt, photoIds: photoIds };
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
// Meninggalkan 1 baris Inspections dan 1 baris Photos (perangkat uji sekali pakai) serta 1 file yang dibuang ke
// tempat sampah. Pakai hanya di staging. Hasil tiap langkah ada di Execution log.
function adminSelfTest() {
  const deviceId = Utilities.getUuid();
  const inspectionId = Utilities.getUuid();
  const photoId = Utilities.getUuid();
  const observedAt = new Date().toISOString();
  const note = '=uji teks, bukan rumus';
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
    return prepareInspection(deviceId, { inspectionId: inspectionId, inspectorName: 'Self-test', note: note, observedAt: observedAt, photoIds: [photoId] });
  });
  expect(prepared.photos[0].status === 'reserved', 'status foto seharusnya reserved');

  const first = step('uploadPhoto: file dibuat di Drive dengan ID cadangan', function () {
    return uploadPhoto(deviceId, upload);
  });
  expect(first.status === 'stored' && first.replayed === false, 'upload pertama seharusnya stored dan bukan replay');

  const second = step('uploadPhoto diulang: replay, tidak ada file kedua', function () {
    return uploadPhoto(deviceId, upload);
  });
  expect(second.status === 'stored' && second.replayed === true, 'upload kedua seharusnya replay');

  step('getPhoto: byte dibaca kembali dari Drive dan checksum cocok', function () {
    const read = getPhoto(deviceId, { inspectionId: inspectionId, photoId: photoId });
    expect(read.sha256 === sha256 && read.bytesBase64 === upload.bytesBase64, 'byte yang dibaca berbeda dari yang diunggah');
  });

  step('Sheets: tanggal tetap string dan teks berawalan "=" tidak menjadi rumus', function () {
    const stored = withLock_(function () {
      const insp = sheet_('Inspections');
      return readRecord_(insp, 'Inspections', findRow_(insp, inspectionId));
    });
    expect(stored.observed_at === observedAt, 'observed_at berubah bentuk: ' + stored.observed_at);
    expect(stored.note === note, 'note berubah bentuk: ' + stored.note);
  });

  try {
    const driveId = withLock_(function () {
      return loadOwnedPhoto_(deviceId, inspectionId, photoId).rec.drive_file_id;
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
