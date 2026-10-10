// Batas, kompresi, dan pembantu foto, dipakai browser dan server. Hanya compressPhoto yang memakai API browser,
// dan hanya saat dipanggil, jadi modul ini aman diimpor di Node (route handler dan check).

// Usulan rencana §8, belum diuji dengan foto nyata. MAX_PHOTO_BYTES harus sama dengan apps-script/src/storage.js.
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_LONG_SIDE = 2048;
// 0,8 dari rencana §8. 0,7 dan 0,6 adalah usulan turunan: lantai kualitas belum ditetapkan pengguna.
export const QUALITY_STEPS: readonly number[] = [0.8, 0.7, 0.6];
// Penjaga memori sebelum decode; usulan, perlu diukur di perangkat Android nyata.
export const MAX_SOURCE_BYTES = 32 * 1024 * 1024;

type PhotoErrorCode = 'SOURCE_TOO_LARGE' | 'UNSUPPORTED' | 'ENCODE_FAILED' | 'CANNOT_FIT';

export class PhotoError extends Error {
  code: PhotoErrorCode;
  constructor(code: PhotoErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export async function sha256Hex(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Sisi panjang <= maxSide dengan rasio tetap; tidak pernah memperbesar dan tidak pernah menghasilkan sisi 0.
export function fitWithin(width: number, height: number, maxSide = MAX_LONG_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Mencoba kualitas turun bertahap dan berhenti di hasil pertama yang muat. null = semua langkah melewati batas;
// pemanggil harus menolak foto itu (jangan diunggah diam-diam). Encoder gagal bukan "tidak muat".
export async function encodeWithinLimit(
  encode: (quality: number) => Promise<Blob | null>,
  maxBytes = MAX_PHOTO_BYTES,
  steps: readonly number[] = QUALITY_STEPS,
): Promise<{ blob: Blob; quality: number } | null> {
  for (const quality of steps) {
    const blob = await encode(quality);
    if (!blob) throw new PhotoError('ENCODE_FAILED', 'Perangkat gagal memproses foto. Ambil ulang.');
    if (blob.size <= maxBytes) return { blob, quality };
  }
  return null;
}

// Salinan kerja JPEG: orientasi EXIF diterapkan ke piksel (hasil tidak bergantung pada penampil), latar putih untuk
// gambar transparan, EXIF (termasuk GPS dan jam kamera) tidak ikut. Satu foto per panggilan agar memori terkendali.
// ponytail: seluruh gambar didekode dulu sebelum diperkecil, jadi memori puncak ~ resolusi asli (12 MP ≈ 48 MB RGBA).
// Gagal decode ditangkap sebagai UNSUPPORTED; bila perangkat lemah gagal, ganti ke pengecilan saat decode
// (createImageBitmap resizeWidth) atau kurangi MAX_SOURCE_BYTES.
export async function compressPhoto(file: File): Promise<{ blob: Blob; width: number; height: number; quality: number }> {
  const MB = 1024 * 1024;
  if (file.size > MAX_SOURCE_BYTES) {
    throw new PhotoError('SOURCE_TOO_LARGE', `Foto asli lebih dari ${MAX_SOURCE_BYTES / MB} MB. Ambil ulang dengan resolusi lebih rendah.`);
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoError('UNSUPPORTED', 'Foto tidak bisa dibaca: file rusak, format tidak didukung perangkat, atau terlalu besar untuk memori. Ambil ulang atau pilih JPEG/PNG.');
  }
  const canvas = document.createElement('canvas');
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PhotoError('ENCODE_FAILED', 'Perangkat gagal memproses foto. Ambil ulang.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    const result = await encodeWithinLimit((quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality)));
    if (!result) {
      throw new PhotoError('CANNOT_FIT', `Foto tidak bisa dikecilkan sampai ${MAX_PHOTO_BYTES / MB} MB tanpa menurunkan kualitas di bawah batas minimum. Ambil ulang.`);
    }
    return { ...result, width, height };
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0; // lepaskan memori kanvas segera
  }
}
