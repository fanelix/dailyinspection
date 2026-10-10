// Penyimpanan: Sheets (metadata) + Drive (foto privat). Hanya dipanggil dari gateway.js setelah pesan terverifikasi.
// Sheets dan Drive tidak punya transaksi bersama, jadi urutan tulis dipilih agar kegagalan di tengah pulih dengan mengulang:
//   prepare : reservasi ID file Drive (generateIds) dan simpan petanya SEBELUM byte apa pun diunggah
//   upload  : byte ke Drive dengan ID cadangan -> baru baris Photos ditandai 'stored'
// Lock hanya membungkus operasi Sheets singkat, tidak pernah transfer byte.

const SHEET_COLUMNS = {
  Inspections: ['inspection_id', 'device_id', 'inspector_name', 'observed_at', 'received_at', 'note', 'status', 'version', 'schema_version', 'template_version', 'area_id', 'checklist_json', 'sub_area', 'location_json', 'photo_manifest_json', 'review_json'],
  Photos: ['photo_id', 'inspection_id', 'drive_file_id', 'status', 'size', 'mime', 'sha256', 'reserved_at', 'stored_at', 'caption'],
};
// Known headers verified in the existing staging DB. Keep these columns and old rows in place.
const STAGING_COLUMNS = {
  Inspections: ['inspection_id', 'revision', 'operation_id', 'operational_date', 'shift', 'area_id', 'reporter_name', 'unit_company', 'identity_verification', 'template_id', 'template_version', 'workflow_status', 'submission_verification', 'owner_public_session_id', 'actor_id', 'created_at', 'updated_at'],
  Photos: ['photo_id', 'inspection_id', 'revision', 'item_id', 'finding_id', 'photo_point_id', 'drive_file_id', 'thumbnail_file_id', 'checksum', 'status'],
};
const STAGING_FIELD_NAMES = {
  Inspections: { inspector_name: 'reporter_name', received_at: 'created_at', status: 'workflow_status', version: 'revision' },
  Photos: { sha256: 'checksum' },
};
const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // sama dengan lib/photos.ts; usulan rencana §8, belum diuji dengan foto nyata
const MAX_PHOTOS_PER_INSPECTION = 5; // usulan rencana §8
// ponytail: riwayat review disimpan dalam satu sel JSON dengan batas 20 entri (~50k karakter sel Sheets).
// Pindahkan ke tab Audit terpisah bila riwayat penuh diperlukan untuk audit pilot.
const MAX_REVIEW_HISTORY = 20;
const MAX_HISTORY_LIMIT = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function prepareCompleteInspection(payload) {
  if (!isObject_(payload) || payload.submissionVersion !== 1) throw bad_('Versi pengiriman tidak didukung');
  return prepareLocatedInspection(payload);
}

function prepareUtmInspection(payload) {
  if (!isObject_(payload) || !isObject_(payload.location) || !isObject_(payload.location.object) || payload.location.object.utm == null) throw bad_('Snapshot UTM wajib dikonfirmasi');
  return prepareLocatedInspection(payload);
}

function prepareLocatedInspection(payload) {
  if (!isObject_(payload) || payload.location == null) throw bad_('Lokasi objek wajib dikonfirmasi');
  return prepareInspection(payload);
}

