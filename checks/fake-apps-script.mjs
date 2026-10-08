// Runtime Apps Script palsu (di memori) agar apps-script/src/*.js bisa dijalankan apa adanya di Node.
//
// Yang ditiru karena memengaruhi logika kita: byte bertanda (-128..127), sel Sheets yang mengubah
// string tanggal/angka menjadi Date/Number bila formatnya bukan teks, ID file Drive harus dari
// generateIds dan tidak boleh dobel, lock tidak reentrant, dan web app yang membalas lewat redirect 302.
// Yang TIDAK ditiru: kuota, latensi, batas ukuran body, izin/akses nyata, Shared Drive.
// Lulus di sini bukan bukti bahwa Apps Script sungguhan berjalan benar; itu butuh uji staging (checks/live.mjs).
import vm from 'node:vm';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps-script', 'src');
const signed = (buf) => Array.from(buf, (b) => (b << 24) >> 24);
const raw = (v) => (typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map((b) => b & 0xff)));
const md5 = (bytes) => crypto.createHash('md5').update(bytes).digest('hex');

export function createFakeAppsScript({ secret, spreadsheetId = 'sheet-test', rootFolderId = 'root-test' }) {
  const state = {
    files: new Map(),
    creates: 0, // jumlah percobaan Drive.Files.create (termasuk yang ditolak)
    issuedIds: new Set(),
    sheets: new Map(),
    props: new Map([
      ['GATEWAY_HMAC_SECRET', secret],
      ['SPREADSHEET_ID', spreadsheetId],
      ['PHOTO_ROOT_FOLDER_ID', rootFolderId],
    ]),
    cache: new Map(),
    locked: false,
    hooks: {}, // onSetValues({ sheet, row, values }) boleh melempar untuk menyuntik kegagalan
    logs: [],
  };

  const Utilities = {
    DigestAlgorithm: { MD5: 'md5', SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    getUuid: () => crypto.randomUUID(),
    computeDigest: (alg, value) => signed(crypto.createHash(alg).update(raw(value)).digest()),
    computeHmacSha256Signature: (value, key) => signed(crypto.createHmac('sha256', raw(key)).update(raw(value)).digest()),
    base64Decode: (s) => {
      if (typeof s !== 'string' || s.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('Invalid base64');
      return signed(Buffer.from(s, 'base64'));
    },
    base64Encode: (v) => raw(v).toString('base64'),
    newBlob: (bytes, contentType, name) => ({ getBytes: () => bytes, getContentType: () => contentType, getName: () => name }),
  };

  function makeSheet(name) {
    const rows = [];
    const textCells = new Set();
    return {
      name,
      rows,
      getLastRow() {
        let last = rows.length;
        while (last > 0 && (rows[last - 1] ?? []).every((v) => v === '' || v === undefined)) last--;
        return last;
      },
      getRange(r, c, nr = 1, nc = 1) {
        return {
          getValues: () =>
            Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => rows[r - 1 + i]?.[c - 1 + j] ?? '')),
          setNumberFormat(format) {
            if (format === '@') for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) textCells.add(`${r + i},${c + j}`);
            return this;
          },
          setValues(values) {
            if (values.length !== nr || values.some((row) => row.length !== nc)) throw new Error('Dimensi data tidak sama dengan dimensi range');
            state.hooks.onSetValues?.({ sheet: name, row: r, values });
            values.forEach((rowValues, i) =>
              rowValues.forEach((v, j) => {
                let stored = v;
                if (typeof v === 'string' && !textCells.has(`${r + i},${c + j}`)) {
                  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) stored = new Date(v); // Sheets mengubah string tanggal menjadi Date
                  else if (/^\d+$/.test(v)) stored = Number(v); // dan string angka menjadi Number
                }
                (rows[r - 1 + i] ??= [])[c - 1 + j] = stored;
              }),
            );
            return this;
          },
        };
      },
    };
  }

  const SpreadsheetApp = {
    openById(id) {
      if (id !== spreadsheetId) throw new Error('No item with the given ID could be found');
      return {
        getSheetByName: (n) => state.sheets.get(n) ?? null,
        insertSheet: (n) => state.sheets.set(n, makeSheet(n)).get(n),
      };
    },
  };

  const Drive = {
    Files: {
      generateIds({ count }) {
        const ids = Array.from({ length: count }, () => 'F' + crypto.randomBytes(16).toString('hex'));
        ids.forEach((id) => state.issuedIds.add(id));
        return { ids };
      },
      create(resource, blob) {
        state.creates++;
        if (!state.issuedIds.has(resource.id)) throw new Error('Invalid Value: ID tidak berasal dari generateIds');
        if (state.files.has(resource.id)) throw new Error(`Invalid Value: file ID sudah ada (${resource.id})`);
        if (JSON.stringify(resource.parents) !== JSON.stringify([rootFolderId])) throw new Error('Folder induk salah');
        state.files.set(resource.id, { name: resource.name, mimeType: resource.mimeType, bytes: raw(blob.getBytes()), trashed: false });
        return { id: resource.id };
      },
      get(id) {
        const f = state.files.get(id);
        if (!f) throw new Error('File not found: ' + id);
        return { id, size: String(f.bytes.length), md5Checksum: md5(f.bytes), trashed: f.trashed };
      },
    },
  };

  const DriveApp = {
    getFolderById: () => ({
      getFilesByName(name) {
        const hits = [...state.files.values()].filter((f) => f.name === name && !f.trashed);
        let i = 0;
        return { hasNext: () => i < hits.length, next: () => hits[i++] };
      },
    }),
    getFileById(id) {
      const f = state.files.get(id);
      if (!f) throw new Error('File not found: ' + id);
      return {
        getBlob: () => ({ getBytes: () => signed(f.bytes) }),
        setTrashed(trashed) {
          f.trashed = trashed;
        },
      };
    },
  };

  const props = {
    getProperty: (k) => state.props.get(k) ?? null,
    setProperty(k, v) {
      if (typeof v !== 'string') throw new Error('Nilai properti harus string');
      state.props.set(k, v);
    },
    deleteProperty: (k) => void state.props.delete(k),
    getKeys: () => [...state.props.keys()],
  };

  const cache = {
    get(k) {
      const e = state.cache.get(k);
      return e && e.exp > Date.now() ? e.v : null;
    },
    put: (k, v, ttlSeconds) => void state.cache.set(k, { v, exp: Date.now() + ttlSeconds * 1000 }),
  };

  const lock = {
    tryLock() {
      if (state.locked) return false; // lock sungguhan menunggu lalu gagal; di sini langsung gagal agar nesting terdeteksi
      state.locked = true;
      return true;
    },
    releaseLock() {
      state.locked = false;
    },
  };

  const ctx = vm.createContext({
    Utilities,
    SpreadsheetApp,
    Drive,
    DriveApp,
    PropertiesService: { getScriptProperties: () => props },
    CacheService: { getScriptCache: () => cache },
    LockService: { getScriptLock: () => lock },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (s) => ({ setMimeType() { return this; }, getContent: () => s }),
    },
    console: { log: (...a) => state.logs.push(a.join(' ')), error: (...a) => state.logs.push(a.join(' ')) },
  });
  for (const file of ['gateway.js', 'storage.js']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), ctx, { filename: file });
  }
  const run = (expr) => vm.runInContext(expr, ctx);

  return {
    state,
    run,
    doPost: (contents) => run('doPost')({ postData: { contents, type: 'text/plain' } }).getContent(),
    doGet: () => run('doGet')({}).getContent(),
    createActivationCode: (name) => run('adminCreateActivationCode')(name),
    revokeDevice: (id) => run('adminRevokeDevice')(id),
    listDevices: () => run('adminListDevices')(),
  };
}

// Server HTTP lokal yang meniru web app Apps Script: POST dieksekusi, lalu dibalas 302 ke URL hasil.
// control.dropNext = n: n permintaan berikutnya DIEKSEKUSI tetapi tidak pernah dibalas (respons hilang).
export async function startFakeGateway(fake) {
  const outputs = new Map();
  const control = { dropNext: 0, requests: 0 };
  let seq = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fake');
    if (req.method === 'GET' && url.pathname.startsWith('/echo/')) {
      const out = outputs.get(url.pathname.slice('/echo/'.length));
      res.writeHead(out ? 200 : 404, { 'content-type': 'application/json' }).end(out ?? '');
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      control.requests++;
      const out = req.method === 'POST' ? fake.doPost(Buffer.concat(chunks).toString('utf8')) : fake.doGet();
      if (control.dropNext > 0) {
        control.dropNext--;
        return;
      }
      const id = String(++seq);
      outputs.set(id, out);
      res.writeHead(302, { location: `/echo/${id}` }).end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/exec`,
    control,
    close: () => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
