// Batas dan pembantu foto yang dipakai browser dan server (sengaja tanpa modul khusus Node).
// Kompresi/orientasi menyusul di T4.

// Usulan rencana §8, belum diuji dengan foto nyata. Harus sama dengan MAX_PHOTO_BYTES di apps-script/src/storage.js.
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export async function sha256Hex(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