function prepareInspection(payload) {
  const v = parsePrepare_(payload);
  return withLock_(function () {
    const insp = sheet_('Inspections');
    const photos = sheet_('Photos');
    const now = new Date().toISOString();

    const inspRow = findRow_(insp, v.inspectionId);
    let rec = inspRow ? readRecord_(insp, 'Inspections', inspRow) : null;
    if (rec) {
      if (rec.inspector_name !== v.inspectorName || rec.note !== v.note || rec.observed_at !== v.observedAt || rec.checklist_json !== v.checklistJson || rec.location_json !== v.locationJson || rec.photo_manifest_json !== v.manifestJson) {
        throw new GatewayError('CONFLICT', 'ID inspeksi sudah dipakai dengan isi berbeda');
      }
    }

    // Resolve masters only on first save: retries preserve the historical snapshot even after master edits.
    const selected = v.location && v.location.object.savedLocation;
    if (!rec && selected) {
      const current = listLocations({ areaId: v.checklist.areaId }).locations.find(function (l) { return l.id === selected.id; });
      if (!current || JSON.stringify(current) !== JSON.stringify(selected)) throw new GatewayError(v.manifest ? 'LOCATION_CHANGED' : 'CONFLICT', 'Lokasi tersimpan berubah; muat ulang daftar dan pilih kembali');
    }

    // Rencanakan foto lebih dulu (tanpa menulis apa pun) agar penolakan tidak meninggalkan setengah data.
    const statuses = {};
    const missing = [];
    v.photoIds.forEach(function (photoId) {
      const row = findRow_(photos, photoId);
      if (!row) return missing.push(photoId);
      const existing = readRecord_(photos, 'Photos', row);
      if (existing.inspection_id !== v.inspectionId || !existing.reserved_at) throw new GatewayError('CONFLICT', 'photoId sudah dipakai atau bukan reservasi gateway ini');
      statuses[photoId] = existing.status;
    });
    if (countPhotosOf_(photos, v.inspectionId) + missing.length > MAX_PHOTOS_PER_INSPECTION) {
      throw bad_('Maksimal ' + MAX_PHOTOS_PER_INSPECTION + ' foto per inspeksi');
    }
    if (rec && rec.status === 'submitted' && missing.length) throw new GatewayError('CONFLICT', 'Inspeksi terkirim tidak dapat ditambah foto');

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
        location_json: v.locationJson,
        photo_manifest_json: v.manifestJson,
        identity_verification: 'unverified', // manual names are not authenticated identities
        submission_verification: 'unverified',
        updated_at: now,
      };
      writeRow_(insp, insp.getLastRow() + 1, recordValues_(insp, 'Inspections', rec));
    }

    if (missing.length) {
      const ids = Drive.Files.generateIds({ count: missing.length, space: 'drive' }).ids;
      if (!ids || ids.length !== missing.length) throw new GatewayError('RETRYABLE_ERROR', 'Reservasi ID Drive gagal');
      // ID cadangan yang tidak terpakai (mis. Sheets gagal setelah ini) boleh yatim; tidak berbahaya.
      missing.forEach(function (photoId, i) {
        const photo = { photo_id: photoId, inspection_id: v.inspectionId, revision: rec.version, drive_file_id: ids[i], status: 'reserved', reserved_at: now, caption: v.manifest ? v.manifest.find(function (p) { return p.photoId === photoId; }).caption : '' };
        writeRow_(photos, photos.getLastRow() + 1, recordValues_(photos, 'Photos', photo));
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
      locationSha256: rec.location_json ? sha256Hex_(rec.location_json) : null,
      ...(rec.photo_manifest_json ? { photoManifestSha256: sha256Hex_(rec.photo_manifest_json) } : {}),
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
    const photo = loadPhoto_(v.inspectionId, v.photoId).rec;
    checkUploadManifest_(v, bytes.length, photo);
    return photo;
  });
  if (start.status === 'stored') {
    if (start.sha256 !== v.sha256) throw new GatewayError('CONFLICT', 'photoId sudah berisi foto lain');
    return photoResult_(start, true); // retry setelah respons hilang: kembalikan hasil yang sama
  }

  const outcome = putToDrive_(start.drive_file_id, bytes, v.inspectionId + '_' + v.photoId + '.jpg');

  const stored = withLock_(function () {
    const loaded = loadPhoto_(v.inspectionId, v.photoId);
    const rec = loaded.rec;
    checkUploadManifest_(v, bytes.length, rec);
    if (rec.status === 'stored' && rec.sha256 !== v.sha256) throw new GatewayError('CONFLICT', 'photoId sudah berisi foto lain');
    rec.status = 'stored';
    rec.size = String(bytes.length);
    rec.mime = 'image/jpeg';
    rec.sha256 = v.sha256;
    rec.stored_at = rec.stored_at || new Date().toISOString();
    writeRow_(loaded.sheet, loaded.row, recordValues_(loaded.sheet, 'Photos', rec));
    return rec;
  });
  return photoResult_(stored, outcome === 'existing');
}

// A stored photo is already checksum-verified by uploadPhoto. Finalization checks the immutable manifest
// and all reservations under the same Sheets lock; interrupted or concurrent uploads cannot pass early.
function finalizeInspection(payload) {
  if (!isObject_(payload)) throw bad_('Payload harus objek');
  const inspectionId = requireUuid_(payload.inspectionId, 'inspectionId');
  if (!Number.isInteger(payload.expectedVersion) || payload.expectedVersion < 1) throw bad_('expectedVersion tidak valid');
  ['checklistSha256', 'locationSha256', 'photoManifestSha256'].forEach(function (key) {
    if (typeof payload[key] !== 'string' || !/^[0-9a-f]{64}$/.test(payload[key])) throw bad_(key + ' tidak valid');
  });
  return withLock_(function () {
    const loaded = loadInspection_(inspectionId), rec = loaded.rec;
    if (!rec.photo_manifest_json || !rec.location_json) throw new GatewayError('CONFLICT', 'Inspeksi belum disiapkan untuk finalisasi');
    const checklist = JSON.parse(rec.checklist_json), manifest = JSON.parse(rec.photo_manifest_json);
    const hashes = { checklistSha256: sha256Hex_(rec.checklist_json), locationSha256: sha256Hex_(rec.location_json), photoManifestSha256: sha256Hex_(rec.photo_manifest_json) };
    if (Object.keys(hashes).some(function (k) { return hashes[k] !== payload[k]; })) throw new GatewayError('CONFLICT', 'Isi inspeksi berbeda dari kiriman yang dikonfirmasi');
    const version = Number(rec.version);
    const replayed = rec.status === 'submitted' && version === payload.expectedVersion + 1;
    if (!replayed && (rec.status !== 'uploading' || version !== payload.expectedVersion)) throw new GatewayError('CONFLICT', 'Versi atau status inspeksi berubah');
    const photos = sheet_('Photos');
    if (countPhotosOf_(photos, inspectionId) !== manifest.length) throw new GatewayError('CONFLICT', 'Daftar reservasi foto berbeda');
    const results = manifest.map(function (p) {
      const photo = loadPhoto_(inspectionId, p.photoId).rec;
      if (photo.status !== 'stored' || photo.sha256 !== p.sha256 || Number(photo.size) !== p.size || photo.mime !== 'image/jpeg' || photo.caption !== p.caption) {
        throw new GatewayError('CONFLICT', 'Ada foto yang belum tersimpan sesuai kiriman. Tekan Kirim lagi dengan isian yang sama.');
      }
      return { photoId: p.photoId, status: photo.status, sha256: photo.sha256 };
    });
    if (!replayed) {
      // Revalidate the saved snapshot and finding links before the state transition.
      let validated;
      try {
        validated = parseChecklist({ ...checklist, photoIds: manifest.map(function (p) { return p.photoId; }) });
        parseLocation(JSON.parse(rec.location_json), checklist.areaId);
      } catch (err) { throw bad_(err.message); }
      if (JSON.stringify(validated) !== rec.checklist_json) throw new GatewayError('CONFLICT', 'Snapshot checklist berubah');
      rec.status = 'submitted'; rec.version = String(version + 1); rec.updated_at = new Date().toISOString();
      writeRow_(loaded.sheet, loaded.row, recordValues_(loaded.sheet, 'Inspections', rec));
    }
    return { inspectionId: inspectionId, status: rec.status, version: Number(rec.version), ...hashes, reviewRequired: checklist.reviewRequired, photos: results };
  });
}

function loadInspection_(inspectionId) {
  const sh = sheet_('Inspections'), row = findRow_(sh, inspectionId);
  if (!row) throw new GatewayError('NOT_FOUND', 'Inspeksi tidak ditemukan');
  return { sheet: sh, row: row, rec: readRecord_(sh, 'Inspections', row) };
}

function checkUploadManifest_(v, size, photo) {
  const rec = loadInspection_(v.inspectionId).rec;
  if (rec.photo_manifest_json) {
    const expected = JSON.parse(rec.photo_manifest_json).find(function (p) { return p.photoId === v.photoId; });
    if (!expected || expected.sha256 !== v.sha256 || expected.size !== size) throw new GatewayError('CONFLICT', 'Foto berbeda dari reservasi pengiriman');
  }
  if (rec.status === 'submitted' && photo.status !== 'stored') throw new GatewayError('CONFLICT', 'Inspeksi terkirim tidak dapat diubah');
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

// ---- T6: riwayat, detail dan review ----

// Aksi baca tidak pernah mengembalikan byte foto atau ID Drive; foto tetap lewat pasangan (inspeksi, foto).
function listInspections(payload) {
  const q = parseHistoryQuery_(payload);
  return withLock_(function () {
    const sh = sheet_('Inspections');
    const layout = sheetLayout_(sh, 'Inspections');
    const last = sh.getLastRow();
    const counts = photoCountsByInspection_();
    const matched = [];
    let skipped = 0;
    if (last >= 2) {
      const values = sh.getRange(2, 1, last - 1, layout.columns.length).getValues();
      values.forEach(function (row) {
        const idIndex = layout.columns.indexOf('inspection_id');
        const id = String(row[idIndex] == null ? '' : row[idIndex]);
        if (!UUID_RE.test(id)) { skipped++; return; }
        const item = historyItem_(recordFromRow_('Inspections', layout, row), counts[id] || 0);
        if (q.areaId && item.areaId !== q.areaId) return;
        if (q.status && item.status !== q.status) return;
        const day = item.observedAt ? item.observedAt.slice(0, 10) : null;
        if (q.from && (!day || day < q.from)) return;
        if (q.to && (!day || day > q.to)) return;
        matched.push(item);
      });
    }
    // ponytail: pemindaian linear seluruh tab; cukup ratusan baris, pindah ke indeks/DB bila riwayat melambat (rencana §16).
    matched.sort(function (a, b) { return String(b.observedAt || '').localeCompare(String(a.observedAt || '')); });
    const page = matched.slice(q.offset, q.offset + q.limit);
    return { inspections: page, matched: matched.length, skipped: skipped, hasMore: q.offset + page.length < matched.length };
  });
}

function getInspection(payload) {
  if (!isObject_(payload)) throw bad_('Payload harus objek');
  const inspectionId = requireUuid_(payload.inspectionId, 'inspectionId');
  return withLock_(function () {
    const loaded = loadInspection_(inspectionId);
    const rec = loaded.rec;
    const photosSheet = sheet_('Photos');
    const layout = sheetLayout_(photosSheet, 'Photos');
    const last = photosSheet.getLastRow();
    const photos = [];
    if (last >= 2) {
      const values = photosSheet.getRange(2, 1, last - 1, layout.columns.length).getValues();
      const idIndex = layout.columns.indexOf('inspection_id');
      values.forEach(function (row) {
        if (String(row[idIndex]) !== inspectionId) return;
        const p = recordFromRow_('Photos', layout, row);
        if (!p.reserved_at) return; // baris skema lama tanpa reservasi gateway bukan foto T2+
        photos.push({
          photoId: String(p.photo_id), status: String(p.status), sha256: String(p.sha256 || ''),
          size: p.size === '' || p.size == null ? null : Number(p.size), mime: String(p.mime || ''), caption: String(p.caption || ''),
          reservedAt: toIso_(p.reserved_at), storedAt: p.stored_at ? toIso_(p.stored_at) : null,
        });
      });
    }
    return {
      inspection: {
        inspectionId: inspectionId, inspectorName: String(rec.inspector_name == null ? '' : rec.inspector_name),
        observedAt: toIso_(rec.observed_at), receivedAt: toIso_(rec.received_at),
        note: String(rec.note == null ? '' : rec.note), status: String(rec.status == null ? '' : rec.status),
        version: Number(rec.version) || 0, schemaVersion: rec.schema_version === '' ? null : Number(rec.schema_version),
        templateVersion: String(rec.template_version == null ? '' : rec.template_version),
        areaId: String(rec.area_id == null ? '' : rec.area_id), subArea: String(rec.sub_area == null ? '' : rec.sub_area),
        checklist: tryJson_(rec.checklist_json), location: tryJson_(rec.location_json),
        photoManifest: tryJson_(rec.photo_manifest_json) || [], reviews: parseReviews_(rec.review_json), photos: photos,
      },
    };
  });
}

function reviewInspection(payload) {
  const v = parseReview_(payload);
  return withLock_(function () {
    const loaded = loadInspection_(v.inspectionId);
    const rec = loaded.rec;
    const reviews = parseReviews_(rec.review_json);
    const existing = reviews.find(function (e) { return e.reviewId === v.review.reviewId; });
    // Replay idempoten: reviewId sama mengembalikan acknowledgment yang sama tanpa menulis.
    if (existing) return reviewResult_(rec, existing);
    if (String(rec.status) !== 'submitted') throw new GatewayError('CONFLICT', 'Review hanya untuk inspeksi yang sudah terkirim');
    const version = Number(rec.version);
    if (!Number.isSafeInteger(version) || version < 1) throw new GatewayError('INTERNAL_ERROR', 'Versi rekaman tidak valid');
    if (version !== v.expectedVersion) throw new GatewayError('VERSION_CONFLICT', 'Versi inspeksi berubah; muat versi terbaru sebelum menyimpan review');
    const checklist = tryJson_(rec.checklist_json);
    const findingIds = checklist && Array.isArray(checklist.answers)
      ? checklist.answers.filter(function (a) { return a && a.answer === 'finding'; }).map(function (a) { return a.itemId; }) : [];
    v.review.findings.forEach(function (f) {
      if (findingIds.indexOf(f.itemId) < 0) throw bad_('Item temuan tidak ada pada inspeksi ini: ' + f.itemId);
    });
    const now = new Date().toISOString();
    const entry = {
      reviewId: v.review.reviewId, reviewerName: v.review.reviewerName, note: v.review.note,
      reviewedAt: now, version: version + 1, findings: v.review.findings,
    };
    rec.review_json = JSON.stringify(reviews.concat([entry]).slice(-MAX_REVIEW_HISTORY));
    rec.version = String(version + 1);
    rec.updated_at = now;
    writeRow_(loaded.sheet, loaded.row, recordValues_(loaded.sheet, 'Inspections', rec));
    return reviewResult_(rec, entry);
  });
}

function reviewResult_(rec, entry) {
  return { inspectionId: String(rec.inspection_id), status: String(rec.status), version: Number(rec.version) || 0, review: entry };
}

function parseHistoryQuery_(payload) {
  const p = payload == null ? {} : payload;
  if (!isObject_(p)) throw bad_('Payload harus objek');
  const out = { areaId: null, status: null, from: null, to: null, limit: 20, offset: 0 };
  if (p.areaId != null && p.areaId !== '') {
    if (!CHECKLISTS.areas.some(function (a) { return a.id === p.areaId; })) throw bad_('Area tidak dikenal');
    out.areaId = p.areaId;
  }
  if (p.status != null && p.status !== '') {
    if (p.status !== 'uploading' && p.status !== 'submitted') throw bad_('Status tidak dikenal');
    out.status = p.status;
  }
  ['from', 'to'].forEach(function (key) {
    const value = p[key];
    if (value == null || value === '') return;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw bad_('Tanggal ' + key + ' harus YYYY-MM-DD');
    out[key] = value;
  });
  if (out.from && out.to && out.from > out.to) throw bad_('Rentang tanggal terbalik');
  if (p.limit != null && p.limit !== '') {
    if (!Number.isSafeInteger(p.limit) || p.limit < 1 || p.limit > MAX_HISTORY_LIMIT) throw bad_('limit harus 1-' + MAX_HISTORY_LIMIT);
    out.limit = p.limit;
  }
  if (p.offset != null && p.offset !== '') {
    if (!Number.isSafeInteger(p.offset) || p.offset < 0) throw bad_('offset tidak valid');
    out.offset = p.offset;
  }
  return out;
}

function parseReview_(payload) {
  if (!isObject_(payload)) throw bad_('Payload harus objek');
  const inspectionId = requireUuid_(payload.inspectionId, 'inspectionId');
  if (!Number.isSafeInteger(payload.expectedVersion) || payload.expectedVersion < 1) throw bad_('expectedVersion tidak valid');
  const r = payload.review;
  if (!isObject_(r)) throw bad_('Review wajib diisi');
  const reviewId = requireUuid_(r.reviewId, 'reviewId');
  const reviewerName = typeof r.reviewerName === 'string' ? r.reviewerName.trim() : '';
  if (!reviewerName || reviewerName.length > 100) throw bad_('Nama reviewer wajib diisi (maksimal 100 karakter)');
  const note = r.note == null ? '' : r.note;
  if (typeof note !== 'string' || note.length > 2000) throw bad_('Catatan review tidak valid (maksimal 2000 karakter)');
  const findings = r.findings == null ? [] : r.findings;
  if (!Array.isArray(findings) || findings.length > 20) throw bad_('Daftar temuan review tidak valid');
  const seen = {};
  const parsed = findings.map(function (f) {
    if (!isObject_(f) || typeof f.itemId !== 'string' || !f.itemId) throw bad_('Item temuan review tidak valid');
    if (seen[f.itemId]) throw bad_('Item temuan review ganda: ' + f.itemId);
    seen[f.itemId] = true;
    if (f.status !== 'open' && f.status !== 'closed') throw bad_('Status temuan harus open atau closed');
    const fnote = f.note == null ? '' : f.note;
    if (typeof fnote !== 'string' || fnote.length > 500) throw bad_('Catatan temuan maksimal 500 karakter');
    return { itemId: f.itemId, status: f.status, note: fnote };
  });
  return { inspectionId: inspectionId, expectedVersion: payload.expectedVersion, review: { reviewId: reviewId, reviewerName: reviewerName, note: note, findings: parsed } };
}

function parseReviews_(raw) {
  const parsed = tryJson_(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(function (e) { return isObject_(e) && typeof e.reviewId === 'string' && typeof e.reviewerName === 'string' && Array.isArray(e.findings); })
    .map(function (e) {
      return {
        reviewId: e.reviewId, reviewerName: e.reviewerName, note: typeof e.note === 'string' ? e.note : '',
        reviewedAt: toIso_(e.reviewedAt) || String(e.reviewedAt || ''), version: Number(e.version) || 0,
        findings: e.findings
          .filter(function (f) { return isObject_(f) && typeof f.itemId === 'string' && (f.status === 'open' || f.status === 'closed'); })
          .map(function (f) { return { itemId: f.itemId, status: f.status, note: typeof f.note === 'string' ? f.note : '' }; }),
      };
    });
}

function historyItem_(rec, photoCount) {
  const id = String(rec.inspection_id);
  const checklist = tryJson_(rec.checklist_json);
  const reviews = parseReviews_(rec.review_json);
  const location = tryJson_(rec.location_json);
  const findings = checklist && Array.isArray(checklist.answers)
    ? checklist.answers.filter(function (a) { return a && a.answer === 'finding'; }) : [];
  let open = 0, closed = 0;
  findings.forEach(function (f) {
    let status = null;
    for (let i = reviews.length - 1; i >= 0 && status == null; i--) {
      const entry = reviews[i].findings.find(function (x) { return x.itemId === f.itemId; });
      if (entry) status = entry.status;
    }
    if (status === 'closed') closed++; else if (status === 'open') open++;
  });
  const latest = reviews.length ? reviews[reviews.length - 1] : null;
  const object = location && isObject_(location.object) ? location.object : null;
  return {
    inspectionId: id, inspectorName: String(rec.inspector_name == null ? '' : rec.inspector_name), observedAt: toIso_(rec.observed_at), receivedAt: toIso_(rec.received_at),
    areaId: String(rec.area_id == null ? '' : rec.area_id), subArea: String(rec.sub_area == null ? '' : rec.sub_area), status: String(rec.status == null ? '' : rec.status),
    version: Number(rec.version) || 0, reviewRequired: !!(checklist && checklist.reviewRequired), findings: { total: findings.length, open: open, closed: closed },
    reviews: reviews.length, lastReviewedAt: latest ? latest.reviewedAt : null, photoCount: photoCount,
    location: object && isFinite(object.latitude) && isFinite(object.longitude) ? { latitude: object.latitude, longitude: object.longitude } : null,
  };
}

function photoCountsByInspection_() {
  const sh = sheet_('Photos');
  const layout = sheetLayout_(sh, 'Photos');
  const last = sh.getLastRow();
  const counts = {};
  if (last >= 2) {
    const values = sh.getRange(2, 1, last - 1, layout.columns.length).getValues();
    const idIndex = layout.columns.indexOf('inspection_id');
    values.forEach(function (row) {
      const id = String(row[idIndex] == null ? '' : row[idIndex]);
      if (id) counts[id] = (counts[id] || 0) + 1;
    });
  }
  return counts;
}

function tryJson_(raw) {
  if (typeof raw !== 'string' || raw === '') return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}

function toIso_(value) {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'string' && value.trim() !== '') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
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
  const layout = sheetLayout_(sh, name);
  if (layout.actualLength < layout.columns.length) {
    // Only write missing header cells at the right; never rewrite old headers or data rows.
    writeRow_(sh, 1, layout.columns.slice(layout.actualLength), layout.actualLength + 1);
  }
  return sh;
}

function sheetLayout_(sh, name) {
  const actual = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  while (actual.length && actual[actual.length - 1] === '') actual.pop();
  const base = STAGING_COLUMNS[name];
  const staging = base.every(function (value, i) { return actual[i] === value; });
  const fields = SHEET_COLUMNS[name].map(function (c) { return staging ? STAGING_FIELD_NAMES[name][c] || c : c; });
  const columns = staging ? base.concat(fields.filter(function (c) { return base.indexOf(c) < 0; })) : SHEET_COLUMNS[name];
  const lengths = staging ? (name === 'Inspections' ? [17, 22, 23, 24, 25, 26] : [10, 14, 15]) : name === 'Inspections' ? [8, 12, 13, 14, 15, 16] : [9, 10];
  if (lengths.indexOf(actual.length) < 0 || !actual.every(function (value, i) { return value === columns[i]; })) {
    throw new GatewayError('INTERNAL_ERROR', 'Header ' + name + ' tidak sesuai; periksa struktur tab sebelum menulis');
  }
  return { columns: columns, fields: fields, actualLength: actual.length };
}

function writeRow_(sh, row, values, column = 1) {
  const range = sh.getRange(row, column, 1, values.length);
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

function recordFromRow_(name, layout, values) {
  const rec = {};
  layout.columns.forEach(function (c, i) { rec[c] = values[i]; });
  // Staging memakai nama kolom lain (reporter_name, workflow_status, revision, checksum); salin ke nama kanonis.
  SHEET_COLUMNS[name].forEach(function (c, i) {
    rec[c] = String(values[layout.columns.indexOf(layout.fields[i])]);
  });
  return rec;
}

function readRecord_(sh, name, row) {
  const layout = sheetLayout_(sh, name);
  const values = sh.getRange(row, 1, 1, layout.columns.length).getValues()[0];
  return recordFromRow_(name, layout, values);
}

function recordValues_(sh, name, rec) {
  const layout = sheetLayout_(sh, name);
  return layout.columns.map(function (c) {
    const i = layout.fields.indexOf(c);
    const value = rec[i < 0 ? c : SHEET_COLUMNS[name][i]];
    return value === undefined ? '' : value;
  });
}

// Memuat foto lewat PASANGAN (inspeksi, foto) yang harus berpasangan. Tanpa aktivasi (keputusan 2026-10-09), pasangan
// ID acak 122 bit inilah satu-satunya penjaga akses baca/tulis ke data yang sudah ada. Panggil di dalam withLock_.
function loadPhoto_(inspectionId, photoId) {
  const sh = sheet_('Photos');
  const row = findRow_(sh, photoId);
  const rec = row ? readRecord_(sh, 'Photos', row) : null;
  if (!rec || rec.inspection_id !== inspectionId || !rec.reserved_at) throw new GatewayError('NOT_FOUND', 'Foto tidak ditemukan dalam reservasi gateway ini');
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
  let manifest = null;
  if (p.submissionVersion !== undefined) {
    if (p.submissionVersion !== 1 || !Array.isArray(p.photoManifest) || p.photoManifest.length !== photoIds.length) throw bad_('Manifest foto tidak valid');
    manifest = p.photoManifest.map(function (photo, i) {
      if (!isObject_(photo) || photo.photoId !== photoIds[i] || typeof photo.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(photo.sha256) || !Number.isInteger(photo.size) || photo.size < 3 || photo.size > MAX_PHOTO_BYTES || typeof photo.caption !== 'string' || photo.caption.trim().length > 500) throw bad_('Isi manifest foto tidak valid');
      return { photoId: photo.photoId, sha256: photo.sha256, size: photo.size, caption: photo.caption.trim() };
    });
    if (p.location == null) throw bad_('Lokasi objek wajib dikonfirmasi');
  }
  let checklist;
  try { checklist = parseChecklist(p); } catch (err) { throw bad_(err.message); }
  let location;
  try { location = parseLocation(p.location, checklist.areaId); } catch (err) { throw bad_(err.message); }
  return { inspectionId: inspectionId, inspectorName: inspectorName, note: note, observedAt: observedAt, photoIds: photoIds,
    checklist: checklist, checklistJson: JSON.stringify(checklist), location: location, locationJson: location ? JSON.stringify(location) : '', manifest: manifest, manifestJson: manifest ? JSON.stringify(manifest) : '' };
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
      writeRow_(loaded.sheet, loaded.row, recordValues_(loaded.sheet, 'Photos', loaded.rec));
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
