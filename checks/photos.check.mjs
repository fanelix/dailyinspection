// Logika murni kompresi foto (tanpa browser): ukuran target dan tangga kualitas.
// Bagian yang butuh browser (orientasi EXIF, latar putih untuk PNG transparan) diverifikasi di Chromium, bukan di sini.
// Jalankan: node --test checks/photos.check.mjs   (atau: npm run check)
import test from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin, encodeWithinLimit, PhotoError, QUALITY_STEPS, MAX_LONG_SIDE, MAX_PHOTO_BYTES } from '../lib/photos.ts';

const blobOf = (n) => new Blob([new Uint8Array(n)]);

test('fitWithin: sisi panjang <= batas, rasio tetap, tidak pernah memperbesar atau menghasilkan 0', () => {
  assert.equal(MAX_LONG_SIDE, 2048, 'batas awal dari rencana §8');
  assert.deepEqual(fitWithin(4000, 3000), { width: 2048, height: 1536 });
  assert.deepEqual(fitWithin(3000, 4000), { width: 1536, height: 2048 }, 'potret: sisi panjang = tinggi');
  assert.deepEqual(fitWithin(2048, 1000), { width: 2048, height: 1000 }, 'tepat di batas: tidak berubah');
  assert.deepEqual(fitWithin(1000, 800), { width: 1000, height: 800 }, 'lebih kecil dari batas: tidak diperbesar');
  assert.deepEqual(fitWithin(5000, 1), { width: 2048, height: 1 }, 'sisi pendek tidak pernah 0');
  assert.deepEqual(fitWithin(4001, 3001), { width: 2048, height: 1536 });
});

test('encodeWithinLimit: kualitas turun bertahap, berhenti di hasil pertama yang muat', async () => {
  assert.equal(QUALITY_STEPS[0], 0.8, 'kualitas awal dari rencana §8');
  assert.ok(QUALITY_STEPS.every((q, i) => q > 0 && q <= 1 && (i === 0 || q < QUALITY_STEPS[i - 1])), 'menurun ketat dalam (0, 1]');

  // hanya langkah ke-2 yang muat
  const calls = [];
  const second = await encodeWithinLimit(async (q) => {
    calls.push(q);
    return blobOf(q === QUALITY_STEPS[1] ? MAX_PHOTO_BYTES - 1 : MAX_PHOTO_BYTES + 1);
  });
  assert.equal(second.quality, QUALITY_STEPS[1]);
  assert.deepEqual(calls, QUALITY_STEPS.slice(0, 2), 'tidak mengencode lagi setelah ada yang muat');

  // langsung muat, tepat di batas (<= batas)
  const callsFirst = [];
  const first = await encodeWithinLimit(async (q) => (callsFirst.push(q), blobOf(MAX_PHOTO_BYTES)));
  assert.equal(first.quality, QUALITY_STEPS[0]);
  assert.equal(callsFirst.length, 1);

  // tidak ada yang muat: null, semua langkah dicoba, tanpa mengunggah foto lebih besar dari batas
  const callsNone = [];
  const none = await encodeWithinLimit(async (q) => (callsNone.push(q), blobOf(MAX_PHOTO_BYTES + 1)));
  assert.equal(none, null);
  assert.deepEqual(callsNone, QUALITY_STEPS);
});

test('encodeWithinLimit: encoder gagal (toBlob = null) menjadi ENCODE_FAILED, bukan "tidak muat"', async () => {
  await assert.rejects(
    () => encodeWithinLimit(async () => null),
    (err) => err instanceof PhotoError && err.code === 'ENCODE_FAILED',
  );
});
