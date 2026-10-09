// Gateway Apps Script: satu-satunya jalur ke Sheets/Drive. Browser tidak pernah memanggilnya; hanya server Next
// yang mengirim pesan bertanda tangan HMAC. Web app dipasang "Execute as: Me".
// Semua hasil, termasuk galat, dikembalikan sebagai payload {ok, ...}: Apps Script tidak memberi kontrol status HTTP.
// Aturan antar-file: jangan merujuk simbol file lain saat load (urutan file tidak dijamin); rujuk di dalam fungsi.

const SCHEMA_VERSION = 2;
// Naikkan setiap perubahan perilaku gateway. Muncul di doGet agar kode lama yang belum di-deploy ulang (versi deployment
// web app tidak ikut berubah saat kode di editor diganti) terlihat dari luar, tanpa rahasia.
const GATEWAY_BUILD = '2026-10-09.3';
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000; // usulan; belum diukur di jaringan lapangan
const REPLAY_TTL_SECONDS = 10 * 60; // > 2x skew agar pesan kedaluwarsa pun tidak bisa diputar ulang
const MAX_REQUEST_CHARS = 4 * 1024 * 1024; // foto 2 MB -> base64 ~2,7 MB; sisanya margin
const LOCK_WAIT_MS = 10 * 1000;

class GatewayError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function doGet() {
  // Health check tanpa rahasia: membedakan "gateway hidup" dari "akses deployment diblokir kebijakan".
  return json_({ ok: true, service: 'geotech-gateway', schemaVersion: SCHEMA_VERSION, build: GATEWAY_BUILD });
}

function doPost(e) {
  try {
    return json_(handle_(e));
  } catch (err) {
    if (err instanceof GatewayError) return json_({ ok: false, code: err.code, message: err.message });
    // Galat tak terduga = hasil belum diketahui. Semua action idempoten menurut ID, jadi aman diulang.
    // Log hanya pesan galat, tidak pernah payload.
    console.error('doPost gagal: ' + String(err && err.message));
    return json_({ ok: false, code: 'RETRYABLE_ERROR', message: 'Kesalahan sementara; ulangi dengan ID yang sama' });
  }
}

function handle_(e) {
  const rawBody = e && e.postData && e.postData.contents;
  if (typeof rawBody !== 'string' || rawBody.length > MAX_REQUEST_CHARS) throw unauthorized_();
  let envelope;
  try {
    envelope = JSON.parse(rawBody);
  } catch (err) {
    throw unauthorized_();
  }
  if (!envelope || typeof envelope.msg !== 'string' || typeof envelope.sig !== 'string') throw unauthorized_();

  const secret = props_().getProperty('GATEWAY_HMAC_SECRET');
  if (!secret) throw new GatewayError('INTERNAL_ERROR', 'Gateway belum dikonfigurasi');
  // Tanda tangan dihitung atas string `msg` persis seperti diterima: tidak perlu kanonisasi JSON.
  if (!safeEqual_(hmacHex_(envelope.msg, secret), envelope.sig)) throw unauthorized_();

  // Sejak di sini pesan berasal dari server kita; galat bentuk = VALIDATION_ERROR, bukan UNAUTHORIZED.
  let m;
  try {
    m = JSON.parse(envelope.msg);
  } catch (err) {
    throw new GatewayError('VALIDATION_ERROR', 'Pesan tidak valid');
  }
  if (!m || m.v !== 1 || typeof m.action !== 'string') throw new GatewayError('VALIDATION_ERROR', 'Pesan tidak valid');
  if (typeof m.ts !== 'number' || Math.abs(Date.now() - m.ts) > MAX_CLOCK_SKEW_MS) throw unauthorized_();
  if (typeof m.requestId !== 'string' || !UUID_RE.test(m.requestId)) throw new GatewayError('VALIDATION_ERROR', 'requestId tidak valid');

  // ponytail: CacheService bersifat best-effort (bisa terhapus lebih awal, ada celah balapan antar eksekusi paralel).
  // Aman karena action idempoten menurut ID; ganti ke tabel nonce di Sheets bila replay perlu ditutup mutlak.
  const cache = CacheService.getScriptCache();
  if (cache.get('rq:' + m.requestId)) throw new GatewayError('REPLAY', 'requestId sudah dipakai');
  cache.put('rq:' + m.requestId, '1', REPLAY_TTL_SECONDS);

  const handler = lookupAction_(m.action);
  if (!handler) throw new GatewayError('VALIDATION_ERROR', 'Action tidak dikenal');
  // Keputusan pengguna 2026-10-09: tanpa aktivasi perangkat. Tidak ada identitas pemanggil; pesan sudah dipastikan
  // berasal dari server Next (HMAC), dan data lama hanya terjangkau lewat pasangan ID inspeksi + foto (UUID acak).
  return { ok: true, requestId: m.requestId, result: handler(m.payload) };
}

// Allowlist action. Di dalam fungsi (bukan tabel top-level) agar tidak bergantung pada urutan load file.
function lookupAction_(name) {
  switch (name) {
    case 'prepareInspection':
      return prepareInspection;
    case 'uploadPhoto':
      return uploadPhoto;
    case 'getPhoto':
      return getPhoto;
    default:
      return null;
  }
}

// ---- Pembantu ----

function props_() {
  return PropertiesService.getScriptProperties();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function unauthorized_() {
  return new GatewayError('UNAUTHORIZED', 'Pesan tidak sah');
}

function bytesToHex_(bytes) {
  // Byte Apps Script bertanda (-128..127): & 0xff sebelum diformat.
  return bytes
    .map(function (b) {
      return ((b & 0xff) + 0x100).toString(16).slice(1);
    })
    .join('');
}

function hmacHex_(msg, key) {
  return bytesToHex_(Utilities.computeHmacSha256Signature(msg, key, Utilities.Charset.UTF_8));
}

function sha256Hex_(value) {
  return typeof value === 'string'
    ? bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8))
    : bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value));
}

function md5Hex_(bytes) {
  return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bytes));
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Lock global untuk operasi Sheets singkat; tidak pernah membungkus transfer byte foto.
// ponytail: satu lock skrip serial untuk semua penulisan; cukup untuk dua petugas, ganti ke DB bila antre mengganggu (rencana §16).
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) throw new GatewayError('RETRYABLE_ERROR', 'Gateway sibuk; ulangi');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
